import { createHash, randomBytes } from 'node:crypto'
import http from 'node:http'
import { BrowserWindow, shell } from 'electron'

const CALLBACK_PATH = '/oauth2callback'

type CallbackTone = 'success' | 'error'

function callbackPage(tone: CallbackTone, title: string, message: string): string {
  const statusIcon = tone === 'success'
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.2 4.2L19 7"/></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 7v6M12 17h.01"/></svg>'
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title} · Chronicle</title>
  <style>
    :root {
      color-scheme: dark;
      font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --accent: #78a9ff; --accent-strong: #0f62fe; --background: #111111;
      --surface: #161616; --surface-raised: #202020; --border: #393939;
      --text-primary: #f4f4f4; --text-secondary: #c6c6c6; --text-muted: #a8a8a8;
      --success: #42be65; --danger: #ff453a;
      --mark-highlight: #78a9ff; --mark-node-a: #a6c8ff; --mark-node-b: #78a9ff;
    }
    @media (prefers-color-scheme: light) {
      :root {
        color-scheme: light; --accent: #0f62fe; --accent-strong: #0f62fe;
        --background: #f4f4f4; --surface: #ffffff; --surface-raised: #ffffff;
        --border: #d6d6d6; --text-primary: #161616; --text-secondary: #393939;
        --text-muted: #525252; --success: #198038; --danger: #b91c1c;
        --mark-highlight: #0043ce; --mark-node-a: #78a9ff; --mark-node-b: #0043ce;
      }
    }
    * { box-sizing: border-box; }
    body { min-height: 100vh; margin: 0; display: grid; place-items: center; padding: 24px; color: var(--text-primary); background: var(--background); }
    main { position: relative; width: min(100%, 520px); overflow: hidden; padding: 40px; background: var(--surface); border: 1px solid var(--border); border-radius: 8px; }
    main::before { position: absolute; inset: 0 0 auto; height: 4px; content: ''; background: var(--accent-strong); }
    .brand { display: flex; align-items: center; gap: 10px; margin-bottom: 48px; color: var(--text-primary); font-size: 16px; font-weight: 650; letter-spacing: -.01em; }
    .brand-mark { width: 32px; height: 32px; flex: 0 0 auto; }
    .mark-path { fill: none; stroke: var(--accent-strong); stroke-width: 8; stroke-linecap: round; }
    .mark-highlight { fill: none; stroke: var(--mark-highlight); stroke-width: 8; stroke-linecap: round; }
    .mark-node-a { fill: var(--mark-node-a); }
    .mark-node-b { fill: var(--mark-node-b); }
    .eyebrow { margin: 0 0 16px; color: ${tone === 'error' ? 'var(--danger)' : 'var(--success)'}; font-size: 11px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .status { display: grid; width: 48px; height: 48px; margin-bottom: 24px; place-items: center; color: ${tone === 'error' ? 'var(--danger)' : 'var(--success)'}; background: var(--surface-raised); border: 1px solid var(--border); border-radius: 6px; }
    .status svg { width: 24px; height: 24px; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
    h1 { margin: 0 0 16px; color: var(--text-primary); font-size: clamp(32px, 7vw, 44px); font-weight: 580; letter-spacing: -.045em; line-height: 1.05; }
    p { max-width: 420px; margin: 0; color: var(--text-secondary); font-size: 15px; line-height: 1.65; }
    .hint { margin-top: 32px; padding-top: 24px; color: var(--text-muted); border-top: 1px solid var(--border); font-size: 12px; }
    @media (max-width: 480px) { main { padding: 32px 24px; } .brand { margin-bottom: 40px; } }
  </style>
</head>
<body>
  <main>
    <div class="brand">
      <svg class="brand-mark" viewBox="0 0 48 48" fill="none" aria-hidden="true">
        <path class="mark-path" d="M38 12H19C11.8 12 8 16 8 22s3.8 10 11 10h12c5.5 0 8 2.7 8 7"/>
        <path class="mark-highlight" d="M38 12H19c-4.4 0-7.5 1.5-9.2 4.2"/>
        <circle class="mark-node-a" cx="38" cy="12" r="6"/>
        <circle class="mark-node-b" cx="39" cy="39" r="5"/>
      </svg>
      <span>Chronicle</span>
    </div>
    <p class="eyebrow">Google sign-in</p>
    <div class="status">${statusIcon}</div>
    <h1>${title}</h1>
    <p>${message}</p>
    <p class="hint">You can close this tab and return to the Chronicle app.</p>
  </main>
</body>
</html>`
}

function sendCallbackPage(
  response: http.ServerResponse,
  status: number,
  tone: CallbackTone,
  title: string,
  message: string,
): void {
  response.writeHead(status, {
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'",
    'content-type': 'text/html; charset=utf-8',
    'x-content-type-options': 'nosniff',
  })
  response.end(callbackPage(tone, title, message))
}

async function googleTokenError(response: Response): Promise<Error> {
  let code = ''
  try {
    const body = await response.json() as { error?: unknown }
    code = typeof body.error === 'string' ? body.error : ''
  } catch {
    // Google normally returns JSON, but the UI still gets a useful safe fallback.
  }
  if (code === 'invalid_client') {
    return new Error('Google rejected the OAuth client. Check the desktop client ID and secret.')
  }
  if (code === 'invalid_grant') {
    return new Error('Google sign-in expired or could not be verified. Start a new sign-in attempt.')
  }
  if (code === 'redirect_uri_mismatch') {
    return new Error('Google rejected the callback URL. Use an OAuth client of type Desktop app.')
  }
  return new Error(`Google token exchange failed (${response.status}${code ? `: ${code}` : ''})`)
}

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

export async function obtainGoogleIdToken(clientId: string, clientSecret?: string): Promise<string> {
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
  const codePromise = new Promise<{ code: string; response: http.ServerResponse }>((resolve, reject) => {
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
      const finish = (status: number, title: string, message: string): void => {
        sendCallbackPage(response, status, 'error', title, message)
        clearTimeout(timeout)
        server.close()
      }
      if (url.searchParams.get('state') !== state) {
        finish(400, 'We could not verify this sign-in', 'Return to Chronicle and start a new attempt.')
        reject(new Error('Google sign-in state mismatch'))
        return
      }
      const error = url.searchParams.get('error')
      const code = url.searchParams.get('code')
      if (error || !code) {
        finish(400, 'Google sign-in was cancelled', 'Nothing changed in your Chronicle account.')
        reject(new Error(error || 'Google did not return an authorization code'))
        return
      }
      clearTimeout(timeout)
      resolve({ code, response })
    })
  })

  let callbackResponse: http.ServerResponse | undefined
  try {
    try {
      await shell.openExternal(authorization.toString())
    } catch (error) {
      const openError = error instanceof Error ? error : new Error(String(error))
      rejectCodeWait?.(openError)
      await codePromise.catch(() => {})
      throw new Error('Chronicle could not open your default browser')
    }
    const callback = await codePromise
    callbackResponse = callback.response
    const tokenParameters: Record<string, string> = {
      client_id: clientId,
      code: callback.code,
      code_verifier: verifier,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    }
    if (clientSecret?.trim()) tokenParameters.client_secret = clientSecret.trim()
    const controller = new AbortController()
    const tokenTimeout = setTimeout(() => controller.abort(), 10_000)
    let response: Response
    try {
      response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(tokenParameters),
        signal: controller.signal,
      })
    } finally {
      clearTimeout(tokenTimeout)
    }
    if (!response.ok) throw await googleTokenError(response)
    const body = await response.json() as { id_token?: string }
    if (!body.id_token || tokenNonce(body.id_token) !== nonce) {
      throw new Error('Google returned an invalid identity response')
    }
    sendCallbackPage(
      callback.response,
      200,
      'success',
      'Identity verified',
      'Google verified your identity. Return to Chronicle while the app finishes signing you in.',
    )
    return body.id_token
  } catch (error) {
    if (callbackResponse && !callbackResponse.writableEnded) {
      sendCallbackPage(
        callbackResponse,
        400,
        'error',
        'Sign-in could not be completed',
        'Return to Chronicle for details and try again.',
      )
    }
    throw error
  } finally {
    server.close()
    const chronicleWindow = BrowserWindow.getAllWindows().find((window) => !window.isDestroyed())
    chronicleWindow?.show()
    chronicleWindow?.focus()
  }
}
