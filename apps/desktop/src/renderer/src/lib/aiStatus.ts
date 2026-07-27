/**
 * User-facing copy for a version's AI status, shared by the timeline, details,
 * and queue screens so they never disagree.
 *
 * 'deferred' means the file was captured and its annotation job is queued, but
 * the AI service that is running cannot annotate that format — an older sidecar
 * beside a newer app. The copy has to say that honestly: "pending" would imply
 * a summary is seconds away.
 */
import { formatById, supportsAnnotation, type FormatId } from '../../../shared/formats'
import type { AiStatus } from '../../../shared/ipc'

const LABELS: Record<AiStatus, string> = {
  done: 'Summary ready',
  pending: 'Summary pending',
  deferred: 'Summary not supported yet',
  failed: 'Summary failed',
  none: 'Restored version',
}

export function aiStatusLabel(status: AiStatus): string {
  return LABELS[status]
}

/** Short label for the compact status pill on the details screen. */
export function aiStatusPill(status: AiStatus): string {
  if (status === 'done') return 'Ready'
  if (status === 'none') return 'Restore'
  if (status === 'deferred') return 'queued'
  return status
}

/** The headline shown in place of a summary that does not exist yet. */
export function aiStatusLead(status: AiStatus, format: FormatId | null): string {
  if (status === 'pending') return 'Waiting for an AI change summary.'
  if (status === 'deferred') return `No AI change summary for ${formatLabel(format)} files yet.`
  if (status === 'none') return 'Restored version.'
  return 'This version is stored locally. Its AI summary is not available yet.'
}

/** The longer explanation shown beneath the headline. */
export function aiStatusExplanation(status: AiStatus, format: FormatId | null): string {
  if (status === 'pending') return 'The AI change summary is being generated.'
  if (status === 'deferred') {
    return (
      `Chronicle captures, versions, restores, and searches ${formatLabel(format)} files. ` +
      'The AI service running on this device cannot summarize this format, so the version ' +
      'stays queued and is summarized automatically once a service that supports it runs.'
    )
  }
  if (status === 'none') return 'Restored version.'
  return 'This version is stored locally. Its AI summary is not available yet.'
}

function formatLabel(format: FormatId | null): string {
  return format ? formatById(format).label : 'this file type'
}

/**
 * Asset-card text when the newest version has no summary yet. An asset carries
 * no AI status of its own, so the format decides whether a summary is coming.
 * Since POST-02 the registry sends every captured format, so this reads
 * 'pending' in practice; a service that cannot annotate one shows 'deferred' on
 * the version itself, where the C1 status is available.
 */
export function assetSummaryFallback(asset: {
  format: FormatId | null
  lastSummary: string | null
}): string {
  const descriptor = asset.format ? formatById(asset.format) : null
  return descriptor && !supportsAnnotation(descriptor)
    ? aiStatusLead('deferred', asset.format)
    : aiStatusLead('pending', asset.format)
}
