/** Typed client for the loopback-only Python AI service (C3). */
import type { components } from './generated'

/**
 * Provider credentials the app always supplies per request. Kept strict
 * (non-null) even though the wire schema makes them optional, because the
 * worker only builds this after confirming provider, model, and key exist.
 */
export interface ProviderRequest {
  provider: string
  model: string
  apiKey: string
}
export type AnnotateRequest = components['schemas']['AnnotateRequest']
/** Annotation plus token usage and estimated cost (C3). */
export type AnnotateResponse = components['schemas']['AnnotateResponse']
export type EmbedTextResponse = components['schemas']['EmbedTextResponse']
export type TokenUsage = components['schemas']['TokenUsage']
export type CostEstimate = components['schemas']['CostEstimate']

export class AiServiceError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code: string,
  ) {
    super(message)
  }

  get retryable(): boolean {
    return this.status >= 500
  }
}

export interface AiClient {
  health(): Promise<boolean>
  annotate(request: AnnotateRequest): Promise<AnnotateResponse>
  embedText(request: ProviderRequest & { text: string }): Promise<EmbedTextResponse>
}

async function readError(response: Response): Promise<AiServiceError> {
  const fallback = `AI service returned HTTP ${response.status}`
  try {
    const body = (await response.json()) as {
      detail?: { code?: string; message?: string }
    }
    return new AiServiceError(
      body.detail?.message ?? fallback,
      response.status,
      body.detail?.code ?? 'service_error',
    )
  } catch {
    return new AiServiceError(fallback, response.status, 'service_error')
  }
}

async function post<T>(baseUrl: string, path: string, body: unknown): Promise<T> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  })
  if (!response.ok) throw await readError(response)
  return (await response.json()) as T
}

export function createAiClient(baseUrl = 'http://127.0.0.1:8765'): AiClient {
  return {
    async health(): Promise<boolean> {
      try {
        const response = await fetch(`${baseUrl}/health`, {
          signal: AbortSignal.timeout(1_000),
        })
        return response.ok
      } catch {
        return false
      }
    },
    annotate: (request) => post<AnnotateResponse>(baseUrl, '/annotate', request),
    embedText: (request) => post<EmbedTextResponse>(baseUrl, '/embed-text', request),
  }
}
