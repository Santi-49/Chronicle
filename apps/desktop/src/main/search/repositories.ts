/**
 * Search-specific repository functions (MVP-10).
 *
 * These live here (not in the main db/repositories.ts) so MVP-10 owns its own
 * file boundary. When MVP-09's repositories.ts is merged, these complement it
 * rather than collide with it.
 */
import type { AiStatus } from '../../shared/ipc'
import type { ChronicleDb } from '../db/database'

// ── FTS5 keyword search ─────────────────────────────────────────────────

/**
 * Returns the version IDs that match the FTS5 query.
 * SQLite FTS5 MATCH handles phrase, prefix, and boolean operators natively.
 * We wrap the query in quotes to treat it as a phrase by default, which avoids
 * SQLite syntax errors on arbitrary user input while still matching well.
 */
export function searchFts(db: ChronicleDb, query: string): number[] {
  // Wrap in double-quotes for an implicit phrase match. Escape any existing
  // double-quotes in the query so the FTS5 parser does not see unbalanced ones.
  const safe = query.replace(/"/g, '""')
  const rows = db
    .prepare(
      `SELECT version_id
         FROM search_index
        WHERE search_index MATCH ?
        ORDER BY rank`,
    )
    .all(`"${safe}"`) as Array<{ version_id: number }>
  return rows.map((r) => r.version_id)
}

// ── Version rows for search results ─────────────────────────────────────

/** Everything the search engine needs to build a C1 SearchResult. */
export interface SearchVersionRow {
  versionId: number
  assetId: number
  assetName: string
  versionNumber: number
  contentHash: string
  capturedAt: string
  aiStatus: AiStatus
  summary: string | null
  tags: string[]
}

/**
 * Fetches version + asset data for a set of version IDs in one query.
 * The caller provides the ID list after the merge step so we make exactly
 * one round-trip to the database.
 */
export function searchGetVersionsForResults(
  db: ChronicleDb,
  versionIds: number[],
): SearchVersionRow[] {
  if (versionIds.length === 0) return []

  // SQLite does not support array parameters; build the placeholders manually.
  // The IDs come from our own FTS5 and embeddings queries, so they are safe
  // integers — no injection risk.
  const placeholders = versionIds.map(() => '?').join(', ')
  const rows = db
    .prepare(
      `SELECT v.id            AS version_id,
              v.asset_id,
              a.display_name  AS asset_name,
              v.version_number,
              v.content_hash,
              v.captured_at,
              v.ai_status,
              an.summary,
              an.tags
         FROM versions v
         JOIN assets a ON a.id = v.asset_id
         LEFT JOIN ai_annotations an ON an.version_id = v.id
        WHERE v.id IN (${placeholders})`,
    )
    .all(...versionIds) as Array<{
    version_id: number
    asset_id: number
    asset_name: string
    version_number: number
    content_hash: string
    captured_at: string
    ai_status: AiStatus
    summary: string | null
    tags: string | null
  }>

  return rows.map((r) => ({
    versionId: r.version_id,
    assetId: r.asset_id,
    assetName: r.asset_name,
    versionNumber: r.version_number,
    contentHash: r.content_hash,
    capturedAt: r.captured_at,
    aiStatus: r.ai_status,
    summary: r.summary,
    tags: r.tags !== null ? (JSON.parse(r.tags) as string[]) : [],
  }))
}

// ── Embeddings scan (re-exported here for colocation; source is the main db/repositories.ts) ──

/**
 * Returns all stored embeddings for a given model.
 * Only vectors from the same model are comparable — the scan is always model-scoped.
 */
export function listEmbeddingsForModel(
  db: ChronicleDb,
  model: string,
): Array<{ versionId: number; vector: Float32Array }> {
  const rows = db
    .prepare('SELECT version_id, vector FROM embeddings WHERE model = ?')
    .all(model) as Array<{ version_id: number; vector: Buffer }>

  return rows.map((r) => ({
    versionId: r.version_id,
    vector: decodeVector(r.vector),
  }))
}

function decodeVector(blob: Buffer): Float32Array {
  const vector = new Float32Array(blob.byteLength / 4)
  new Uint8Array(vector.buffer).set(blob)
  return vector
}
