/**
 * User-facing copy for a version's AI status, shared by the timeline, details,
 * and queue screens so they never disagree.
 *
 * 'deferred' is the POST-02 state: the file was captured and its annotation job
 * is queued, but the AI service has no adapter for that format yet. The copy has
 * to say that honestly — "pending" would imply a summary is seconds away.
 */
import { formatById, type FormatId } from '../../../shared/formats'
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

/** The sentence shown in place of a summary that does not exist yet. */
export function aiStatusExplanation(status: AiStatus, format: FormatId | null): string {
  if (status === 'pending') return 'The AI change summary is being generated.'
  if (status === 'deferred') {
    const label = format ? formatById(format).label : 'this file type'
    return (
      `Chronicle captures and displays ${label} versions, but AI change summaries ` +
      'for this format are not implemented yet. This version stays queued and will ' +
      'be summarized automatically once support ships.'
    )
  }
  if (status === 'none') return 'Restored version.'
  return 'This version is stored locally. Its AI summary is not available yet.'
}
