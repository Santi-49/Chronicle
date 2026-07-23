import type {
  ApplicationDiagnostic,
  ApplicationDiagnosticLevel,
  ApplicationDiagnosticSource,
} from '../shared/ipc'
import { sanitizeControlPlaneData } from './gateway-client/client'

export interface ApplicationDiagnosticDraft {
  timestamp?: string
  level: ApplicationDiagnosticLevel
  source: ApplicationDiagnosticSource
  event: string
  message: string
  context?: unknown
}

export type ApplicationDiagnosticSink = (entry: ApplicationDiagnosticDraft) => void

/** Converts thrown values into useful, credential-sanitized diagnostic metadata. */
export function diagnosticError(error: unknown): unknown {
  if (error instanceof Error) {
    const errorWithDetails = error as Error & { status?: unknown; detail?: unknown }
    return sanitizeControlPlaneData({
      name: error.name,
      message: error.message,
      stack: error.stack ?? null,
      ...(typeof errorWithDetails.status === 'number'
        ? { status: errorWithDetails.status }
        : {}),
      ...('detail' in error ? { detail: errorWithDetails.detail } : {}),
    })
  }
  return sanitizeControlPlaneData({ thrown: error })
}

export function createApplicationDiagnostic(
  id: number,
  draft: ApplicationDiagnosticDraft,
): ApplicationDiagnostic {
  return {
    id,
    timestamp: draft.timestamp ?? new Date().toISOString(),
    level: draft.level,
    source: draft.source,
    event: draft.event,
    message: draft.message,
    context: draft.context === undefined ? null : sanitizeControlPlaneData(draft.context),
  }
}
