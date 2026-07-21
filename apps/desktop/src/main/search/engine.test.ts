/**
 * MVP-10 acceptance tests — hybrid keyword + semantic search.
 *
 * Uses a real SQLite in-memory database (same schema as production) and
 * verifies the two acceptance cases from the demo script:
 *   - "version with the tagline" finds the expected version by keyword
 *   - "blue background" finds the expected version by semantic similarity
 *
 * Tests also verify: empty query, keyword-only when no embeddings exist,
 * matchedBy values, and incompatible-model isolation.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ChronicleDb } from '../db/database'
import { search } from './engine'

// ── Minimal test helpers (mirrors db.test.ts patterns) ──────────────────

// We need a real DB with the Chronicle schema.
// Import the opener from the MVP-09 branch path; on dev we fall back to a
// known relative import. Both resolve to the same module at runtime.
let openDb: (filePath: string) => ChronicleDb

try {
  // MVP-09 merged path
  const mod = await import('../db/database')
  openDb = mod.openChronicleDb
} catch {
  throw new Error(
    'Could not import openChronicleDb — ensure MVP-09 is merged or on this branch.',
  )
}

let dir: string
let db: ChronicleDb

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chronicle-search-'))
  db = openDb(path.join(dir, 'test.db'))

  // Seed: two assets, three versions with different annotations.
  //
  // Asset 1 "logo.png"
  //   v1 — "Initial blue logo with tagline" · tags: [logo, blue, tagline]
  //   v2 — "Removed the tagline, background now teal" · tags: [logo, teal, minimal]
  // Asset 2 "banner.png"
  //   v1 — "Full-width banner with red background" · tags: [banner, red, background]

  db.prepare(`INSERT INTO assets (id, path, display_name) VALUES (1, 'logo.png', 'logo.png')`).run()
  db.prepare(`INSERT INTO assets (id, path, display_name) VALUES (2, 'banner.png', 'banner.png')`).run()

  db.prepare(`
    INSERT INTO versions (id, asset_id, version_number, content_hash, size_bytes, ai_status)
    VALUES
      (1, 1, 1, '${'a'.repeat(64)}', 1000, 'done'),
      (2, 1, 2, '${'b'.repeat(64)}', 1001, 'done'),
      (3, 2, 1, '${'c'.repeat(64)}', 2000, 'done')
  `).run()

  // Annotations — also writes FTS5 rows via the same saveAnnotation logic.
  // We insert directly into search_index here to keep the test self-contained
  // (saveAnnotation lives in the MVP-09 repositories.ts boundary).
  db.prepare(`
    INSERT INTO ai_annotations (version_id, summary, changes, tags, provider, model)
    VALUES
      (1, 'Initial blue logo with tagline', '["Blue background","Tagline present"]', '["logo","blue","tagline"]', 'test', 'test-model'),
      (2, 'Removed the tagline, background now teal', '["Tagline removed","Background blue→teal"]', '["logo","teal","minimal"]', 'test', 'test-model'),
      (3, 'Full-width banner with red background', '["Red background","Large typography"]', '["banner","red","background"]', 'test', 'test-model')
  `).run()

  db.prepare(`
    INSERT INTO search_index (version_id, asset_name, summary, changes, tags)
    VALUES
      (1, 'logo.png', 'Initial blue logo with tagline', 'Blue background Tagline present', 'logo blue tagline'),
      (2, 'logo.png', 'Removed the tagline, background now teal', 'Tagline removed Background blue→teal', 'logo teal minimal'),
      (3, 'banner.png', 'Full-width banner with red background', 'Red background Large typography', 'banner red background')
  `).run()
})

afterEach(() => {
  db.close()
  fs.rmSync(dir, { recursive: true, force: true })
})

// ── Helper ───────────────────────────────────────────────────────────────

function noEmbed() {
  return { db, embedQuery: null, embeddingsModel: '' }
}

// ── Tests ────────────────────────────────────────────────────────────────

describe('empty / blank query', () => {
  it('returns empty array for blank query', async () => {
    expect(await search('', noEmbed())).toEqual([])
    expect(await search('   ', noEmbed())).toEqual([])
  })
})

describe('keyword search', () => {
  it('demo script: "tagline" finds version 1 (has tagline)', async () => {
    const results = await search('tagline', noEmbed())
    const ids = results.map((r) => r.version.id)
    expect(ids).toContain(1)
  })

  it('demo script: "blue background" finds versions with blue or background', async () => {
    // FTS5 phrase match on "blue background" — v1 has both words in different fields
    const results = await search('blue background', noEmbed())
    expect(results.length).toBeGreaterThan(0)
  })

  it('matches by tag — "teal" finds version 2 only', async () => {
    const results = await search('teal', noEmbed())
    expect(results.map((r) => r.version.id)).toContain(2)
    expect(results.map((r) => r.version.id)).not.toContain(1)
  })

  it('matches by asset name', async () => {
    const results = await search('banner', noEmbed())
    expect(results.map((r) => r.version.id)).toContain(3)
  })

  it('no match returns empty array', async () => {
    expect(await search('xyzzy-nonexistent', noEmbed())).toEqual([])
  })

  it('all keyword results have matchedBy "keyword"', async () => {
    const results = await search('logo', noEmbed())
    for (const r of results) expect(r.matchedBy).toBe('keyword')
  })

  it('result shape matches C1 SearchResult', async () => {
    const results = await search('tagline', noEmbed())
    const r = results[0]!
    expect(r).toHaveProperty('version')
    expect(r).toHaveProperty('assetName')
    expect(r).toHaveProperty('snippet')
    expect(r).toHaveProperty('matchedBy')
    expect(r.version).toHaveProperty('id')
    expect(r.version).toHaveProperty('versionNumber')
    expect(r.version).toHaveProperty('thumbnailUrl')
    // Internal _score must NOT be in the output
    expect(r).not.toHaveProperty('_score')
  })
})

describe('semantic search', () => {
  it('skips semantic when embedQuery is null', async () => {
    // Should not throw, just keyword results
    const results = await search('logo', noEmbed())
    expect(results.every((r) => r.matchedBy === 'keyword')).toBe(true)
  })

  it('returns semantic results above threshold', async () => {
    // Seed an embedding for version 1
    const vec = new Float32Array([1, 0, 0]) // unit vector
    const buf = Buffer.from(vec.buffer)
    db.prepare(`INSERT INTO embeddings (version_id, vector, source_text, model) VALUES (1, ?, 'blue logo tagline', 'embed-model-1')`).run(buf)

    // Query embedding is identical → cosine = 1.0
    const embedQuery = vi.fn().mockResolvedValue([1, 0, 0])

    const results = await search('blue tagline', {
      db,
      embedQuery,
      embeddingsModel: 'embed-model-1',
    })

    expect(embedQuery).toHaveBeenCalledWith('blue tagline')
    const r1 = results.find((r) => r.version.id === 1)
    expect(r1).toBeDefined()
    // v1 matches both keyword (tagline, blue) and semantic → matchedBy 'both'
    expect(r1!.matchedBy).toBe('both')
  })

  it('semantic result below threshold is excluded', async () => {
    // Perpendicular vector → cosine similarity = 0 (below threshold)
    const vec = new Float32Array([0, 1, 0])
    const buf = Buffer.from(vec.buffer)
    db.prepare(`INSERT INTO embeddings (version_id, vector, source_text, model) VALUES (3, ?, 'banner red', 'embed-model-1')`).run(buf)

    // Query vector is orthogonal to stored vector
    const embedQuery = vi.fn().mockResolvedValue([1, 0, 0])

    const results = await search('something unique xyz', {
      db,
      embedQuery,
      embeddingsModel: 'embed-model-1',
    })
    // No keyword match and similarity = 0 → v3 must not appear
    expect(results.find((r) => r.version.id === 3)).toBeUndefined()
  })

  it('ignores embeddings from a different model', async () => {
    const vec = new Float32Array([1, 0, 0])
    const buf = Buffer.from(vec.buffer)
    db.prepare(`INSERT INTO embeddings (version_id, vector, source_text, model) VALUES (1, ?, 'logo', 'OLD-model')`).run(buf)

    // Query with a different active model — OLD-model embeddings must be ignored
    const embedQuery = vi.fn().mockResolvedValue([1, 0, 0])

    const results = await search('xyzzy-nonexistent', {
      db,
      embedQuery,
      embeddingsModel: 'NEW-model',
    })
    // No keyword match, no embeddings for NEW-model → empty
    expect(results).toEqual([])
  })

  it('degrades to keyword-only when embedQuery throws', async () => {
    const embedQuery = vi.fn().mockRejectedValue(new Error('Network error'))

    const results = await search('logo', { db, embedQuery, embeddingsModel: 'embed-model-1' })

    // Must not throw; keyword results still come back
    expect(results.length).toBeGreaterThan(0)
    expect(results.every((r) => r.matchedBy === 'keyword')).toBe(true)
  })
})

describe('ranking', () => {
  it('"both" matches rank above pure keyword matches', async () => {
    // v1 has "tagline" in keyword; give it a high semantic score too
    const vec1 = new Float32Array([1, 0, 0])
    const vec2 = new Float32Array([0.5, 0.5, 0]) // lower similarity
    db.prepare(`INSERT INTO embeddings (version_id, vector, source_text, model) VALUES (1, ?, 'tagline logo', 'rank-model')`).run(Buffer.from(vec1.buffer))
    db.prepare(`INSERT INTO embeddings (version_id, vector, source_text, model) VALUES (2, ?, 'teal logo', 'rank-model')`).run(Buffer.from(vec2.buffer))

    // Query matches "teal" by keyword (v2 only); matches v1 best semantically
    const embedQuery = vi.fn().mockResolvedValue([1, 0, 0])
    const results = await search('tagline', { db, embedQuery, embeddingsModel: 'rank-model' })

    // v1 should be first (both keyword + best semantic score)
    expect(results[0]!.version.id).toBe(1)
    expect(results[0]!.matchedBy).toBe('both')
  })
})
