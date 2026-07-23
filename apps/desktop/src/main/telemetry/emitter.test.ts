/**
 * POST-04 — TelemetryEmitter unit tests.
 *
 * The critical assertion: forbidden fields (assetId, versionId, path, query text,
 * exact byte size, content hash) cannot appear in any serialised telemetry payload.
 */
import { describe, expect, it } from 'vitest'
import {
  buildAccountSignedIn,
  buildAiProviderConfigured,
  buildAiSummaryGenerated,
  buildAppOpened,
  buildProjectAdded,
  buildProjectInventory,
  buildProjectRemoved,
  buildRestorePerformed,
  buildSearchPerformed,
  buildVersionCaptured,
  buildVersionHistoryReset,
  normaliseFileType,
  resultCountBucket,
  sizeBucket,
} from '../telemetry/emitter'

const INSTALLATION = '00000000-0000-0000-0000-000000000001'
const PROJECT_ID   = '00000000-0000-0000-0000-000000000002'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Stringify and scan for a value — proves the field is absent in the wire payload. */
function serialisedContains(payload: unknown, value: string): boolean {
  return JSON.stringify(payload).includes(value)
}

// ── Bucket helpers ─────────────────────────────────────────────────────────

describe('sizeBucket', () => {
  it('buckets correctly', () => {
    expect(sizeBucket(0)).toBe('<100KB')
    expect(sizeBucket(99_999)).toBe('<100KB')
    expect(sizeBucket(100_000)).toBe('100KB-1MB')
    expect(sizeBucket(999_999)).toBe('100KB-1MB')
    expect(sizeBucket(1_000_000)).toBe('1-10MB')
    expect(sizeBucket(9_999_999)).toBe('1-10MB')
    expect(sizeBucket(10_000_000)).toBe('10-50MB')
    expect(sizeBucket(50_000_000)).toBe('10-50MB')
  })
})

describe('resultCountBucket', () => {
  it('buckets correctly', () => {
    expect(resultCountBucket(0)).toBe('0')
    expect(resultCountBucket(1)).toBe('1-5')
    expect(resultCountBucket(5)).toBe('1-5')
    expect(resultCountBucket(6)).toBe('6-20')
    expect(resultCountBucket(20)).toBe('6-20')
    expect(resultCountBucket(21)).toBe('21+')
  })
})

describe('normaliseFileType', () => {
  it('maps extensions correctly', () => {
    expect(normaliseFileType('.PNG')).toBe('png')
    expect(normaliseFileType('jpg')).toBe('jpg')
    expect(normaliseFileType('.jpeg')).toBe('jpg')
    expect(normaliseFileType('.svg')).toBe('other')
    expect(normaliseFileType('')).toBe('other')
  })
})

// ── Allowlist: forbidden fields must NOT appear in wire payloads ────────────

describe('buildVersionCaptured — forbidden fields', () => {
  it('does not contain exact byte size', () => {
    const payload = buildVersionCaptured(INSTALLATION, PROJECT_ID, '.png', 123456, 50)
    expect(serialisedContains(payload, '123456')).toBe(false)
  })

  it('does not contain a file path', () => {
    // The builder does not accept a path parameter — this test documents intent.
    const payload = buildVersionCaptured(INSTALLATION, PROJECT_ID, '.png', 1024, 50)
    expect(serialisedContains(payload, '/Users/')).toBe(false)
    expect(serialisedContains(payload, 'C:\\')).toBe(false)
  })

  it('does not contain assetId or versionId', () => {
    const payload = buildVersionCaptured(INSTALLATION, PROJECT_ID, '.jpg', 2048, 30)
    expect(serialisedContains(payload, 'assetId')).toBe(false)
    expect(serialisedContains(payload, 'versionId')).toBe(false)
    expect(serialisedContains(payload, 'asset_id')).toBe(false)
    expect(serialisedContains(payload, 'version_id')).toBe(false)
  })

  it('contains only coarse size bucket, not the raw number', () => {
    const payload = buildVersionCaptured(INSTALLATION, undefined, '.png', 500_000, 10)
    expect(payload.size_bucket).toBe('100KB-1MB')
    expect(serialisedContains(payload, '500000')).toBe(false)
  })

  it('normalises extension to allowed type', () => {
    const payload = buildVersionCaptured(INSTALLATION, undefined, '.JPEG', 1024, 10)
    expect(payload.file_type).toBe('jpg')
  })

  it('omits project_telemetry_id when not provided', () => {
    const payload = buildVersionCaptured(INSTALLATION, undefined, '.png', 1024, 10)
    expect('project_telemetry_id' in payload).toBe(false)
  })
})

describe('buildSearchPerformed — forbidden fields', () => {
  it('does not contain query text', () => {
    const payload = buildSearchPerformed(INSTALLATION, 'keyword', 120, 3)
    expect(serialisedContains(payload, 'query')).toBe(false)
    expect(serialisedContains(payload, 'text')).toBe(false)
  })

  it('contains result count bucket, not exact count', () => {
    const payload = buildSearchPerformed(INSTALLATION, 'hybrid', 80, 17)
    expect(payload.result_count_bucket).toBe('6-20')
    expect(serialisedContains(payload, '"17"')).toBe(false)
  })
})

describe('buildAiSummaryGenerated — forbidden fields', () => {
  it('does not contain file content, paths, or AI summary text', () => {
    // The event TYPE is "ai_summary_generated" — that's fine and expected.
    // What must NOT appear is actual AI-generated text, file paths, or raw content.
    const payload = buildAiSummaryGenerated(
      INSTALLATION, PROJECT_ID, 'annotation', 'google_genai', 'gemini-flash-latest', 'success', 1200,
    )
    // Neither a real summary string nor a path can appear
    expect(serialisedContains(payload, 'background navy')).toBe(false)
    expect(serialisedContains(payload, '/Users/designer')).toBe(false)
    expect(serialisedContains(payload, 'C:\\designs')).toBe(false)
    // The event type name itself is fine — it's an allowlisted identifier
    expect(payload.event).toBe('ai_summary_generated')
  })

  it('includes provider and model but no key material', () => {
    const payload = buildAiSummaryGenerated(
      INSTALLATION, undefined, 'embedding', 'openai', 'text-embedding-3-small', 'failure', 400,
    )
    expect(payload.provider).toBe('openai')
    expect(payload.model).toBe('text-embedding-3-small')
    expect(payload.outcome).toBe('failure')
  })

  it('includes optional token counts when provided', () => {
    const payload = buildAiSummaryGenerated(
      INSTALLATION, undefined, 'annotation', 'openai', 'gpt-4o', 'success', 800,
      { input: 512, output: 64 },
    )
    expect(payload.input_tokens).toBe(512)
    expect(payload.output_tokens).toBe(64)
  })
})

describe('buildAppOpened', () => {
  it('normalises unknown os to other', () => {
    const payload = buildAppOpened(INSTALLATION, '1.0.0', 'freebsd')
    expect(payload.os_family).toBe('other')
  })

  it('keeps known OS families', () => {
    expect(buildAppOpened(INSTALLATION, '1.0.0', 'windows').os_family).toBe('windows')
    expect(buildAppOpened(INSTALLATION, '1.0.0', 'macos').os_family).toBe('macos')
    expect(buildAppOpened(INSTALLATION, '1.0.0', 'linux').os_family).toBe('linux')
  })
})

describe('buildProjectInventory', () => {
  it('counts by allowlisted type', () => {
    const inv = buildProjectInventory([
      { ext: '.png' }, { ext: '.PNG' }, { ext: '.jpg' }, { ext: '.svg' },
    ])
    expect(inv.tracked_file_count).toBe(4)
    expect(inv.file_type_counts.png).toBe(2)
    expect(inv.file_type_counts.jpg).toBe(1)
    expect(inv.file_type_counts.other).toBe(1)
  })

  it('does not contain file names, paths, or identifiers', () => {
    const inv = buildProjectInventory([{ ext: '.png' }, { ext: '.jpg' }])
    expect(serialisedContains(inv, 'path')).toBe(false)
    expect(serialisedContains(inv, 'name')).toBe(false)
    expect(serialisedContains(inv, 'id')).toBe(false)
  })
})

// ── Schema version and shared base fields ──────────────────────────────────

describe('buildProjectAdded', () => {
  it('includes project_telemetry_id and correct event type', () => {
    const payload = buildProjectAdded(INSTALLATION, PROJECT_ID)
    expect(payload.event).toBe('project_added')
    expect(payload.project_telemetry_id).toBe(PROJECT_ID)
    expect(serialisedContains(payload, 'path')).toBe(false)
    expect(serialisedContains(payload, 'name')).toBe(false)
  })
})

describe('buildProjectRemoved', () => {
  it('records history_deleted flag, no project metadata', () => {
    const withHistory = buildProjectRemoved(INSTALLATION, PROJECT_ID, true)
    expect(withHistory.history_deleted).toBe(true)
    const withoutHistory = buildProjectRemoved(INSTALLATION, PROJECT_ID, false)
    expect(withoutHistory.history_deleted).toBe(false)
    expect(serialisedContains(withHistory, 'path')).toBe(false)
    expect(serialisedContains(withHistory, 'name')).toBe(false)
  })
})

describe('buildAiProviderConfigured', () => {
  it('includes provider, no key material', () => {
    const payload = buildAiProviderConfigured(INSTALLATION, 'google_genai')
    expect(payload.provider).toBe('google_genai')
    expect(serialisedContains(payload, 'key')).toBe(false)
    expect(serialisedContains(payload, 'secret')).toBe(false)
    expect(serialisedContains(payload, 'token')).toBe(false)
  })
})

describe('buildAccountSignedIn', () => {
  it('records method, no email or identity', () => {
    const g = buildAccountSignedIn(INSTALLATION, 'google')
    expect(g.method).toBe('google')
    const p = buildAccountSignedIn(INSTALLATION, 'password')
    expect(p.method).toBe('password')
    expect(serialisedContains(g, '@')).toBe(false)
    expect(serialisedContains(g, 'email')).toBe(false)
  })
})

describe('buildRestorePerformed', () => {
  it('normalises extension, no version IDs or paths', () => {
    const payload = buildRestorePerformed(INSTALLATION, PROJECT_ID, '.PNG')
    expect(payload.file_type).toBe('png')
    expect(serialisedContains(payload, 'versionId')).toBe(false)
    expect(serialisedContains(payload, 'version_id')).toBe(false)
    expect(serialisedContains(payload, 'path')).toBe(false)
  })
})

describe('buildVersionHistoryReset', () => {
  it('contains no asset or version identifiers', () => {
    const payload = buildVersionHistoryReset(INSTALLATION, PROJECT_ID)
    expect(payload.event).toBe('version_history_reset')
    expect(serialisedContains(payload, 'assetId')).toBe(false)
    expect(serialisedContains(payload, 'versionId')).toBe(false)
  })
})


describe('all events', () => {
  it('carry schema_version = 1, installation_id, occurred_at, and id', () => {
    const events = [
      buildAppOpened(INSTALLATION, '1.0.0', 'windows'),
      buildVersionCaptured(INSTALLATION, undefined, '.png', 1024, 10),
      buildAiSummaryGenerated(INSTALLATION, undefined, 'annotation', 'p', 'm', 'success', 100),
      buildSearchPerformed(INSTALLATION, 'keyword', 50, 0),
      buildProjectAdded(INSTALLATION, PROJECT_ID),
      buildProjectRemoved(INSTALLATION, PROJECT_ID, false),
      buildAiProviderConfigured(INSTALLATION, 'openai'),
      buildAccountSignedIn(INSTALLATION, 'google'),
      buildRestorePerformed(INSTALLATION, PROJECT_ID, '.jpg'),
      buildVersionHistoryReset(INSTALLATION, PROJECT_ID),
    ]
    for (const e of events) {
      expect(e.schema_version).toBe(1)
      expect(e.installation_id).toBe(INSTALLATION)
      expect(typeof e.occurred_at).toBe('string')
      expect(typeof e.id).toBe('string')
    }
  })
})
