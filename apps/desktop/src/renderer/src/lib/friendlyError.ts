const IPC_PREFIX = /^Error invoking remote method '[^']+': (?:Error: )?/

/** Convert Electron IPC/internal failures into short, actionable UI copy. */
export function friendlyError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error)
  const message = raw.replace(IPC_PREFIX, '')

  if (/Google sign-in timed out/i.test(message)) {
    return 'Google sign-in timed out. Nothing changed—try again when you are ready.'
  }
  if (/Google sign-in is temporarily unavailable|fetch failed|ECONNREFUSED/i.test(message)) {
    return 'That account action could not be completed. Continue locally and try again later.'
  }
  if (/Google sign-in was cancelled|access_denied/i.test(message)) {
    return 'Google sign-in was cancelled. Nothing changed.'
  }
  return message
}
