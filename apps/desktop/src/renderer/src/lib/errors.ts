/** Converts Electron's implementation-heavy IPC rejection into UI-safe copy. */
export function friendlyIpcError(error: unknown, fallback = 'The operation could not be completed.'): string {
  const raw = error instanceof Error ? error.message : String(error ?? '')
  const message = raw
    .replace(/^Error:\s+(?=Error invoking remote method)/, '')
    .replace(/^Error invoking remote method ['"][^'"]+['"]:\s*/, '')
    .replace(/^(?:TypeError|RangeError|Error):\s*/, '')
    .trim()
  return message || fallback
}
