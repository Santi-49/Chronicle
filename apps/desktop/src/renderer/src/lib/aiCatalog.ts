/**
 * Predefined AI provider/model catalog for the Settings screen.
 *
 * This is renderer-side presentation policy, not a contract: the AI engine is
 * model-agnostic (spec §6.4) and only ever receives the provider/model strings
 * the user selects. Chronicle ships a curated shortlist per provider spanning a
 * range of quality and price for each AI task (annotation vs. embeddings); the
 * "developer mode" toggle lets advanced users type any provider/model instead.
 *
 * Model identifiers follow each provider's own naming. Because keys are BYOK,
 * exact availability depends on the user's account — the labels describe the
 * quality/price tier so a non-expert can choose sensibly.
 */

export interface ModelOption {
  /** Identifier passed to LangChain's model factory. */
  id: string
  label: string
  /** Short quality/price hint shown under the option. */
  tier: string
}

export interface ProviderCatalog {
  id: string
  label: string
  /** Vision-capable models used for version annotation (the "commit message"). */
  chat: ModelOption[]
  /** Text-embedding models used for semantic search. Empty = provider has none. */
  embeddings: ModelOption[]
}

export const AI_PROVIDERS: ProviderCatalog[] = [
  {
    id: 'google',
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
    // Anthropic has no first-party embeddings API — pick another provider for embeddings.
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

/** True when the provider/model pair is one of the curated presets (else it's a custom/developer value). */
export function isPresetModel(task: AiTask, providerId: string, modelId: string): boolean {
  return findProvider(providerId)?.[task].some((model) => model.id === modelId) ?? false
}
