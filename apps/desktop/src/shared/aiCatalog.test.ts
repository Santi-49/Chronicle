import { describe, expect, it } from 'vitest'
import { aiSelectionError } from './aiCatalog'

describe('AI provider/model selection validation', () => {
  it('accepts curated pairs for both tasks', () => {
    expect(aiSelectionError('chat', 'google_genai', 'gemini-flash-latest', false)).toBeNull()
    expect(
      aiSelectionError('embeddings', 'openai', 'text-embedding-3-small', false),
    ).toBeNull()
  })

  it('rejects models unavailable for a known provider and task', () => {
    expect(aiSelectionError('chat', 'google_genai', 'missing-model', false)).toMatch(/not an available/)
    expect(aiSelectionError('embeddings', 'anthropic', 'voyage-3', false)).toMatch(
      /not an available/,
    )
  })

  it('allows complete custom pairs only in developer mode', () => {
    expect(aiSelectionError('chat', 'custom-provider', 'custom-model', true)).toBeNull()
    expect(aiSelectionError('chat', 'google_genai', 'new-provider-model', true)).toBeNull()
    expect(aiSelectionError('chat', 'custom-provider', 'custom-model', false)).toMatch(
      /available provider and model options/,
    )
    expect(aiSelectionError('chat', 'custom-provider', '', true)).toMatch(/requires both/)
  })

  it('allows an intentionally disabled task when both fields are empty', () => {
    expect(aiSelectionError('embeddings', '', '', true)).toBeNull()
  })
})
