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
      { id: 'gemini-embedding-001', label: 'Gemini Embedding 001', tier: 'Recommended' },
      { id: 'text-embedding-004', label: 'Text Embedding 004', tier: 'Lower cost' },
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
      { id: 'gpt-4o-mini', label: 'GPT-4o mini', tier: 'Fast · lower cost' },
      { id: 'gpt-4o', label: 'GPT-4o', tier: 'Balanced · recommended' },
      { id: 'gpt-4.1', label: 'GPT-4.1', tier: 'Highest quality · higher cost' },
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
      { id: 'anthropic.claude-3-5-haiku-20241022-v1:0', label: 'Claude 3.5 Haiku', tier: 'Fast · lower cost' },
      { id: 'anthropic.claude-3-5-sonnet-20241022-v2:0', label: 'Claude 3.5 Sonnet', tier: 'Balanced · recommended' },
      { id: 'amazon.nova-pro-v1:0', label: 'Amazon Nova Pro', tier: 'Higher quality' },
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
