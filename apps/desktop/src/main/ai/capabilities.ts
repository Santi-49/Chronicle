/**
 * What the *running* AI service can annotate.
 *
 * The format registry says which formats Chronicle captures and which ones it
 * would ask the AI service to summarize. It cannot say whether the sidecar
 * actually beside this build implements them: a development checkout can have
 * an older sidecar venv, and an installed app can be mid-upgrade. So the app
 * asks (`GET /capabilities`) instead of assuming, and a version whose format
 * the service does not list keeps its annotation job queued — 'deferred' — and
 * says so, rather than showing a summary as permanently "pending".
 *
 * One cache is shared by the queue worker (which decides what to send) and the
 * C1 read paths (which decide what to display), so the two can never disagree.
 */
import { supportsAnnotation, type FormatDescriptor } from '../../shared/formats'
import type { AiClient } from './client'

/** How long to wait before asking again after the service failed to answer. */
const RETRY_AFTER_MS = 30_000

export interface AnnotationCapabilities {
  /**
   * The formats the service reports, fetching once and caching the answer.
   * Null means it did not answer — callers fail open and let the request
   * itself report an unsupported format.
   */
  formats(): Promise<string[] | null>
  /**
   * True when this format's annotation cannot run right now: either the
   * registry never sends it, or the service answered and left it out.
   * Sync, because C1 read paths cannot await; it uses the cached answer only.
   */
  isDeferred(format: FormatDescriptor | null): boolean
}

export function createAnnotationCapabilities(
  client: Pick<AiClient, 'capabilities'>,
  now: () => number = Date.now,
): AnnotationCapabilities {
  /** undefined = never answered, null = answered without an annotate list. */
  let reported: string[] | null | undefined
  let answered = false
  let lastAttemptAt = -Infinity
  let inFlight: Promise<string[] | null> | null = null

  async function fetchOnce(): Promise<string[] | null> {
    try {
      const response = await client.capabilities()
      reported = response?.annotate?.formats ?? null
      answered = true
      return reported
    } catch {
      // An unreachable service is the normal offline case, not an error worth
      // surfacing: leave the cache unanswered so a later poll can learn.
      return null
    } finally {
      lastAttemptAt = now()
      inFlight = null
    }
  }

  return {
    async formats(): Promise<string[] | null> {
      if (answered) return reported ?? null
      if (inFlight) return inFlight
      if (now() - lastAttemptAt < RETRY_AFTER_MS) return null
      inFlight = fetchOnce()
      return inFlight
    },

    isDeferred(format: FormatDescriptor | null): boolean {
      if (!format) return false
      if (!supportsAnnotation(format)) return true
      if (!answered || !reported) return false
      return !reported.includes(format.aiFormat as string)
    },
  }
}
