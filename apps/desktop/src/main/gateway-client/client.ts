import type { AccountState, ControlPlaneDiagnostic } from '../../shared/ipc'
import type { AppSettings } from '../../shared/settings'
import type { components } from '../../../../../packages/contracts/api/generated'
import type { TelemetryBatch as TelemetryBatchPayload } from '../telemetry/emitter'

type TokenPair = components['schemas']['TokenPair']
type User = components['schemas']['UserWithRoles']
type AccountSettingsRead = components['schemas']['AccountSettingsRead']
// FastAPI may emit distinct input/output component names when defaults differ.
// Index through the operation's generated request schema instead of naming the
// Pydantic component directly, so either valid OpenAPI representation works.
type PortableSettings = components['schemas']['AccountSettingsUpdate']['settings']
type EncryptedSecretRead = components['schemas']['EncryptedSecretRead']
// C6 telemetry wire schemas — the request bodies are validated against the
// generated contract so the emitter allowlist can never drift from it silently.
type TelemetryBatch = components['schemas']['TelemetryBatch']

export interface TokenStore {
  read(): TokenPair | null
  write(tokens: TokenPair): void
  clear(): void
}

export type ControlPlaneDiagnosticSink = (
  entry: Omit<ControlPlaneDiagnostic, 'id'>,
) => void

export interface InstallationDescriptor {
  installationId: string
  appVersion: string
  osFamily: 'windows' | 'macos' | 'linux' | 'other'
}

export interface ControlPlaneClient {
  health(): Promise<boolean>
  accountState(): Promise<AccountState>
  register(email: string, password: string): Promise<AccountState>
  login(email: string, password: string): Promise<AccountState>
  loginWithGoogleCredential(credential: string): Promise<AccountState>
  linkGoogleCredential(credential: string): Promise<AccountState>
  logout(): Promise<void>
  registerInstallation(descriptor: InstallationDescriptor): Promise<void>
  linkInstallation(installationId: string): Promise<void>
  getSettings(): Promise<AccountSettingsRead>
  putSettings(settings: PortableSettings, expectedRevision: number): Promise<AccountSettingsRead>
  getEncryptedSecret(): Promise<EncryptedSecretRead | null>
  putEncryptedSecret(envelope: string, expectedRevision: number): Promise<EncryptedSecretRead>
  deleteEncryptedSecret(): Promise<void>
  /** POST /api/v1/telemetry/batches — best-effort, offline-tolerant. */
  sendTelemetryBatch(batch: TelemetryBatchPayload): Promise<void>
}

export class ControlPlaneError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly detail: unknown,
  ) {
    super(message)
  }
}

function state(user: User): AccountState {
  return {
    mode: 'signed-in',
    email: user.email,
    isAdmin: user.roles.includes('admin'),
  }
}

const SECRET_FIELD = /^(?:password|passphrase|credential|envelope|token|secret|api_key|access_token|refresh_token|authorization|cookie|client_secret)$/i

function redactString(value: string): string {
  return value
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]+/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|key|token)-[A-Za-z0-9_-]{12,}\b/gi, '[redacted]')
    .replace(/\bAIza[A-Za-z0-9_-]{20,}\b/g, '[redacted]')
}

/** Preserve the outbound shape while removing values that could grant access. */
export function sanitizeControlPlaneData(value: unknown, key = ''): unknown {
  if (SECRET_FIELD.test(key)) {
    if (key.toLowerCase() === 'envelope' && typeof value === 'string') {
      return `[encrypted envelope redacted: ${value.length} characters]`
    }
    return '[redacted]'
  }
  if (typeof value === 'string') return redactString(value)
  if (Array.isArray(value)) return value.map((item) => sanitizeControlPlaneData(item))
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([nestedKey, nestedValue]) => [
        nestedKey,
        sanitizeControlPlaneData(nestedValue, nestedKey),
      ]),
    )
  }
  return value
}

function diagnosticBody(body: BodyInit | null | undefined): unknown | null {
  if (body === undefined || body === null) return null
  if (typeof body !== 'string') return `[non-JSON request body: ${body.constructor.name}]`
  try {
    return sanitizeControlPlaneData(JSON.parse(body) as unknown)
  } catch {
    return redactString(body)
  }
}

async function diagnosticResponseBody(response: Response): Promise<unknown | null> {
  if (response.status === 204) return null
  const body = await response.clone().text().catch(() => '')
  if (body === '') return null
  try {
    return sanitizeControlPlaneData(JSON.parse(body) as unknown)
  } catch {
    return redactString(body)
  }
}

function diagnosticHeaders(headers: Headers): Record<string, string> {
  return Object.fromEntries(
    [...headers.entries()].map(([name, value]) => [
      name,
      SECRET_FIELD.test(name) ? '[redacted]' : redactString(value),
    ]),
  )
}

function diagnosticUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl)
    if (url.username) url.username = '[redacted]'
    if (url.password) url.password = '[redacted]'
    for (const key of [...url.searchParams.keys()]) {
      if (SECRET_FIELD.test(key)) url.searchParams.set(key, '[redacted]')
    }
    return url.toString()
  } catch {
    return redactString(rawUrl)
  }
}

export function portableSettings(local: AppSettings): PortableSettings {
  return {
    schema_version: 1,
    settings_sync_enabled: local.controlPlane.settingsSyncEnabled,
    api_key_sync_enabled: local.controlPlane.apiKeySyncEnabled,
    appearance: { ...local.appearance },
    ai: {
      mode: local.ai.mode,
      chat: { ...local.ai.chat },
      embeddings: { ...local.ai.embeddings },
    },
    telemetry: {
      enabled: local.controlPlane.telemetryOptIn,
      notice_version: '2026-07-21',
      updated_at: new Date().toISOString(),
    },
  }
}

export function resolveControlPlaneBaseUrl(
  storedUrl: string | undefined,
  configuredUrl: string,
  preferConfigured: boolean,
): string {
  if (preferConfigured && configuredUrl.trim() !== '') return configuredUrl.trim()
  return storedUrl?.trim() || configuredUrl.trim()
}

export function createControlPlaneClient(
  getBaseUrl: () => string,
  tokens: TokenStore,
  onDiagnostic: ControlPlaneDiagnosticSink = () => {},
): ControlPlaneClient {
  async function auditedFetch(path: string, init: RequestInit): Promise<Response> {
    const startedAt = Date.now()
    const method = init.method?.toUpperCase() ?? 'GET'
    const headers = new Headers(init.headers)
    const url = `${getBaseUrl()}${path}`
    try {
      const response = await fetch(url, init)
      const responseBody = await diagnosticResponseBody(response)
      onDiagnostic({
        timestamp: new Date().toISOString(),
        kind: 'request',
        method,
        url: diagnosticUrl(url),
        requestHeaders: diagnosticHeaders(headers),
        requestBody: diagnosticBody(init.body),
        responseBody,
        status: response.status,
        ok: response.ok,
        durationMs: Date.now() - startedAt,
        error: response.ok ? null : `HTTP ${response.status}`,
      })
      return response
    } catch (error) {
      onDiagnostic({
        timestamp: new Date().toISOString(),
        kind: 'request',
        method,
        url: diagnosticUrl(url),
        requestHeaders: diagnosticHeaders(headers),
        requestBody: diagnosticBody(init.body),
        responseBody: null,
        status: null,
        ok: false,
        durationMs: Date.now() - startedAt,
        error: redactString(error instanceof Error ? error.message : String(error)),
      })
      throw error
    }
  }

  async function raw<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body !== undefined) headers.set('content-type', 'application/json')
    if (authenticated) {
      const current = tokens.read()
      if (!current) throw new ControlPlaneError('Sign in required', 401, null)
      headers.set('authorization', `Bearer ${current.access_token}`)
    }
    let response = await auditedFetch(path, { ...init, headers })
    if (response.status === 401 && authenticated && tokens.read()) {
      const refresh = tokens.read()!.refresh_token
      const refreshed = await auditedFetch('/api/v1/auth/refresh', {
        method: 'POST',
        headers: { authorization: `Bearer ${refresh}` },
      })
      if (refreshed.ok) {
        tokens.write((await refreshed.json()) as TokenPair)
        headers.set('authorization', `Bearer ${tokens.read()!.access_token}`)
        response = await auditedFetch(path, { ...init, headers })
      } else {
        tokens.clear()
      }
    }
    if (!response.ok) {
      const body = await response.text()
      let detail: unknown = body
      try { detail = JSON.parse(body) as unknown } catch { /* non-JSON error body */ }
      throw new ControlPlaneError(`Control plane request failed (${response.status})`, response.status, detail)
    }
    if (response.status === 204) return undefined as T
    return await response.json() as T
  }

  async function me(): Promise<User> {
    return raw<User>('/api/v1/auth/me', {}, true)
  }

  async function acceptTokens(pair: TokenPair): Promise<AccountState> {
    tokens.write(pair)
    try { return state(await me()) } catch (error) { tokens.clear(); throw error }
  }

  return {
    async health() {
      const controller = new AbortController()
      const timeout = setTimeout(() => controller.abort(), 3_000)
      const startedAt = Date.now()
      const url = `${getBaseUrl()}/health`
      try {
        const response = await fetch(url, { signal: controller.signal })
        const body = await response.json().catch(() => null) as {
          status?: unknown
          service?: unknown
          version?: unknown
        } | null
        const healthy =
          response.ok &&
          body?.status === 'ok' &&
          body.service === 'chronicle-control-plane'
        onDiagnostic({
          timestamp: new Date().toISOString(),
          kind: 'health',
          method: 'GET',
          url: diagnosticUrl(url),
          requestHeaders: {},
          requestBody: null,
          responseBody: sanitizeControlPlaneData(body),
          status: response.status,
          ok: healthy,
          durationMs: Date.now() - startedAt,
          error: healthy ? null : response.ok ? 'Unexpected health response' : `HTTP ${response.status}`,
        })
        return healthy
      } catch (error) {
        onDiagnostic({
          timestamp: new Date().toISOString(),
          kind: 'health',
          method: 'GET',
          url: diagnosticUrl(url),
          requestHeaders: {},
          requestBody: null,
          responseBody: null,
          status: null,
          ok: false,
          durationMs: Date.now() - startedAt,
          error: redactString(error instanceof Error ? error.message : String(error)),
        })
        return false
      } finally {
        clearTimeout(timeout)
      }
    },
    async accountState() {
      if (!tokens.read()) return { mode: 'local', email: null, isAdmin: false }
      try { return state(await me()) } catch { return { mode: 'local', email: null, isAdmin: false } }
    },
    async register(email, password) {
      const prefix = email.split('@')[0] || 'Chronicle'
      await raw<User>('/api/v1/auth/register', {
        method: 'POST', body: JSON.stringify({ email, password, name: prefix, surname: 'User' }),
      })
      return acceptTokens(await raw<TokenPair>('/api/v1/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      }))
    },
    async login(email, password) {
      return acceptTokens(await raw<TokenPair>('/api/v1/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password }),
      }))
    },
    async loginWithGoogleCredential(credential) {
      return acceptTokens(await raw<TokenPair>('/api/v1/auth/google', {
        method: 'POST', body: JSON.stringify({ credential }),
      }))
    },
    async linkGoogleCredential(credential) {
      await raw<void>('/api/v1/auth/google/link', {
        method: 'POST', body: JSON.stringify({ credential }),
      }, true)
      return state(await me())
    },
    async logout() {
      if (tokens.read()) {
        try { await raw<void>('/api/v1/auth/logout', { method: 'POST' }, true) } catch { /* local logout still succeeds */ }
      }
      tokens.clear()
    },
    async registerInstallation(descriptor) {
      await raw('/api/v1/installations/register', {
        method: 'POST',
        body: JSON.stringify({
          installation_id: descriptor.installationId,
          app_version: descriptor.appVersion,
          os_family: descriptor.osFamily,
        }),
      })
    },
    async linkInstallation(installationId) {
      await raw(`/api/v1/installations/${installationId}/link`, { method: 'PUT' }, true)
    },
    getSettings: () => raw<AccountSettingsRead>('/api/v1/account/settings', {}, true),
    putSettings: (settings, expectedRevision) => raw<AccountSettingsRead>('/api/v1/account/settings', {
      method: 'PUT', body: JSON.stringify({ settings, expected_revision: expectedRevision }),
    }, true),
    async getEncryptedSecret() {
      try { return await raw<EncryptedSecretRead>('/api/v1/account/secrets', {}, true) }
      catch (error) { if (error instanceof ControlPlaneError && error.status === 404) return null; throw error }
    },
    putEncryptedSecret: (envelope, expectedRevision) => raw<EncryptedSecretRead>('/api/v1/account/secrets', {
      method: 'PUT', body: JSON.stringify({ envelope, expected_revision: expectedRevision }),
    }, true),
    deleteEncryptedSecret: () => raw<void>('/api/v1/account/secrets', { method: 'DELETE' }, true),
    async sendTelemetryBatch(payload) {
      // Typed against the generated C6 contract, not a hand-shaped object.
      const batch: TelemetryBatch = payload
      await raw<void>('/api/v1/telemetry/batches', {
        method: 'POST', body: JSON.stringify(batch),
      })
    },
  }
}
