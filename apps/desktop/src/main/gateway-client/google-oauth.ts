import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import { BrowserWindow, shell } from 'electron'

const CALLBACK_PATH = '/oauth2callback'

function base64Url(bytes: Buffer): string {
  return bytes.toString('base64url')
}

function tokenNonce(idToken: string): string | undefined {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split('.')[1]!, 'base64url').toString('utf8')) as unknown
    return payload && typeof payload === 'object' && 'nonce' in payload
      ? String((payload as { nonce: unknown }).nonce)
      : undefined
  } catch {
    return undefined
  }
}

export async function obtainGoogleIdToken(clientId: string): Promise<string> {
  if (!clientId) throw new Error('GOOGLE_OAUTH_CLIENT_ID is not configured')
  const state = base64Url(randomBytes(32))
  const nonce = base64Url(randomBytes(32))
  const verifier = base64Url(randomBytes(64))
  const challenge = base64Url(createHash('sha256').update(verifier).digest())

  const server = http.createServer()
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(0, '127.0.0.1', () => resolve())
  })
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Could not start the Google sign-in callback')
  }
  const redirectUri = `http://127.0.0.1:${address.port}${CALLBACK_PATH}`
  const authorization = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorization.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    nonce,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    prompt: 'select_account',
  }).toString()

  let rejectCodeWait: ((reason: Error) => void) | undefined
  const codePromise = new Promise<string>((resolve, reject) => {
    rejectCodeWait = reject
    const timeout = setTimeout(() => {
      server.close()
      reject(new Error('Google sign-in timed out'))
    }, 120_000)
    server.on('request', (request, response) => {
      const url = new URL(request.url ?? '/', redirectUri)
      if (url.pathname !== CALLBACK_PATH) {
        response.writeHead(404).end('Not found')
        return
      }
      const finish = (status: number, message: string): void => {
        response.writeHead(status, { 'content-type': 'text/html; charset=utf-8' })
        response.end(`<main style="font:16px system-ui;padding:48px"><h1>${message}</h1><p>You can close this window and return to Chronicle.</p></main>`)
        clearTimeout(timeout)
        server.close()
      }
      if (url.searchParams.get('state') !== state) {
        finish(400, 'Chronicle could not verify this sign-in')
        reject(new Error('Google sign-in state mismatch'))
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (error || !code) {
        finish(400, 'Google sign-in was cancelled')
        reject(new Error(error || 'Google did not return an authorization code'))
        return
      }
      finish(200, 'Signed in to Chronicle')
      const chronicleWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
      chronicleWindow?.show()
      chronicleWindow?.focus()
      resolve(code)
    })
  })

  try {
    try {
      await shell.openExternal(authorization.toString())
    } catch (error) {
      const openError = error instanceof Error ? error : new Error(String(error))
      rejectCodeWait?.(openError)
      await codePromise.catch(() => {})
      throw new Error('Chronicle could not open your default browser')
    }
    const code = await codePromise
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        code,
        code_verifier: verifier,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
      }),
    })
    if (!response.ok) throw new Error(`Google token exchange failed (${response.status})`)
    const body = await response.json() as { id_token?: string }
    if (!body.id_token || tokenNonce(body.id_token) !== nonce) {
      throw new Error('Google returned an invalid identity response')
    }
    return body.id_token
  } finally {
    server.close()
  }
}
