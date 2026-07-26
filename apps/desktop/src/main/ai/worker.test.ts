import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../shared/settings'
import type { ChronicleDb } from '../db/database'
import type { AnnotationRecord, QueueItem } from '../db/repositories'
import { annotationFormatFor, createAiWorker } from './worker'
import { AiServiceError } from './client'


const state = vi.hoisted(() => ({
  jobs: [] as QueueItem[],
  annotations: new Map<number, AnnotationRecord>(),
  savedEmbedding: undefined as { versionId: number; model: string } | undefined,
  status: undefined as string | undefined,
  assetPath: 'C:/design/logo.png',
}))

vi.mock('../db/repositories', () => ({
  listJobs: (_db: unknown, type?: string) =>
    state.jobs.filter((job) => type === undefined || job.jobType === type),
  deleteJob: (_db: unknown, id: number) => {
    state.jobs = state.jobs.filter((job) => job.id !== id)
  },
  bumpJobRetry: (_db: unknown, id: number) => {
    const job = state.jobs.find((item) => item.id === id)
    if (job) job.retryCount += 1
  },
  failJob: (
    _db: unknown,
    id: number,
    error: { message: string; code: string | null; status: number | null },
  ) => {
    const job = state.jobs.find((item) => item.id === id)
    if (job) {
      job.retryCount += 1
      job.status = 'failed'
      job.lastError = error
    }
  },
  enqueueJob: (_db: unknown, jobType: string, payload: unknown) => {
    const job = {
      id: Math.max(0, ...state.jobs.map((item) => item.id)) + 1,
      jobType,
      payload,
      retryCount: 0,
      status: 'pending',
      lastError: null,
      createdAt: new Date().toISOString(),
    } as QueueItem
    state.jobs.push(job)
    return job
  },
  getVersion: (_db: unknown, id: number) =>
    ({
      1: { id: 1, assetId: 10, versionNumber: 1, contentHash: 'aa-old' },
      2: { id: 2, assetId: 10, versionNumber: 2, contentHash: 'bb-new' },
    })[id],
  getAsset: () => ({
    id: 10,
    path: state.assetPath,
    displayName: path.basename(state.assetPath),
  }),
  listVersions: () => [
    { id: 2, assetId: 10, versionNumber: 2, contentHash: 'bb-new' },
    { id: 1, assetId: 10, versionNumber: 1, contentHash: 'aa-old' },
  ],
  saveAnnotation: (_db: unknown, value: Omit<AnnotationRecord, 'createdAt'>) => {
    state.annotations.set(value.versionId, { ...value, createdAt: new Date().toISOString() })
  },
  getAnnotation: (_db: unknown, versionId: number) => state.annotations.get(versionId),
  saveEmbedding: (_db: unknown, value: { versionId: number; model: string }) => {
    state.savedEmbedding = value
  },
  setVersionAiStatus: (_db: unknown, _versionId: number, status: string) => {
    state.status = status
  },
}))

const settings: AppSettings = {
  appearance: { theme: 'system' },
  ai: {
    mode: 'local',
    chat: { provider: 'google_genai', model: 'gemini-2.5-flash' },
    embeddings: { provider: 'openai', model: 'text-embedding-3-small' },
  },
  controlPlane: {
    baseUrl: 'http://localhost:8000', telemetryOptIn: true,
    settingsSyncEnabled: false, apiKeySyncEnabled: false,
  },
}

let libraryRoot: string

beforeEach(() => {
  state.jobs = [
    {
      id: 1,
      jobType: 'ai_annotation',
      payload: { versionId: 2 },
      retryCount: 0,
      status: 'pending',
      lastError: null,
      createdAt: new Date().toISOString(),
    },
  ]
  state.annotations.clear()
  state.savedEmbedding = undefined
  state.status = undefined
  state.assetPath = 'C:/design/logo.png'
  libraryRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-ai-worker-'))
  fs.mkdirSync(path.join(libraryRoot, 'aa'))
  fs.mkdirSync(path.join(libraryRoot, 'bb'))
  fs.writeFileSync(path.join(libraryRoot, 'aa', 'aa-old'), 'old')
  fs.writeFileSync(path.join(libraryRoot, 'bb', 'bb-new'), 'new')
})

afterEach(() => fs.rmSync(libraryRoot, { recursive: true, force: true }))

function workerWith(overrides: Record<string, unknown> = {}) {
  const emit = vi.fn()
  const client = {
    health: vi.fn().mockResolvedValue(true),
    annotate: vi.fn().mockResolvedValue({
      summary: 'Background changed to teal.',
      changes: ['Background changed to teal'],
      tags: ['teal', 'background', 'logo'],
      confidence: 0.9,
    }),
    embedText: vi.fn().mockResolvedValue({
      embedding: [0.1, 0.2],
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 2,
    }),
    embedTexts: vi.fn().mockImplementation(async ({ texts }: { texts: string[] }) => ({
      embeddings: texts.map(() => [0.1, 0.2]),
      provider: 'openai',
      model: 'text-embedding-3-small',
      dimensions: 2,
      usage: { input_tokens: texts.length * 4, output_tokens: 0, total_tokens: texts.length * 4 },
    })),
    capabilities: vi.fn().mockResolvedValue({
      service: 'chronicle-ai',
      version: '0.1.0',
      annotate: { formats: ['png', 'jpg', 'jpeg', 'psd'] },
    }),
    validateProviderModel: vi.fn().mockResolvedValue({
      valid: true,
      reachable: true,
      task: 'embeddings',
      provider: 'openai',
      model: 'text-embedding-3-small',
      message: 'Provider and model are reachable.',
    }),
  }
  const worker = createAiWorker({
    db: {} as ChronicleDb,
    libraryRoot,
    client,
    emit,
    getSettings: async () => settings,
    readApiKey: () => 'secret',
    isOnline: () => true,
    ensureService: vi.fn(),
    onQueueChanged: vi.fn(),
    ...overrides,
  })
  return { worker, client, emit }
}

describe('AI queue worker', () => {
  it('resolves the C3 format of an annotatable file and defers the rest', () => {
    expect(annotationFormatFor('C:/design/campaign.psd')).toMatchObject({
      format: 'psd',
      mediaType: 'image/vnd.adobe.photoshop',
    })
    expect(annotationFormatFor('C:/design/logo.PNG')).toMatchObject({ format: 'png' })
    // Captured and displayed by the app, but the AI service has no adapter yet.
    expect(annotationFormatFor('C:/design/model.obj')).toBeNull()
    // Never captured at all.
    expect(annotationFormatFor('C:/design/logo.gif')).toBeNull()
    expect(annotationFormatFor('C:/design/logo')).toBeNull()
  })

  it('passes original PSD bytes and the Photoshop media type to the local service', async () => {
    state.assetPath = 'C:/design/campaign.psd'
    const { worker, client } = workerWith()

    await worker.runOnce()

    expect(client.annotate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'campaign.psd',
        format: 'psd',
        previous: expect.objectContaining({
          mediaType: 'image/vnd.adobe.photoshop',
          format: 'psd',
        }),
        current: expect.objectContaining({
          mediaType: 'image/vnd.adobe.photoshop',
          format: 'psd',
        }),
      }),
    )
  })

  it('leaves an annotation job queued when the format has no AI adapter', async () => {
    state.assetPath = 'C:/design/model.obj'
    const { worker, client, emit } = workerWith()

    await worker.runOnce()
    await worker.runOnce()

    // Never sent, never failed, never retried — it simply waits for support.
    expect(client.annotate).not.toHaveBeenCalled()
    expect(state.jobs).toHaveLength(1)
    expect(state.jobs[0]).toMatchObject({ status: 'pending', retryCount: 0 })
    expect(state.status).toBeUndefined()
    expect(emit).not.toHaveBeenCalled()
  })

  it('defers a job the running service does not list, even if the registry does', async () => {
    state.assetPath = 'C:/design/campaign.psd'
    const { worker, client } = workerWith()
    // An older sidecar that only implements the two MVP image formats.
    client.capabilities.mockResolvedValue({
      service: 'chronicle-ai',
      version: '0.0.1',
      annotate: { formats: ['png', 'jpg'] },
    })

    await worker.runOnce()

    expect(client.annotate).not.toHaveBeenCalled()
    expect(state.jobs[0]).toMatchObject({ status: 'pending', retryCount: 0 })
  })

  it('does not let a deferred job block the jobs behind it', async () => {
    state.assetPath = 'C:/design/model.obj'
    const { worker, client } = workerWith()
    // An embedding job queued behind the deferred annotation must still run.
    state.annotations.set(2, {
      versionId: 2,
      summary: 'Existing summary',
      changes: ['a'],
      tags: ['tag'],
      provider: 'google_genai',
      model: 'gemini-2.5-flash',
      latencyMs: 10,
      createdAt: new Date().toISOString(),
    })
    state.jobs.push({
      id: 2,
      jobType: 'embedding',
      payload: { versionId: 2 },
      retryCount: 0,
      status: 'pending',
      lastError: null,
      createdAt: new Date().toISOString(),
    })

    await worker.runOnce()

    expect(client.embedTexts).toHaveBeenCalledTimes(1)
    expect(state.savedEmbedding?.versionId).toBe(2)
    // The deferred annotation is still the only job left.
    expect(state.jobs).toEqual([expect.objectContaining({ id: 1, status: 'pending' })])
  })

  it('annotates a version, then embeds and stores its searchable text', async () => {
    const { worker, client, emit } = workerWith()

    await worker.runOnce()
    expect(client.annotate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'logo.png',
        format: 'png',
        previous: {
          base64: Buffer.from('old').toString('base64'),
          mediaType: 'image/png',
          format: 'png',
        },
        current: {
          base64: Buffer.from('new').toString('base64'),
          mediaType: 'image/png',
          format: 'png',
        },
      }),
    )
    expect(state.annotations.get(2)?.summary).toBe('Background changed to teal.')
    expect(state.jobs[0]?.jobType).toBe('embedding')
    expect(emit).toHaveBeenCalledWith('annotationUpdated', { versionId: 2, aiStatus: 'done' })

    await worker.runOnce()
    expect(client.embedTexts).toHaveBeenCalledWith(
      expect.objectContaining({ texts: ['Background changed to teal.\nteal background logo'] }),
    )
    expect(state.savedEmbedding).toEqual({
      versionId: 2,
      model: 'openai:text-embedding-3-small',
      vector: expect.any(Float32Array),
      sourceText: 'Background changed to teal.\nteal background logo',
    })
    expect(state.jobs).toHaveLength(0)
  })

  it('stores embeddings under the requested provider and model identity', async () => {
    state.jobs = [{ ...state.jobs[0]!, jobType: 'embedding' }]
    state.annotations.set(2, {
      versionId: 2,
      summary: 'Discount increased.',
      changes: [],
      tags: ['discount'],
      provider: 'google_genai',
      model: 'gemini-flash-latest',
      latencyMs: null,
      createdAt: new Date().toISOString(),
    })
    const { worker, client } = workerWith()
    client.embedTexts.mockResolvedValue({
      embeddings: [[1, 0]],
      provider: 'canonical-openai-name',
      model: 'canonical-model-name',
      dimensions: 2,
    })

    await worker.runOnce()

    expect(state.savedEmbedding?.model).toBe('openai:text-embedding-3-small')
  })

  it('embeds compatible queued versions in one provider request', async () => {
    state.jobs = [
      { ...state.jobs[0]!, id: 1, jobType: 'embedding', payload: { versionId: 1 } },
      { ...state.jobs[0]!, id: 2, jobType: 'embedding', payload: { versionId: 2 } },
    ]
    for (const versionId of [1, 2]) {
      state.annotations.set(versionId, {
        versionId,
        summary: `Summary ${versionId}`,
        changes: [],
        tags: ['design'],
        provider: 'google_genai',
        model: 'gemini-flash-latest',
        latencyMs: null,
        createdAt: new Date().toISOString(),
      })
    }
    const recordAiCall = vi.fn()
    const { worker, client } = workerWith({
      personalAnalytics: { recordAiCall, recordActivity: vi.fn() },
    })

    await worker.runOnce()

    expect(client.embedTexts).toHaveBeenCalledOnce()
    expect(client.embedTexts).toHaveBeenCalledWith(expect.objectContaining({
      texts: ['Summary 1\ndesign', 'Summary 2\ndesign'],
    }))
    expect(recordAiCall).toHaveBeenCalledOnce()
    expect(recordAiCall).toHaveBeenCalledWith(expect.objectContaining({
      operation: 'embedding',
      inputTokens: 8,
    }))
    expect(state.jobs).toHaveLength(0)
  })

  it('keeps jobs untouched while offline', async () => {
    const { worker, client } = workerWith({ isOnline: () => false })

    await worker.runOnce()

    expect(client.health).not.toHaveBeenCalled()
    expect(state.jobs[0]?.retryCount).toBe(0)
  })

  it('keeps jobs untouched while the local service is down', async () => {
    const { worker, client } = workerWith()
    client.health.mockResolvedValue(false)

    await worker.runOnce()

    expect(state.jobs[0]?.retryCount).toBe(0)
  })

  it('marks an annotation failed after three provider failures', async () => {
    const diagnostic = vi.fn()
    const { worker, client, emit } = workerWith({ diagnostic })
    client.annotate.mockRejectedValue(new Error('provider unavailable'))

    await worker.runOnce()
    await worker.runOnce()
    await worker.runOnce()

    expect(state.jobs).toHaveLength(1)
    expect(state.jobs[0]).toMatchObject({
      status: 'failed',
      retryCount: 3,
      lastError: { message: 'provider unavailable' },
    })
    expect(state.status).toBe('failed')
    expect(emit).toHaveBeenCalledWith('annotationUpdated', { versionId: 2, aiStatus: 'failed' })
    expect(diagnostic).toHaveBeenCalledTimes(3)
    expect(diagnostic).toHaveBeenLastCalledWith(expect.objectContaining({
      level: 'error',
      source: 'ai',
      event: 'summary_generation_failed',
      context: expect.objectContaining({ versionId: 2, attempt: 3, willRetry: false }),
    }))
  })

  it('does not automatically retry quota failures', async () => {
    const { worker, client } = workerWith()
    client.annotate.mockRejectedValue(new AiServiceError(
      'The AI provider quota or rate limit was reached. This job requires a manual retry.',
      429,
      'provider_quota_exceeded',
    ))

    await worker.runOnce()
    await worker.runOnce()

    expect(client.annotate).toHaveBeenCalledTimes(1)
    expect(state.jobs[0]).toMatchObject({
      status: 'failed',
      retryCount: 1,
      lastError: {
        code: 'provider_quota_exceeded',
        status: 429,
      },
    })
  })
})
