import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { AppSettings } from '../../shared/settings'
import { openChronicleDb, type ChronicleDb } from '../db/database'
import { getAnnotation, getEmbedding, listJobs } from '../db/repositories'
import { captureVersion } from '../versioning'
import { createAiClient } from './client'
import { createAiServiceProcess, type AiServiceProcess } from './service-process'
import { createAiWorker } from './worker'

const apiKey = process.env['GOOGLE_API_KEY']?.trim() ?? ''
const live = describe.runIf(apiKey.length > 0)

live('MVP-09 live provider acceptance', () => {
  let root: string
  let libraryRoot: string
  let db: ChronicleDb
  let service: AiServiceProcess

  beforeAll(async () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-mvp09-live-'))
    libraryRoot = path.join(root, 'library')
    db = openChronicleDb(path.join(root, 'chronicle.db'))
    service = createAiServiceProcess(path.resolve(process.cwd(), '..', '..'))
    service.start()

    const client = createAiClient()
    const deadline = Date.now() + 15_000
    while (!(await client.health())) {
      if (Date.now() >= deadline) throw new Error('AI service did not become healthy')
      await new Promise((resolve) => setTimeout(resolve, 250))
    }
  })

  afterAll(async () => {
    await service.stop()
    db.close()
    fs.rmSync(root, { recursive: true, force: true })
  })

  it(
    'persists a real Gemini annotation and comparable embedding through the worker',
    async () => {
      const workingImage = path.join(root, 'acceptance.jpg')
      fs.copyFileSync(
        path.resolve(process.cwd(), '..', '..', 'services/ai/tests/fixtures/after.jpg'),
        workingImage,
      )
      const captured = await captureVersion(db, libraryRoot, workingImage)
      expect(captured.outcome).toBe('captured')
      if (captured.outcome !== 'captured') return

      const settings: AppSettings = {
        ai: {
          mode: 'local',
          chat: { provider: 'google_genai', model: 'gemini-flash-latest' },
          embeddings: { provider: 'google_genai', model: 'gemini-embedding-001' },
        },
        controlPlane: { baseUrl: 'http://localhost:8000', telemetryOptIn: false },
      }
      const worker = createAiWorker({
        db,
        libraryRoot,
        client: createAiClient(),
        emit: vi.fn(),
        getSettings: async () => settings,
        readApiKey: () => apiKey,
        isOnline: () => true,
        ensureService: () => service.start(),
        onQueueChanged: vi.fn(),
      })

      await worker.runOnce()
      const annotation = getAnnotation(db, captured.version.id)
      expect(annotation?.summary).toBeTruthy()
      expect(annotation?.tags.length).toBeGreaterThanOrEqual(3)
      expect(listJobs(db).map((job) => job.jobType)).toEqual(['embedding'])

      await worker.runOnce()
      const embedding = getEmbedding(db, captured.version.id)
      expect(embedding?.model).toBe('google_genai:gemini-embedding-001')
      expect(embedding?.vector.length).toBeGreaterThan(0)
      expect(listJobs(db)).toHaveLength(0)
      worker.stop()
    },
    120_000,
  )
})
