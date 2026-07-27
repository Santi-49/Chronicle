/** Starts and stops the local Python FastAPI AI service. */
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

export interface AiServiceProcess {
  start(): void
  stop(): Promise<void>
}

export interface AiServiceLocation {
  command: string
  args: string[]
  cwd: string
  environment: NodeJS.ProcessEnv
}

/**
 * Keep every app process isolated from orphaned sidecars left by an abruptly
 * stopped session. This matters for packaged builds too: an older executable
 * can otherwise keep 8765 open, make the current sidecar fail to bind, and
 * silently serve an obsolete C3 request schema to the new desktop app.
 */
export function desktopAiServicePort(
  _packaged: boolean,
  processId = process.pid,
): number {
  return 20_000 + Math.abs(processId) % 20_000
}

export function resolveDevelopmentPython(
  repositoryRoot: string,
  platform: NodeJS.Platform = process.platform,
  fileExists: (candidate: string) => boolean = existsSync,
): string {
  if (process.env['CHRONICLE_PYTHON']) return process.env['CHRONICLE_PYTHON']
  const executable = platform === 'win32' ? 'python.exe' : 'python'
  const scriptsDirectory = platform === 'win32' ? 'Scripts' : 'bin'
  const candidates = [
    path.join(repositoryRoot, 'services', 'ai', '.venv', scriptsDirectory, executable),
    path.join(
      repositoryRoot,
      'apps',
      'desktop',
      'build',
      'sidecar-venv',
      scriptsDirectory,
      executable,
    ),
  ]
  return candidates.find(fileExists) ?? 'python'
}

/** Resolve development Python or the self-contained installed sidecar. */
export function resolveAiServiceLocation(
  repositoryRoot: string,
  packagedResourcesPath?: string,
  platform: NodeJS.Platform = process.platform,
  port = 8765,
  reload = false,
): AiServiceLocation {
  if (packagedResourcesPath) {
    const sidecarDir = path.join(packagedResourcesPath, 'ai')
    const executableName = platform === 'win32'
      ? 'chronicle-ai-sidecar.exe'
      : 'chronicle-ai-sidecar'
    return {
      command: path.join(sidecarDir, executableName),
      args: [],
      cwd: sidecarDir,
      environment: {
        ...process.env,
        CHRONICLE_AI_PORT: String(port),
        CHRONICLE_PROMPT_PATH: path.join(sidecarDir, 'prompts', 'version-annotation.md'),
      },
    }
  }

  const serviceDir = path.join(repositoryRoot, 'services', 'ai')
  return {
    command: resolveDevelopmentPython(repositoryRoot, platform),
    args: [
      '-m',
      'uvicorn',
      'chronicle_ai.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      String(port),
      '--log-level',
      'warning',
      ...(reload ? ['--reload'] : []),
    ],
    cwd: serviceDir,
    environment: process.env,
  }
}

export function createAiServiceProcess(
  repositoryRoot: string,
  packagedResourcesPath?: string,
  port = 8765,
  reload = false,
): AiServiceProcess {
  let child: ChildProcess | undefined
  const location = resolveAiServiceLocation(
    repositoryRoot,
    packagedResourcesPath,
    process.platform,
    port,
    reload,
  )

  return {
    start(): void {
      if (child && child.exitCode === null) return

      child = spawn(
        location.command,
        location.args,
        {
          cwd: location.cwd,
          env: location.environment,
          // Request bodies and BYOK credentials must never reach Electron logs.
          stdio: 'ignore',
          windowsHide: true,
        },
      )
      child.once('error', () => {
        child = undefined
      })
    },

    async stop(): Promise<void> {
      const running = child
      child = undefined
      if (!running || running.exitCode !== null) return

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          running.kill('SIGKILL')
          resolve()
        }, 2_000)
        running.once('exit', () => {
          clearTimeout(timeout)
          resolve()
        })
        running.kill()
      })
    },
  }
}
