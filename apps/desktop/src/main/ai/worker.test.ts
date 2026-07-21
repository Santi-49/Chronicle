import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../shared/settings'
import type { ChronicleDb } from '../db/database'
import type { AnnotationRecord, QueueItem } from '../db/repositories'
import { createAiWorker } from './worker'

const state = vi.hoisted(() => ({
  jobs: [] as QueueItem[],
  annotations: new Map<number, AnnotationRecord>(),
  savedEmbedding: undefined as { versionId: number; model: string } | undefined,
  status: undefined as string | undefined,
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
  enqueueJob: (_db: unknown, jobType: string, payload: unknown) => {
    const job = {
      id: Math.max(0, ...state.jobs.map((item) => item.id)) + 1,
      jobType,
      payload,
      retryCount: 0,
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
  getAsset: () => ({ id: 10, path: 'C:/design/logo.png', displayName: 'logo.png' }),
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
      createdAt: new Date().toISOString(),
    },
  ]
  state.annotations.clear()
  state.savedEmbedding = undefined
  state.status = undefined
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
  it('annotates a version, then embeds and stores its searchable text', async () => {
    const { worker, client, emit } = workerWith()

    await worker.runOnce()
    expect(client.annotate).toHaveBeenCalledWith(
      expect.objectContaining({
        fileName: 'logo.png',
        previous: { base64: Buffer.from('old').toString('base64'), mediaType: 'image/png' },
        current: { base64: Buffer.from('new').toString('base64'), mediaType: 'image/png' },
      }),
    )
    expect(state.annotations.get(2)?.summary).toBe('Background changed to teal.')
    expect(state.jobs[0]?.jobType).toBe('embedding')
    expect(emit).toHaveBeenCalledWith('annotationUpdated', { versionId: 2, aiStatus: 'done' })

    await worker.runOnce()
    expect(client.embedText).toHaveBeenCalledWith(
      expect.objectContaining({ text: 'Background changed to teal.\nteal background logo' }),
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
    client.embedText.mockResolvedValue({
      embedding: [1, 0],
      provider: 'canonical-openai-name',
      model: 'canonical-model-name',
      dimensions: 2,
    })

    await worker.runOnce()

    expect(state.savedEmbedding?.model).toBe('openai:text-embedding-3-small')
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
    const { worker, client, emit } = workerWith()
    client.annotate.mockRejectedValue(new Error('provider unavailable'))

    await worker.runOnce()
    await worker.runOnce()
    await worker.runOnce()

    expect(state.jobs).toHaveLength(0)
    expect(state.status).toBe('failed')
    expect(emit).toHaveBeenCalledWith('annotationUpdated', { versionId: 2, aiStatus: 'failed' })
  })
})
