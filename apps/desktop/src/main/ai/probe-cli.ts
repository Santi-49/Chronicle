/**
 * Headless developer probe for Chronicle's configured AI credentials.
 *
 * This runs in Electron's main process because only Electron `safeStorage` can
 * decrypt the locally saved BYOK credentials. Plaintext keys are passed only
 * to the loopback AI service and are never printed.
 */
import type { ChronicleDb } from '../db/database'
import { getSetting } from '../db/repositories'
import { AI_PROVIDERS, type AiTask } from '../../shared/aiCatalog'
import type { AppSettings } from '../../shared/settings'
import type { AiClient } from './client'

export interface ProbeTarget {
  task: AiTask
  provider: string
  model: string
}

export interface ProbeArguments {
  all: boolean
  provider?: string
  model?: string
  task?: AiTask
  help: boolean
}

interface ProbeDependencies {
  db: ChronicleDb
  client: AiClient
  readApiKey: (provider: string) => string | null
  ensureService: () => void
}

const SETTINGS_KEY = 'app-settings'

function valueAfter(argv: string[], flag: string): string | undefined {
  const index = argv.indexOf(flag)
  if (index === -1) return undefined
  const value = argv[index + 1]?.trim()
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value`)
  return value
}

export function parseProbeArguments(argv: string[]): ProbeArguments {
  const valueFlags = new Set(['--provider', '--model', '--task'])
  const booleanFlags = new Set(['--all', '--help', '-h'])
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]!
    if (valueFlags.has(argument)) {
      index += 1
      if (index >= argv.length || argv[index]!.startsWith('-')) {
        throw new Error(`${argument} requires a value`)
      }
    } else if (!booleanFlags.has(argument)) {
      throw new Error(`Unknown probe option: ${argument}`)
    }
  }
  const task = valueAfter(argv, '--task')
  if (task !== undefined && task !== 'chat' && task !== 'embeddings') {
    throw new Error("--task must be 'chat' or 'embeddings'")
  }
  return {
    all: argv.includes('--all'),
    provider: valueAfter(argv, '--provider'),
    model: valueAfter(argv, '--model'),
    task,
    help: argv.includes('--help') || argv.includes('-h'),
  }
}

function catalogTargets(filters: ProbeArguments): ProbeTarget[] {
  return AI_PROVIDERS.flatMap((provider) =>
    (['chat', 'embeddings'] as const).flatMap((task) =>
      provider[task].map((model) => ({ task, provider: provider.id, model: model.id })),
    ),
  ).filter((target) =>
    (!filters.provider || target.provider === filters.provider) &&
    (!filters.model || target.model === filters.model) &&
    (!filters.task || target.task === filters.task),
  )
}

function configuredTargets(db: ChronicleDb, filters: ProbeArguments): ProbeTarget[] {
  const settings = getSetting<AppSettings>(db, SETTINGS_KEY)
  if (!settings?.ai) return []
  return ([
    { task: 'chat', ...settings.ai.chat },
    { task: 'embeddings', ...settings.ai.embeddings },
  ] satisfies ProbeTarget[]).filter((target) =>
    Boolean(target.provider && target.model) &&
    (!filters.provider || target.provider === filters.provider) &&
    (!filters.model || target.model === filters.model) &&
    (!filters.task || target.task === filters.task),
  )
}

export function selectProbeTargets(db: ChronicleDb, filters: ProbeArguments): ProbeTarget[] {
  const useCatalog = filters.all || Boolean(filters.provider) || Boolean(filters.model)
  const targets = useCatalog ? catalogTargets(filters) : configuredTargets(db, filters)
  const unique = new Map(targets.map((target) => [
    `${target.task}\u001f${target.provider}\u001f${target.model}`,
    target,
  ]))
  return [...unique.values()]
}

function redact(message: string, key: string): string {
  return key ? message.split(key).join('<redacted-key>') : message
}

async function waitForService(client: AiClient, ensureService: () => void): Promise<boolean> {
  if (await client.health()) return true
  ensureService()
  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250))
    if (await client.health()) return true
  }
  return false
}

export async function runProviderProbe(
  args: ProbeArguments,
  deps: ProbeDependencies,
): Promise<number> {
  const targets = selectProbeTargets(deps.db, args)
  if (targets.length === 0) {
    console.error('No provider/model configurations matched the requested filters.')
    return 2
  }
  if (!(await waitForService(deps.client, deps.ensureService))) {
    console.error('The local Chronicle AI service did not become ready.')
    return 2
  }

  let failures = 0
  let skipped = 0
  for (const target of targets) {
    const label = `${target.task.padEnd(10)} ${target.provider}/${target.model}`
    const apiKey = deps.readApiKey(target.provider)
    if (!apiKey) {
      console.log(`SKIP  ${label} — no locally saved key`)
      skipped += 1
      continue
    }
    const startedAt = performance.now()
    try {
      const result = await deps.client.validateProviderModel({
        task: target.task,
        provider: target.provider,
        model: target.model,
        apiKey,
      })
      const elapsed = Math.round(performance.now() - startedAt)
      if (result.valid && result.reachable) {
        console.log(`PASS  ${label} — ${elapsed} ms`)
      } else {
        console.error(`FAIL  ${label} — ${redact(result.message, apiKey)}`)
        failures += 1
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`FAIL  ${label} — ${redact(message, apiKey)}`)
      failures += 1
    }
  }

  console.log(
    `\n${targets.length} checked · ${targets.length - failures - skipped} passed · ${failures} failed · ${skipped} skipped`,
  )
  return failures > 0 ? 1 : 0
}

export const PROVIDER_PROBE_HELP = `
Probe Chronicle's locally saved AI provider credentials without printing keys.

Usage:
  npm run probe:ai -- -- [options]

Options:
  --all                   Test every model in Chronicle's curated catalog
  --provider <id>         Test every catalog model for one provider
  --model <id>            Test one catalog model (optionally with --provider)
  --task chat|embeddings  Limit the probe to one task
  --help                  Show this help

With no filters, the command tests the two provider/model selections currently
saved in Settings. Providers without a locally saved key are reported as SKIP.
Real minimal provider calls may incur a small charge.
`.trim()
