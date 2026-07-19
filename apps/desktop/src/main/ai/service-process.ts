/** Starts and stops the local Python FastAPI AI service in development. */
import { spawn, type ChildProcess } from 'node:child_process'
import path from 'node:path'

export interface AiServiceProcess {
  start(): void
  stop(): Promise<void>
}

export function createAiServiceProcess(repositoryRoot: string): AiServiceProcess {
  let child: ChildProcess | undefined
  // The Python package lives in services/ai; running uvicorn from there puts
  // it on sys.path so `chronicle_ai.main:app` resolves without an install.
  const serviceDir = path.join(repositoryRoot, 'services', 'ai')

  return {
    start(): void {
      if (child && child.exitCode === null) return

      const python = process.env['CHRONICLE_PYTHON'] || 'python'
      child = spawn(
        python,
        [
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
        {
          cwd: serviceDir,
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
