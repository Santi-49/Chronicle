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
export type SupportedFormat = 'png' | 'jpg' | 'jpeg'

/** A supported input file supplied to an annotation operation. */
export interface ImageInput {
  base64: string
  mediaType: 'image/png' | 'image/jpeg'
  format: SupportedFormat //for POST-01
}

/** The AI's structured output for one version — validated against output.schema.json. */
export interface VersionAnnotation {
  /** One plain-English sentence. Diff for v2+, description for v1. */
  summary: string
  /** 1–6 specific visual changes, most important first (v1: key visual elements). */
  changes: string[]
  /** 3–8 lowercase keywords for search. */
  tags: string[]
  /**
   * Optional self-assessed confidence/coverage (0–1); null when not estimated.
   * Present so future formats with partial extraction need no contract change.
   */
  confidence?: number | null
}

export interface AnnotateVersionInput {
  fileName: string
  format: SupportedFormat //POST-01 implementation
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
