/** Starts and stops the local Python FastAPI AI service. */
import { spawn, type ChildProcess } from 'node:child_process'
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

/** Resolve development Python or the self-contained installed sidecar. */
export function resolveAiServiceLocation(
  repositoryRoot: string,
  packagedResourcesPath?: string,
  platform: NodeJS.Platform = process.platform,
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
        CHRONICLE_PROMPT_PATH: path.join(sidecarDir, 'prompts', 'version-annotation.md'),
      },
    }
  }

  const serviceDir = path.join(repositoryRoot, 'services', 'ai')
  return {
    command: process.env['CHRONICLE_PYTHON'] || 'python',
    args: [
      '-m',
      'uvicorn',
      'chronicle_ai.main:app',
      '--host',
      '127.0.0.1',
      '--port',
      '8765',
      '--log-level',
      'warning',
    ],
    cwd: serviceDir,
    environment: process.env,
  }
}

export function createAiServiceProcess(
  repositoryRoot: string,
  packagedResourcesPath?: string,
): AiServiceProcess {
  let child: ChildProcess | undefined
  const location = resolveAiServiceLocation(repositoryRoot, packagedResourcesPath)

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
