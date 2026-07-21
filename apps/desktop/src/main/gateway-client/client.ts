import type { AccountState } from '../../shared/ipc'
import type { AppSettings } from '../../shared/settings'
import type { components } from '../../../../../packages/contracts/api/generated'

type TokenPair = components['schemas']['TokenPair']
type User = components['schemas']['UserWithRoles']
type AccountSettingsRead = components['schemas']['AccountSettingsRead']
// FastAPI may emit distinct input/output component names when defaults differ.
// Index through the operation's generated request schema instead of naming the
// Pydantic component directly, so either valid OpenAPI representation works.
type PortableSettings = components['schemas']['AccountSettingsUpdate']['settings']
type EncryptedSecretRead = components['schemas']['EncryptedSecretRead']

export interface TokenStore {
  read(): TokenPair | null
  write(tokens: TokenPair): void
  clear(): void
}

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

export function createControlPlaneClient(
  getBaseUrl: () => string,
  tokens: TokenStore,
): ControlPlaneClient {
  async function raw<T>(path: string, init: RequestInit = {}, authenticated = false): Promise<T> {
    const headers = new Headers(init.headers)
    if (init.body !== undefined) headers.set('content-type', 'application/json')
    if (authenticated) {
      const current = tokens.read()
      if (!current) throw new ControlPlaneError('Sign in required', 401, null)
      headers.set('authorization', `Bearer ${current.access_token}`)
    }
    let response = await fetch(`${getBaseUrl()}${path}`, { ...init, headers })
    if (response.status === 401 && authenticated && tokens.read()) {
      const refresh = tokens.read()!.refresh_token
      const refreshed = await fetch(`${getBaseUrl()}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: { authorization: `Bearer ${refresh}` },
      })
      if (refreshed.ok) {
        tokens.write((await refreshed.json()) as TokenPair)
        headers.set('authorization', `Bearer ${tokens.read()!.access_token}`)
        response = await fetch(`${getBaseUrl()}${path}`, { ...init, headers })
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
      try {
        const response = await fetch(`${getBaseUrl()}/health`, { signal: controller.signal })
        if (!response.ok) return false
        const body = await response.json() as { status?: unknown; service?: unknown }
        return body.status === 'ok' && body.service === 'chronicle-control-plane'
      } catch {
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
  }
}
