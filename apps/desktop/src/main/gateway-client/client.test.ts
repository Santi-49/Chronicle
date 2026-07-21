import { afterEach, describe, expect, it, vi } from 'vitest'
import { createControlPlaneClient, portableSettings, type TokenStore } from './client'
import type { AppSettings } from '../../shared/settings'

function tokenStore(initial: { access_token: string; refresh_token: string; token_type: string } | null = null): TokenStore {
  let value = initial
  return {
    read: () => value,
    write: (tokens) => { value = tokens },
    clear: () => { value = null },
  }
}

const user = {
  id: '00000000-0000-0000-0000-000000000001',
  email: 'person@example.com',
  name: 'Person',
  surname: 'Example',
  is_active: true,
  created_at: '2026-07-21T00:00:00Z',
  updated_at: '2026-07-21T00:00:00Z',
  roles: ['user'],
}

afterEach(() => vi.unstubAllGlobals())

describe('control-plane client', () => {
  it('stores Chronicle tokens after Google login and returns renderer-safe account state', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'access', refresh_token: 'refresh', token_type: 'bearer',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(user), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createControlPlaneClient(() => 'http://control-plane', tokenStore())
    await expect(client.loginWithGoogleCredential('google-id-token')).resolves.toEqual({
      mode: 'signed-in', email: 'person@example.com', isAdmin: false,
    })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://control-plane/api/v1/auth/google')
  })

  it('links Google only through the authenticated explicit-link endpoint', async () => {
    const store = tokenStore({ access_token: 'access', refresh_token: 'refresh', token_type: 'bearer' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(user), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)

    const client = createControlPlaneClient(() => 'http://control-plane', store)
    await expect(client.linkGoogleCredential('google-id-token')).resolves.toMatchObject({ mode: 'signed-in' })
    expect(fetchMock.mock.calls[0]?.[0]).toBe('http://control-plane/api/v1/auth/google/link')
    const headers = new Headers(fetchMock.mock.calls[0]?.[1]?.headers)
    expect(headers.get('authorization')).toBe('Bearer access')
  })

  it('refreshes an expired Chronicle access token once', async () => {
    const store = tokenStore({ access_token: 'old', refresh_token: 'refresh', token_type: 'bearer' })
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        access_token: 'new', refresh_token: 'new-refresh', token_type: 'bearer',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(user), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createControlPlaneClient(() => 'http://control-plane', store)
    await expect(client.accountState()).resolves.toMatchObject({ mode: 'signed-in' })
    expect(fetchMock).toHaveBeenCalledTimes(3)
    expect(store.read()?.access_token).toBe('new')
  })

  it('serializes only the portable settings allowlist', () => {
    const settings: AppSettings = {
      appearance: { theme: 'dark' },
      ai: {
        mode: 'local',
        chat: { provider: 'google', model: 'gemini' },
        embeddings: { provider: 'openai', model: 'embedding' },
      },
      controlPlane: {
        baseUrl: 'https://internal.example', telemetryOptIn: true,
        settingsSyncEnabled: true, apiKeySyncEnabled: false,
      },
    }
    const portable = portableSettings(settings)
    expect(JSON.stringify(portable)).not.toContain('internal.example')
    expect(portable.ai.chat.provider).toBe('google')
    expect(portable.appearance.theme).toBe('dark')
    expect(portable.telemetry.enabled).toBe(true)
  })

  it('installation registration cannot accidentally include local metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }))
    vi.stubGlobal('fetch', fetchMock)
    const client = createControlPlaneClient(() => 'http://control-plane', tokenStore())
    await client.registerInstallation({
      installationId: '00000000-0000-0000-0000-000000000001',
      appVersion: '0.1.0',
      osFamily: 'windows',
    })
    const body = String((fetchMock.mock.calls[0]?.[1] as RequestInit).body)
    expect(body).toContain('installation_id')
    expect(body).not.toMatch(/hostname|path|project|file/i)
  })
})
