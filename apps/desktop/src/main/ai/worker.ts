/** FIFO worker that turns queued versions into annotations and embeddings. */
import fs from 'node:fs/promises'
import path from 'node:path'
import type { AppSettings } from '../../shared/settings'
import type { ChronicleDb } from '../db/database'
import {
  bumpJobRetry,
  deleteJob,
  enqueueJob,
  getAnnotation,
  getAsset,
  getVersion,
  listJobs,
  listVersions,
  saveAnnotation,
  saveEmbedding,
  setVersionAiStatus,
  type QueueItem,
} from '../db/repositories'
import type { EmitEvent } from '../ipc/channels'
import { libraryFilePathFor } from '../versioning'
import { AiServiceError, type AiClient, type ProviderRequest } from './client'

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
  /** Resolve the saved key for a specific provider (per-task BYOK). */
  readApiKey: (provider: string) => string | null
  isOnline: () => boolean
  ensureService: () => void
  onQueueChanged: () => void
  pollMs?: number
}

function mediaType(fileName: string): 'image/png' | 'image/jpeg' {
  return path.extname(fileName).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg'
}

function versionIdOf(job: QueueItem): number | null {
  const payload = job.payload as { versionId?: unknown } | null
  return typeof payload?.versionId === 'number' ? payload.versionId : null
}

export function createAiWorker(deps: AiWorkerDependencies): AiWorker {
  let timer: NodeJS.Timeout | undefined
  let running = false
  let stopped = false

  async function providerConfig(kind: 'chat' | 'embeddings'): Promise<ProviderRequest | null> {
    const settings = await deps.getSettings()
    const selected = settings.ai[kind]
    if (!selected.provider || !selected.model) return null
    const apiKey = deps.readApiKey(selected.provider)
    if (!apiKey) return null
    return { provider: selected.provider, model: selected.model, apiKey }
  }

  async function image(versionId: number): Promise<{ base64: string; mediaType: 'image/png' | 'image/jpeg' }> {
    const version = getVersion(deps.db, versionId)
    if (!version) throw new Error(`Unknown version ${versionId}`)
    const asset = getAsset(deps.db, version.assetId)
    if (!asset) throw new Error(`Unknown asset ${version.assetId}`)
    const bytes = await fs.readFile(libraryFilePathFor(deps.libraryRoot, version.contentHash))
    return { base64: bytes.toString('base64'), mediaType: mediaType(asset.path) }
  }

  function markFailed(job: QueueItem, versionId: number | null): void {
    deleteJob(deps.db, job.id)
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
    if (error instanceof AiServiceError && !error.retryable) {
      markFailed(job, versionId)
      return
    }
    if (job.retryCount + 1 >= MAX_ATTEMPTS) {
      markFailed(job, versionId)
    } else {
      bumpJobRetry(deps.db, job.id)
      deps.onQueueChanged()
    }
  }

  async function processAnnotation(job: QueueItem, versionId: number): Promise<void> {
    const config = await providerConfig('chat')
    if (!config) return

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
    const annotation = await deps.client.annotate({
      ...config,
      fileName: asset.displayName,
      previous: previous ? await image(previous.id) : null,
      current: await image(version.id),
    })

    saveAnnotation(deps.db, {
      versionId,
      summary: annotation.summary,
      changes: annotation.changes,
      tags: annotation.tags,
      provider: config.provider,
      model: config.model,
      latencyMs: Date.now() - startedAt,
    })
    deleteJob(deps.db, job.id)
    if (!listJobs(deps.db, 'embedding').some((item) => versionIdOf(item) === versionId)) {
      enqueueJob(deps.db, 'embedding', { versionId })
    }
    deps.emit('annotationUpdated', { versionId, aiStatus: 'done' })
    deps.onQueueChanged()
  }

  async function processEmbedding(job: QueueItem, versionId: number): Promise<void> {
    const config = await providerConfig('embeddings')
    if (!config) return
    const annotation = getAnnotation(deps.db, versionId)
    if (!annotation) {
      deleteJob(deps.db, job.id)
      return
    }

    const sourceText = `${annotation.summary}\n${annotation.tags.join(' ')}`
    const result = await deps.client.embedText({ ...config, text: sourceText })
    saveEmbedding(deps.db, {
      versionId,
      vector: Float32Array.from(result.embedding),
      sourceText,
      // Provider is part of the identity; equal model names across providers are not comparable.
      model: `${result.provider}:${result.model}`,
    })
    deleteJob(deps.db, job.id)
    deps.onQueueChanged()
  }

  async function drainOne(): Promise<void> {
    if (running || stopped || !deps.isOnline()) return
    const job = listJobs(deps.db).find(
      (candidate) => candidate.jobType === 'ai_annotation' || candidate.jobType === 'embedding',
    )
    if (!job) return
    const versionId = versionIdOf(job)
    if (versionId === null) {
      deleteJob(deps.db, job.id)
      deps.onQueueChanged()
      return
    }
    deps.ensureService()
    if (!(await deps.client.health())) return

    running = true
    try {
      if (job.jobType === 'ai_annotation') await processAnnotation(job, versionId)
      else await processEmbedding(job, versionId)
    } catch (error) {
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
