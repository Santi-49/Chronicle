/** FIFO worker that turns queued versions into annotations and embeddings. */
import fs from 'node:fs/promises'
import type { AppSettings } from '../../shared/settings'
import { formatForPath } from '../../shared/formats'
import type { ChronicleDb } from '../db/database'
import {
  bumpJobRetry,
  deleteJob,
  enqueueJob,
  failJob,
  getAnnotation,
  getAsset,
  getVersion,
  listJobs,
  listVersions,
  saveAnnotation,
  saveEmbedding,
  setVersionAiStatus,
  type QueueItem,
  type QueueFailure,
} from '../db/repositories'
import type { EmitEvent } from '../ipc/channels'
import { embeddingModelIdentity } from '../search'
import { libraryFilePathFor } from '../versioning'
import {
  AiServiceError,
  type AiClient,
  type AnnotateRequest,
  type ProviderRequest,
} from './client'
import { createAnnotationCapabilities, type AnnotationCapabilities } from './capabilities'
import type { TelemetryCollector } from '../telemetry/emitter'
import type { ApplicationDiagnosticSink } from '../diagnostics'
import { diagnosticError } from '../diagnostics'
import type { AiCallRecord } from '../analytics/repository'

const MAX_ATTEMPTS = 3
export const EMBEDDING_BATCH_SIZE = 16

export interface AiWorker {
  start(): void
  wake(): void
  /** Process at most one queued job; public for deterministic tests. */
  runOnce(): Promise<void>
  stop(): void
}

export interface AiWorkerDependencies {
  db: ChronicleDb
  libraryRoot: string
  client: AiClient
  emit: EmitEvent
  getSettings: () => Promise<AppSettings>
  readApiKey: (provider: string) => string | null
  isOnline: () => boolean
  ensureService: () => void
  onQueueChanged: () => void
  telemetry?: Pick<TelemetryCollector, 'recordAiUsage'>
  personalAnalytics?: {
    recordAiCall: (call: AiCallRecord) => void
    recordActivity: (kind: 'ai-summary', values: { assetId: number }) => void
  }
  diagnostic?: ApplicationDiagnosticSink
  /**
   * What the running service reports it can annotate. Shared with the C1 read
   * paths so the queue and the UI agree on what is deferred. Omitted in tests
   * that do not exercise capability negotiation.
   */
  capabilities?: AnnotationCapabilities
  pollMs?: number
}

type AnnotationInput = AnnotateRequest['current']

/**
 * The C3 request values for a captured file, or null when the registry never
 * annotates that format. Null is not an error: the annotation job stays queued
 * and drains by itself if support is added later (spec F4).
 */
export function annotationFormatFor(filePath: string): AnnotationInput | null {
  const format = formatForPath(filePath)
  if (!format || format.aiFormat === null) return null
  return {
    base64: '',
    // C3 keeps a media type beside the format; the registry owns the mapping.
    mediaType: format.mediaType as AnnotationInput['mediaType'],
    format: format.aiFormat as AnnotationInput['format'],
  }
}

function versionIdOf(job: QueueItem): number | null {
  const payload = job.payload as { versionId?: unknown } | null
  return typeof payload?.versionId === 'number' ? payload.versionId : null
}

export function createAiWorker(deps: AiWorkerDependencies): AiWorker {
  let timer: NodeJS.Timeout | undefined
  let running = false
  let stopped = false
  const capabilities = deps.capabilities ?? createAnnotationCapabilities(deps.client)
  const diagnostic: ApplicationDiagnosticSink = deps.diagnostic ?? (() => {})

  async function providerConfig(kind: 'chat' | 'embeddings'): Promise<ProviderRequest | null> {
    const settings = await deps.getSettings()
    const selected = settings.ai[kind]
    if (!selected.provider || !selected.model) return null
    const apiKey = deps.readApiKey(selected.provider)
    if (!apiKey) return null
    return { provider: selected.provider, model: selected.model, apiKey }
  }

  async function image(versionId: number, shape: AnnotationInput): Promise<AnnotationInput> {
    const version = getVersion(deps.db, versionId)
    if (!version) throw new Error(`Unknown version ${versionId}`)
    const bytes = await fs.readFile(libraryFilePathFor(deps.libraryRoot, version.contentHash))
    return { ...shape, base64: bytes.toString('base64') }
  }

  function failureDetails(error: unknown): QueueFailure {
    if (error instanceof AiServiceError) {
      return { message: error.message, code: error.code, status: error.status }
    }
    return {
      message: error instanceof Error ? error.message : String(error),
      code: null,
      status: null,
    }
  }

  function markFailed(job: QueueItem, versionId: number | null, error: unknown): void {
    failJob(deps.db, job.id, failureDetails(error))
    if (versionId !== null && job.jobType === 'ai_annotation') {
      setVersionAiStatus(deps.db, versionId, 'failed')
      deps.emit('annotationUpdated', { versionId, aiStatus: 'failed' })
    }
    deps.onQueueChanged()
  }

  function handleFailure(job: QueueItem, versionId: number | null, error: unknown): void {
    // A non-retryable service error (4xx: bad key, invalid request, invalid
    // model output) will fail identically on every attempt — fail fast instead
    // of burning all three. Retryable errors (5xx, network) back off and retry.
    const nonRetryable = error instanceof AiServiceError && !error.retryable
    const finalAttempt = job.retryCount + 1 >= MAX_ATTEMPTS
    const willRetry = !nonRetryable && !finalAttempt
    diagnostic({
      level: 'error',
      source: 'ai',
      event: job.jobType === 'ai_annotation'
        ? 'summary_generation_failed'
        : 'embedding_generation_failed',
      message: job.jobType === 'ai_annotation'
        ? `Failed to generate a summary for version ${versionId ?? 'unknown'}.`
        : `Failed to generate an embedding for version ${versionId ?? 'unknown'}.`,
      context: {
        jobId: job.id,
        versionId,
        attempt: job.retryCount + 1,
        willRetry,
        error: diagnosticError(error),
      },
    })
    if (nonRetryable) {
      markFailed(job, versionId, error)
      return
    }
    if (finalAttempt) {
      markFailed(job, versionId, error)
    } else {
      bumpJobRetry(deps.db, job.id)
      deps.onQueueChanged()
    }
  }

  async function processAnnotation(
    job: QueueItem,
    versionId: number,
    config: ProviderRequest,
  ): Promise<void> {
    const version = getVersion(deps.db, versionId)
    if (!version) {
      deleteJob(deps.db, job.id)
      return
    }
    const asset = getAsset(deps.db, version.assetId)
    if (!asset) {
      deleteJob(deps.db, job.id)
      return
    }
    const previous = listVersions(deps.db, version.assetId).find(
      (candidate) => candidate.versionNumber === version.versionNumber - 1,
    )
    const startedAt = Date.now()
    // drainOne only selects jobs whose format is supported, so this is set.
    const shape = annotationFormatFor(asset.path)
    if (!shape) return
    const annotation = await deps.client.annotate({
      ...config,
      fileName: asset.displayName,
      format: shape.format,
      previous: previous ? await image(previous.id, shape) : null,
      current: await image(version.id, shape),
    })

    const latencyMs = Date.now() - startedAt
    deps.personalAnalytics?.recordAiCall({
      operation: 'annotation',
      provider: config.provider,
      model: config.model,
      success: true,
      latencyMs,
      inputTokens: annotation.usage?.input_tokens,
      outputTokens: annotation.usage?.output_tokens,
      totalTokens: annotation.usage?.total_tokens,
    })
    saveAnnotation(deps.db, {
      versionId,
      summary: annotation.summary,
      changes: annotation.changes,
      tags: annotation.tags,
      provider: config.provider,
      model: config.model,
      latencyMs,
    })
    deleteJob(deps.db, job.id)
    deps.personalAnalytics?.recordActivity('ai-summary', { assetId: version.assetId })
    deps.telemetry?.recordAiUsage('annotation', config.provider, config.model, 'success', latencyMs)
    if (!listJobs(deps.db, 'embedding').some((item) => versionIdOf(item) === versionId)) {
      enqueueJob(deps.db, 'embedding', { versionId })
    }
    deps.emit('annotationUpdated', { versionId, aiStatus: 'done' })
    deps.onQueueChanged()
    diagnostic({
      level: 'debug',
      source: 'ai',
      event: 'summary_generated',
      message: `Generated a summary for ${asset.displayName} version ${version.versionNumber}.`,
      context: {
        jobId: job.id,
        versionId,
        assetId: asset.id,
        provider: config.provider,
        model: config.model,
        latencyMs,
      },
    })
  }

  async function processEmbeddingBatch(
    jobs: QueueItem[],
    config: ProviderRequest,
  ): Promise<void> {
    const items: Array<{
      job: QueueItem
      versionId: number
      sourceText: string
    }> = []
    for (const job of jobs) {
      const versionId = versionIdOf(job)
      const annotation = versionId === null ? undefined : getAnnotation(deps.db, versionId)
      if (versionId === null || !annotation) {
        deleteJob(deps.db, job.id)
        continue
      }
      items.push({
        job,
        versionId,
        sourceText: `${annotation.summary}\n${annotation.tags.join(' ')}`,
      })
    }
    if (items.length === 0) {
      deps.onQueueChanged()
      return
    }

    const embeddingStart = Date.now()
    const result = await deps.client.embedTexts({
      ...config,
      texts: items.map((item) => item.sourceText),
    })
    if (result.embeddings.length !== items.length) {
      throw new Error(
        `AI service returned ${result.embeddings.length} embeddings for ${items.length} jobs`,
      )
    }
    const embeddingLatency = Date.now() - embeddingStart
    items.forEach((item, index) => {
      saveEmbedding(deps.db, {
        versionId: item.versionId,
        vector: Float32Array.from(result.embeddings[index]!),
        sourceText: item.sourceText,
        model: embeddingModelIdentity(config.provider, config.model),
      })
      deleteJob(deps.db, item.job.id)
      diagnostic({
        level: 'debug',
        source: 'ai',
        event: 'embedding_generated',
        message: `Generated an embedding for version ${item.versionId}.`,
        context: {
          jobId: item.job.id,
          versionId: item.versionId,
          batchSize: items.length,
          provider: config.provider,
          model: config.model,
          latencyMs: embeddingLatency,
        },
      })
    })
    deps.personalAnalytics?.recordAiCall({
      operation: 'embedding',
      provider: config.provider,
      model: config.model,
      success: true,
      latencyMs: embeddingLatency,
      inputTokens: result.usage?.input_tokens,
      outputTokens: result.usage?.output_tokens,
      totalTokens: result.usage?.total_tokens,
    })
    deps.telemetry?.recordAiUsage('embedding', config.provider, config.model, 'success', embeddingLatency)
    deps.onQueueChanged()
  }

  /**
   * True when this job can be attempted now. An annotation job for a format the
   * running service cannot annotate is skipped — not failed and not retried —
   * so it drains automatically once a service that supports it is running.
   * Skipping (rather than returning) matters: otherwise one deferred job would
   * block the whole FIFO queue behind it.
   */
  async function isProcessable(job: QueueItem): Promise<boolean> {
    if (job.jobType !== 'ai_annotation') return true
    const versionId = versionIdOf(job)
    const version = versionId === null ? undefined : getVersion(deps.db, versionId)
    const asset = version ? getAsset(deps.db, version.assetId) : undefined
    // A job whose version or asset vanished is handled (deleted) by drainOne.
    if (!asset) return true
    const shape = annotationFormatFor(asset.path)
    if (!shape) return false
    // An older sidecar may not accept a format this build's registry declares.
    // Skipping keeps the job queued instead of failing it.
    const supported = await capabilities.formats()
    return supported === null || supported.includes(shape.format)
  }

  async function drainOne(): Promise<void> {
    if (running || stopped || !deps.isOnline()) return
    const candidates = listJobs(deps.db).filter(
      (candidate) =>
        candidate.status === 'pending' &&
        (candidate.jobType === 'ai_annotation' || candidate.jobType === 'embedding'),
    )
    let job: QueueItem | undefined
    for (const candidate of candidates) {
      if (await isProcessable(candidate)) {
        job = candidate
        break
      }
    }
    if (!job) return
    const jobs = job.jobType === 'embedding'
      ? candidates
          .filter((candidate) => candidate.jobType === 'embedding')
          .slice(0, EMBEDDING_BATCH_SIZE)
      : [job]
    const versionId = versionIdOf(job)
    if (versionId === null) {
      deleteJob(deps.db, job.id)
      deps.onQueueChanged()
      return
    }
    const operation = job.jobType === 'ai_annotation' ? 'annotation' : 'embedding'
    const config = await providerConfig(job.jobType === 'ai_annotation' ? 'chat' : 'embeddings')
    if (!config) return
    deps.ensureService()
    if (!(await deps.client.health())) return

    running = true
    const startedAt = Date.now()
    try {
      if (job.jobType === 'ai_annotation') await processAnnotation(job, versionId, config)
      else await processEmbeddingBatch(jobs, config)
    } catch (error) {
      deps.personalAnalytics?.recordAiCall({
        operation,
        provider: config.provider,
        model: config.model,
        success: false,
        latencyMs: Date.now() - startedAt,
        errorCode: error instanceof AiServiceError ? error.code : null,
      })
      deps.telemetry?.recordAiUsage(
        operation, config.provider, config.model, 'failure', Date.now() - startedAt,
      )
      if (job.jobType === 'embedding') {
        for (const batchJob of jobs) {
          handleFailure(batchJob, versionIdOf(batchJob), error)
        }
      } else {
        handleFailure(job, versionId, error)
      }
    } finally {
      running = false
    }
  }

  function schedule(): void {
    if (stopped) return
    void drainOne()
    timer = setTimeout(schedule, deps.pollMs ?? 2_000)
    timer.unref()
  }

  return {
    start(): void {
      stopped = false
      if (!timer) schedule()
    },
    wake(): void {
      void drainOne()
    },
    runOnce: drainOne,
    stop(): void {
      stopped = true
      if (timer) clearTimeout(timer)
      timer = undefined
    },
  }
}
