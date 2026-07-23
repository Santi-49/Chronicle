/**
 * F7 — hybrid search engine (MVP-10).
 *
 * Two passes, one ranked list:
 *   1. Keyword  — SQLite FTS5 over summaries, changes, tags, and asset names.
 *   2. Semantic — cosine similarity between the query embedding and stored
 *                 version embeddings (same model only, brute-force in-process).
 *
 * Keyword search is always available.
 * Semantic search is skipped when no embeddings exist or the AI client is
 * unavailable — the function never throws for missing embeddings.
 *
 * The contract (C1 `SearchResult`) is satisfied regardless of which engines
 * contributed: `matchedBy` tells the UI which ones fired.
 */

import type { SearchResult, VersionSummary } from '../../shared/ipc'
import type { ChronicleDb } from '../db/database'
import { imageUrlForHash } from '../ipc/media'
import { searchFts, searchGetVersionsForResults, listEmbeddingsForModel } from './repositories'

// ── Cosine similarity ───────────────────────────────────────────────────

/**
 * Returns a value between -1 and 1 (higher = more similar).
 * Returns 0 for zero-length vectors (guard against division by zero).
 */
function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!
    normA += a[i]! * a[i]!
    normB += b[i]! * b[i]!
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB)
  return denom === 0 ? 0 : dot / denom
}

// ── Score thresholds (implementation policy, not contract) ──────────────

/** FTS5 rows are considered matches by SQLite — no extra threshold needed. */
const SEMANTIC_THRESHOLD = 0.3 // below this we treat it as noise

// ── Main export ─────────────────────────────────────────────────────────

export interface SearchDependencies {
  db: ChronicleDb
  /** Embeds the query text; null when no AI client is available. */
  embedQuery: ((text: string) => Promise<number[]>) | null
  /** The active embeddings model (settings.ai.embeddings.model). */
  embeddingsModel: string
}

/**
 * Runs keyword and (optionally) semantic search, merges the results, and
 * returns them sorted by combined score, best first.
 *
 * Returns an empty array for blank queries.
 */
export async function search(query: string, deps: SearchDependencies): Promise<SearchResult[]> {
  const trimmed = query.trim()
  if (trimmed === '') return []

  const { db, embedQuery, embeddingsModel } = deps

  // ── Step 1: keyword search ──────────────────────────────────────────

  // FTS5 MATCH returns one row per matching version_id.
  const keywordVersionIds = new Set(searchFts(db, trimmed))

  // ── Step 2: semantic search (skip if no client or no model configured) ──

  const semanticScores = new Map<number, number>() // versionId → similarity

  if (embedQuery !== null && embeddingsModel !== '') {
    try {
      const queryVector = new Float32Array(await embedQuery(trimmed))
      const storedEmbeddings = listEmbeddingsForModel(db, embeddingsModel)

      for (const { versionId, vector } of storedEmbeddings) {
        const score = cosineSimilarity(queryVector, vector)
        if (score >= SEMANTIC_THRESHOLD) {
          semanticScores.set(versionId, score)
        }
      }
    } catch {
      // Embedding call failed (network, key, etc.) — degrade to keyword only.
    }
  }

  // ── Step 3: merge — union of both result sets ───────────────────────

  const allVersionIds = new Set([...keywordVersionIds, ...semanticScores.keys()])
  if (allVersionIds.size === 0) return []

  // Fetch version + asset data for every matched version in one query.
  const rows = searchGetVersionsForResults(db, [...allVersionIds])

  // ── Step 4: build results with scores ──────────────────────────────

  // Keyword score: 1.0 for any FTS5 match (binary — either it matches or not).
  // Semantic score: cosine similarity (0–1 after threshold filter).
  // Combined: simple average of whichever scores are present, so both engines
  // weigh equally. "both" matches rank highest naturally (avg of 1.0 + high sim).
  const results: SearchResult[] = rows.map((row) => {
    const inKeyword = keywordVersionIds.has(row.versionId)
    const semScore = semanticScores.get(row.versionId) ?? 0

    const keywordScore = inKeyword ? 1.0 : 0
    const scores = [keywordScore, semScore].filter((s) => s > 0)
    const combinedScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0

    const matchedBy: SearchResult['matchedBy'] =
      inKeyword && semScore > 0 ? 'both' : inKeyword ? 'keyword' : 'semantic'

    const versionSummary: VersionSummary = {
      id: row.versionId,
      assetId: row.assetId,
      versionNumber: row.versionNumber,
      capturedAt: row.capturedAt,
      aiStatus: row.aiStatus,
      aiFailure: null,
      summary: row.summary,
      thumbnailUrl: imageUrlForHash(row.contentHash),
    }

    // Snippet: first 120 chars of the summary, or the tags if no summary yet.
    const snippet =
      row.summary !== null
        ? row.summary.slice(0, 120)
        : row.tags.length > 0
          ? row.tags.join(', ')
          : row.assetName

    return {
      version: versionSummary,
      assetName: row.assetName,
      snippet,
      matchedBy,
      _score: combinedScore, // internal; stripped below
    } as SearchResult & { _score: number }
  })

  // Sort best score first, then remove the internal field.
  results.sort((a, b) => (b as SearchResult & { _score: number })._score - (a as SearchResult & { _score: number })._score)
  for (const r of results) {
    delete (r as Partial<SearchResult & { _score: number }>)._score
  }

  return results
}
