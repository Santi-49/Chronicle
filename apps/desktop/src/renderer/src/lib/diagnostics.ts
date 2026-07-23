export type DiagnosticLogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface DiagnosticLogEntry {
  id: number
  timestamp: string
  level: DiagnosticLogLevel
  message: string
}

const MAX_LOG_ENTRIES = 250
const MAX_MESSAGE_LENGTH = 4_000
const SECRET_KEY = /password|passphrase|secret|token|authorization|cookie|api[-_]?key/i
const listeners = new Set<() => void>()
const entries: DiagnosticLogEntry[] = []
let nextId = 1
let installed = false

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|key|token)-[A-Za-z0-9_-]{12,}\b/gi, '[redacted]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return redactString(value)
  if (value instanceof Error) {
    return redactString(value.stack || `${value.name}: ${value.message}`)
  }
  if (typeof value === 'undefined') return 'undefined'
  if (typeof value === 'bigint') return `${value}n`
  if (typeof value === 'function') return `[Function ${value.name || 'anonymous'}]`

  try {
    const seen = new WeakSet<object>()
    const serialized = JSON.stringify(value, (key, nestedValue: unknown) => {
      if (SECRET_KEY.test(key)) return '[redacted]'
      if (typeof nestedValue === 'string') return redactString(nestedValue)
      if (typeof nestedValue === 'bigint') return `${nestedValue}n`
      if (typeof nestedValue === 'object' && nestedValue !== null) {
        if (seen.has(nestedValue)) return '[Circular]'
        seen.add(nestedValue)
      }
      return nestedValue
    })
    return serialized ?? String(value)
  } catch {
    return String(value)
  }
}

export function addDiagnosticLog(
  level: DiagnosticLogLevel,
  values: unknown[],
  timestamp = new Date().toISOString(),
): void {
  const rawMessage = values.map(formatValue).join(' ')
  const message =
    rawMessage.length > MAX_MESSAGE_LENGTH
      ? `${rawMessage.slice(0, MAX_MESSAGE_LENGTH)}…`
      : rawMessage
  entries.push({ id: nextId++, timestamp, level, message })
  if (entries.length > MAX_LOG_ENTRIES) entries.splice(0, entries.length - MAX_LOG_ENTRIES)
  listeners.forEach((listener) => listener())
}

export function getDiagnosticLogs(): DiagnosticLogEntry[] {
  return [...entries]
}

export function clearDiagnosticLogs(): void {
  entries.splice(0)
  listeners.forEach((listener) => listener())
}

export function subscribeToDiagnosticLogs(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function installRendererDiagnostics(target: Console = console): void {
  if (installed) return
  installed = true

  const methods: Array<[keyof Pick<Console, 'debug' | 'log' | 'info' | 'warn' | 'error'>, DiagnosticLogLevel]> = [
    ['debug', 'debug'],
    ['log', 'info'],
    ['info', 'info'],
    ['warn', 'warn'],
    ['error', 'error'],
  ]

  for (const [method, level] of methods) {
    const original = target[method].bind(target)
    target[method] = ((...values: unknown[]) => {
      addDiagnosticLog(level, values)
      original(...values)
    }) as Console[typeof method]
  }

  if (typeof globalThis.addEventListener === 'function') {
    globalThis.addEventListener('error', (event) => {
      const errorEvent = event as ErrorEvent
      addDiagnosticLog('error', [
        'Uncaught renderer error:',
        errorEvent.error ?? errorEvent.message,
      ])
    })
    globalThis.addEventListener('unhandledrejection', (event) => {
      addDiagnosticLog('error', [
        'Unhandled renderer promise rejection:',
        (event as PromiseRejectionEvent).reason,
      ])
    })
  }

  addDiagnosticLog('info', ['Chronicle renderer diagnostics started'])
}
