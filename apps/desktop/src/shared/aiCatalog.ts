/** Curated provider/model choices shared by Settings UI and IPC validation. */

export interface ModelOption {
  id: string
  label: string
  tier: string
}

export interface ProviderCatalog {
  id: string
  label: string
  chat: ModelOption[]
  embeddings: ModelOption[]
}

export const AI_PROVIDERS: ProviderCatalog[] = [
  {
    id: 'google_genai',
    label: 'Google Gemini',
    chat: [
      { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite', tier: 'Fastest · lowest cost' },
      { id: 'gemini-flash-latest', label: 'Gemini Flash', tier: 'Balanced · recommended' },
      { id: 'gemini-pro-latest', label: 'Gemini Pro', tier: 'Highest quality · higher cost' },
    ],
    embeddings: [
      // gemini-embedding-001 is Google's only current text-embedding model.
      // text-embedding-004 was retired on 2026-01-14 (verified 404 NOT_FOUND
      // in VALIDATE-01) and removed here so Settings never offers a dead model.
      { id: 'gemini-embedding-001', label: 'Gemini Embedding 001', tier: 'Recommended' },
    ],
  },
  {
    id: 'anthropic',
    label: 'Anthropic Claude',
    chat: [
      { id: 'claude-haiku-4-5', label: 'Claude Haiku 4.5', tier: 'Fast · lower cost' },
      { id: 'claude-sonnet-5', label: 'Claude Sonnet 5', tier: 'Balanced · recommended' },
      { id: 'claude-opus-4-8', label: 'Claude Opus 4.8', tier: 'Highest quality · higher cost' },
    ],
    embeddings: [],
  },
  {
    id: 'openai',
    label: 'OpenAI',
    chat: [
      // Refreshed VALIDATE-01 (2026-07-21): the GPT-4o family was superseded by
      // the GPT-5.6 tiers; all three support vision (required for annotation).
      { id: 'gpt-5.6-luna', label: 'GPT-5.6 Luna', tier: 'Fast · lower cost' },
      { id: 'gpt-5.6-terra', label: 'GPT-5.6 Terra', tier: 'Balanced · recommended' },
      { id: 'gpt-5.6-sol', label: 'GPT-5.6 Sol', tier: 'Highest quality · higher cost' },
    ],
    embeddings: [
      { id: 'text-embedding-3-small', label: 'Embedding 3 Small', tier: 'Lower cost' },
      { id: 'text-embedding-3-large', label: 'Embedding 3 Large', tier: 'Higher quality' },
    ],
  },
  {
    id: 'bedrock',
    label: 'Amazon Bedrock',
    chat: [
      // Refreshed VALIDATE-01 (2026-07-21): Claude 3.5 on Bedrock moved to Legacy;
      // bumped to the current 4.5/4.6-era IDs. Newer Claude models on Bedrock are
      // inference-profile-based and may require a region prefix (e.g. us.anthropic.…)
      // depending on the user's account/region — availability is BYOK-dependent and
      // is live-probed before a selection is saved.
      { id: 'anthropic.claude-haiku-4-5-20251001-v1:0', label: 'Claude Haiku 4.5', tier: 'Fast · lower cost' },
      { id: 'anthropic.claude-sonnet-4-6', label: 'Claude Sonnet 4.6', tier: 'Balanced · recommended' },
      { id: 'anthropic.claude-opus-4-7', label: 'Claude Opus 4.7', tier: 'Highest quality · higher cost' },
    ],
    embeddings: [
      { id: 'amazon.titan-embed-text-v2:0', label: 'Titan Text Embeddings v2', tier: 'Recommended' },
      { id: 'cohere.embed-english-v3', label: 'Cohere Embed English v3', tier: 'Alternative' },
    ],
  },
]

export type AiTask = 'chat' | 'embeddings'

export function providersForTask(task: AiTask): ProviderCatalog[] {
  return AI_PROVIDERS.filter((provider) => provider[task].length > 0)
}

export function findProvider(id: string): ProviderCatalog | undefined {
  return AI_PROVIDERS.find((provider) => provider.id === id)
}

export function isPresetModel(task: AiTask, providerId: string, modelId: string): boolean {
  return findProvider(providerId)?.[task].some((model) => model.id === modelId) ?? false
}

/**
 * Returns a user-facing error for a selection Chronicle can prove invalid.
 * Unknown providers remain available in developer mode and are validated by
 * their provider when first used; known providers must use a curated pair.
 */
export function aiSelectionError(
  task: AiTask,
  providerId: string,
  modelId: string,
  allowCustom: boolean,
): string | null {
  const provider = providerId.trim()
  const model = modelId.trim()
  const label = task === 'chat' ? 'Change summaries' : 'Semantic search'
  if (!provider && !model) return null
  if (!provider || !model) return `${label} requires both a provider and model.`
  if (allowCustom) return null
  const knownProvider = findProvider(provider)
  if (!knownProvider) {
    return `${label} must use one of the available provider and model options.`
  }
  if (knownProvider[task].some((option) => option.id === model)) return null
  return `${model} is not an available ${label.toLowerCase()} model for ${knownProvider.label}.`
}
