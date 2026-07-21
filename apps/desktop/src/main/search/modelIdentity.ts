/**
 * Embeddings are comparable only when both their provider and model match.
 * Keep this identity construction shared by indexing and query-time lookup.
 */
export function embeddingModelIdentity(provider: string, model: string): string {
  return `${provider}:${model}`
}
