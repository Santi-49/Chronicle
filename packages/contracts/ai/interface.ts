/**
 * C3 — AI engine contract (spec F4/F7).
 *
 * Defines the operations the app can request, their inputs and outputs, and
 * externally observable behavior. It deliberately does not define prompts,
 * models, tools, orchestration, retries, storage, or internal class structure.
 * An implementation may use a direct multimodal call, deterministic diffing,
 * tools, an agent, or a multi-stage pipeline as long as it satisfies this
 * contract.
 */

/** A supported image supplied to an annotation operation. */
export interface ImageInput {
  base64: string
  mediaType: 'image/png' | 'image/jpeg'
}

/** The AI's structured output for one version — validated against output.schema.json. */
export interface VersionAnnotation {
  /** One plain-English sentence. Diff for v2+, description for v1. */
  summary: string
  /** 1–6 specific visual changes, most important first (v1: key visual elements). */
  changes: string[]
  /** 3–8 lowercase keywords for search. */
  tags: string[]
}

export interface AnnotateVersionInput {
  fileName: string
  /** null → this is the asset's first version: describe it instead of diffing. */
  previous: ImageInput | null
  current: ImageInput
}

export interface AiEngine {
  /**
   * Explain a version in a searchable form. When `previous` is present the
   * output describes the change; otherwise it describes the first version.
   */
  annotateVersion(input: AnnotateVersionInput): Promise<VersionAnnotation>

  /** Return a semantic-search vector for the supplied text. */
  embedText(text: string): Promise<number[]>
}
