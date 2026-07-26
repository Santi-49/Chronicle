/* Launch the headless probe as Electron even when the parent developer shell
 * sets ELECTRON_RUN_AS_NODE for test commands. No credentials enter this
 * launcher or its arguments. */
const { spawnSync } = require('node:child_process')
const electron = require('electron')

const environment = { ...process.env }
delete environment.ELECTRON_RUN_AS_NODE

const result = spawnSync(
  electron,
  ['.', '--probe-ai-models', ...process.argv.slice(2)],
  { cwd: require('node:path').resolve(__dirname, '..'), env: environment, stdio: 'inherit' },
)

if (result.error) {
  console.error(`Could not launch the Chronicle AI probe: ${result.error.message}`)
  process.exitCode = 2
} else {
  process.exitCode = result.status ?? 2
}
