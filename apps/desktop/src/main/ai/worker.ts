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
import type { TelemetryCollector } from '../telemetry/emitter'
import type { ApplicationDiagnosticSink } from '../diagnostics'
import { diagnosticError } from '../diagnostics'

const MAX_ATTEMPTS = 3

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
  diagnostic?: ApplicationDiagnosticSink
  pollMs?: number
}

type AnnotationInput = AnnotateRequest['current']

/**
 * The C3 request values for a captured file, or null when the AI service has no
 * adapter for its format yet. Null is not an error: the annotation job stays
 * queued and drains once support ships (POST-02).
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
  /** undefined = not asked yet, null = the service reported nothing. */
  let capabilities: string[] | null | undefined
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

  async function processEmbedding(
    job: QueueItem,
    versionId: number,
    config: ProviderRequest,
  ): Promise<void> {
    const annotation = getAnnotation(deps.db, versionId)
    if (!annotation) {
      deleteJob(deps.db, job.id)
      return
    }

    const sourceText = `${annotation.summary}\n${annotation.tags.join(' ')}`
    const embeddingStart = Date.now()
    const result = await deps.client.embedText({ ...config, text: sourceText })
    saveEmbedding(deps.db, {
      versionId,
      vector: Float32Array.from(result.embedding),
      sourceText,
      model: embeddingModelIdentity(config.provider, config.model),
    })
    const embeddingLatency = Date.now() - embeddingStart
    deleteJob(deps.db, job.id)
    deps.telemetry?.recordAiUsage('embedding', config.provider, config.model, 'success', embeddingLatency)
    deps.onQueueChanged()
    diagnostic({
      level: 'debug',
      source: 'ai',
      event: 'embedding_generated',
      message: `Generated an embedding for version ${versionId}.`,
      context: {
        jobId: job.id,
        versionId,
        provider: config.provider,
        model: config.model,
        latencyMs: embeddingLatency,
      },
    })
  }

  /**
   * True when this job can be attempted now. An annotation job for a format the
   * AI service has no adapter for is skipped — not failed and not retried — so
   * it drains automatically once POST-02 adds support. Skipping (rather than
   * returning) matters: otherwise one deferred job would block the whole FIFO
   * queue behind it.
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
    // Defence in depth: an older sidecar may not accept a format the registry
    // already declares. Skipping keeps the job queued instead of failing it.
    const supported = await annotationFormats()
    return supported === null || supported.includes(shape.format)
  }

  /** Formats the running service accepts; null when it did not report any. */
  async function annotationFormats(): Promise<string[] | null> {
    if (capabilities === undefined) {
      const reported = await deps.client.capabilities()
      capabilities = reported?.annotate?.formats ?? null
    }
    return capabilities
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
      else await processEmbedding(job, versionId, config)
    } catch (error) {
      deps.telemetry?.recordAiUsage(
        operation, config.provider, config.model, 'failure', Date.now() - startedAt,
      )
      handleFailure(job, versionId, error)
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
