import Database from 'better-sqlite3'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChronicleDb } from '../db/database'
import { setSetting } from '../db/repositories'
import { parseProbeArguments, runProviderProbe, selectProbeTargets } from './probe-cli'

let db: ChronicleDb

afterEach(() => db?.close())

function settingsDb(): ChronicleDb {
  db = new Database(':memory:')
  db.exec('CREATE TABLE settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)')
  setSetting(db, 'app-settings', {
    ai: {
      mode: 'local',
      chat: { provider: 'openai', model: 'gpt-5.6-terra' },
      embeddings: { provider: 'openai', model: 'text-embedding-3-small' },
    },
  })
  return db
}

describe('provider probe CLI', () => {
  it('parses an individual provider/model/task selection', () => {
    expect(parseProbeArguments([
      '--provider', 'openai', '--model', 'gpt-5.6-terra', '--task', 'chat',
    ])).toMatchObject({
      all: false,
      provider: 'openai',
      model: 'gpt-5.6-terra',
      task: 'chat',
    })
  })

  it('rejects stripped or unknown options instead of probing the saved defaults', () => {
    expect(() => parseProbeArguments(['openai', 'gpt-5.6-terra'])).toThrow(
      'Unknown probe option',
    )
  })

  it('uses saved Settings selections when no catalog filter is supplied', () => {
    expect(selectProbeTargets(settingsDb(), parseProbeArguments([]))).toEqual([
      { task: 'chat', provider: 'openai', model: 'gpt-5.6-terra' },
      { task: 'embeddings', provider: 'openai', model: 'text-embedding-3-small' },
    ])
  })

  it('selects every curated model for a provider', () => {
    const targets = selectProbeTargets(
      settingsDb(),
      parseProbeArguments(['--provider', 'anthropic']),
    )
    expect(targets.length).toBeGreaterThan(1)
    expect(targets.every((target) => target.provider === 'anthropic')).toBe(true)
  })

  it('redacts a key if a provider repeats it in an error', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    vi.spyOn(console, 'log').mockImplementation(() => undefined)
    const exitCode = await runProviderProbe(
      parseProbeArguments(['--provider', 'openai', '--model', 'gpt-5.6-terra']),
      {
        db: settingsDb(),
        readApiKey: () => 'secret-key',
        ensureService: vi.fn(),
        client: {
          health: vi.fn().mockResolvedValue(true),
          capabilities: vi.fn(),
          annotate: vi.fn(),
          embedText: vi.fn(),
          validateProviderModel: vi.fn().mockRejectedValue(
            new Error('provider echoed secret-key'),
          ),
        },
      },
    )
    expect(exitCode).toBe(1)
    expect(error.mock.calls.flat().join(' ')).not.toContain('secret-key')
    expect(error.mock.calls.flat().join(' ')).toContain('<redacted-key>')
    vi.restoreAllMocks()
  })
})
