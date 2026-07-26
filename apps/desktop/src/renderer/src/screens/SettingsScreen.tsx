import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { FolderGlyph } from '../components/FolderGlyph'
import { GoogleMark } from '../components/GoogleMark'
import { PageHeader } from '../components/PageHeader'
import { ProjectRemovalControl } from '../components/ProjectRemovalControl'
import type { ThemePreference } from '../App'
import {
  AI_PROVIDERS,
  aiSelectionError,
  findProvider,
  isPresetModel,
  providersForTask,
  type AiTask,
} from '../lib/aiCatalog'
import { useFolders, useSettings } from '../lib/useChronicle'
import { useUpdates } from '../lib/useUpdates'
import { chronicle } from '../lib/bridge'
import { friendlyError } from '../lib/friendlyError'
import { friendlyIpcError } from '../lib/errors'
import { HELP_CENTER_URL, UPDATE_HELP_URL } from '../lib/helpLinks'
import { PRIVACY_URL, TERMS_URL } from '../lib/legalAcceptance'
import type { OnboardingStatus } from '../lib/onboarding'
import type { AiModelPrice, SystemIntegrationState } from '../../../shared/ipc'

interface SettingsScreenProps {
  developerBuild: boolean
  developerMode: boolean
  themePreference: ThemePreference
  onAddProject: () => void
  onOpenProjects: () => void
  onDeveloperModeChange: (enabled: boolean) => void
  onThemePreferenceChange: (preference: ThemePreference) => void
  onAdminStateChange: (isAdmin: boolean) => void
  onboardingStatus: OnboardingStatus
  onAiReady: () => void
  onReplayTutorial: () => void
  onResumeTutorial: () => void
  focusSection?: 'ai'
}

const appearanceOptions: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'System', description: 'Match your device appearance' },
  { value: 'dark', label: 'Dark', description: 'Use the dark workspace' },
  { value: 'light', label: 'Light', description: 'Use the light workspace' },
]

export function SettingsScreen({
  developerBuild,
  developerMode,
  themePreference,
  onAddProject,
  onOpenProjects,
  onDeveloperModeChange,
  onThemePreferenceChange,
  onAdminStateChange,
  onboardingStatus,
  onAiReady,
  onReplayTutorial,
  onResumeTutorial,
  focusSection,
}: SettingsScreenProps) {
  useEffect(() => {
    if (focusSection !== 'ai') return
    const frame = window.requestAnimationFrame(() => {
      const section = document.getElementById('ai-settings')
      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
      section?.scrollIntoView({ block: 'start', behavior: reducedMotion ? 'auto' : 'smooth' })
      section?.focus({ preventScroll: true })
    })
    return () => window.cancelAnimationFrame(frame)
  }, [focusSection])

  return (
    <section className="page settings-page" aria-labelledby="settings-title">
      <PageHeader
        eyebrow="Chronicle preferences"
        title="Settings"
        description="Choose what Chronicle watches and how optional AI summaries are created."
      />

      <div className="settings-sections">
        <GettingStartedSection
          status={onboardingStatus}
          onReplay={onReplayTutorial}
          onResume={onResumeTutorial}
        />
        <AppearanceSection themePreference={themePreference} onThemePreferenceChange={onThemePreferenceChange} />
        <StartupSection />
        <TrackedFoldersSection onAddProject={onAddProject} />
        <AiSection onAiReady={onAiReady} />
        <AccountSection
          onAdminStateChange={onAdminStateChange}
          onOpenProjects={onOpenProjects}
        />
        <AboutSection />
        <DeveloperToolsSection
          developerBuild={developerBuild}
          developerMode={developerMode}
          onDeveloperModeChange={onDeveloperModeChange}
        />
      </div>
    </section>
  )
}

function AboutSection() {
  const { state, check, restart } = useUpdates()
  const [checking, setChecking] = useState(false)
  const [actionError, setActionError] = useState('')
  const checkedLabel = state?.checkedAt
    ? new Date(state.checkedAt).toLocaleString()
    : 'Not checked yet'
  const statusLabel =
    state?.phase === 'unsupported'
      ? 'Automatic updates are available in the installed Windows app.'
      : state?.phase === 'checking'
        ? 'Checking for updates…'
        : state?.phase === 'available' || state?.phase === 'downloading'
          ? `Chronicle ${state.availableVersion} is downloading.`
          : state?.phase === 'ready'
            ? `Chronicle ${state.availableVersion} is ready to install.`
            : state?.error ?? 'Chronicle is up to date.'

  const runCheck = async () => {
    setChecking(true)
    setActionError('')
    try {
      await check()
    } catch {
      setActionError('Chronicle could not check for updates. Check your connection and retry.')
    } finally {
      setChecking(false)
    }
  }

  return (
    <section className="settings-section" id="about-settings">
      <div className="settings-section-heading">
        <Icon name="info" />
        <div>
          <h2>About & updates</h2>
          <p>Chronicle {state?.currentVersion ?? __APP_VERSION__} · Windows updates use public GitHub Releases.</p>
        </div>
      </div>
      <div className="about-update-status" aria-live="polite">
        <div>
          <strong>{statusLabel}</strong>
          <span>Last checked: {checkedLabel}</span>
          <small>Update checks never include project files, paths, credentials, or account data.</small>
        </div>
        <div className="about-update-actions">
          {state?.phase === 'ready' && (
            <button className="primary-button" onClick={() => void restart()} type="button">
              Restart to update
            </button>
          )}
          <button
            className="secondary-button"
            disabled={checking || state?.phase === 'checking' || state?.phase === 'unsupported'}
            onClick={() => void runCheck()}
            type="button"
          >
            <Icon name="refresh" />
            {checking || state?.phase === 'checking' ? 'Checking…' : 'Check now'}
          </button>
          <a className="secondary-button" href={HELP_CENTER_URL} rel="noreferrer" target="_blank">
            <Icon name="help" />
            Help center
          </a>
          <a className="secondary-button" href={UPDATE_HELP_URL} rel="noreferrer" target="_blank">
            Update help
          </a>
        </div>
        {(actionError || state?.error) && state?.phase !== 'unsupported' && (
          <p className="form-error" role="alert">{actionError || state?.error}</p>
        )}
      </div>
    </section>
  )
}

function GettingStartedSection({
  status,
  onReplay,
  onResume,
}: {
  status: OnboardingStatus
  onReplay: () => void
  onResume: () => void
}) {
  const active = status === 'active'
  const complete = status === 'complete'
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <Icon name="spark" />
        <div>
          <h2>Getting started</h2>
          <p>Create a project, learn the Timeline, and configure optional AI at your own pace.</p>
        </div>
      </div>
      <div className="getting-started-settings-copy">
        <p>
          {active
            ? 'The guided tour is active. Follow the highlighted controls or skip it at any time.'
            : complete
              ? 'Tutorial completed. Replay it whenever you want a quick refresher.'
              : 'The guided tour is hidden. Resume it without losing completed steps.'}
        </p>
        <button
          className="secondary-button"
          onClick={active || complete ? onReplay : onResume}
          type="button"
        >
          <Icon name={active || complete ? 'refresh' : 'spark'} />
          {active ? 'Restart tutorial' : complete ? 'Replay tutorial' : 'Resume tutorial'}
        </button>
      </div>
    </section>
  )
}

function DeveloperToolsSection({
  developerBuild,
  developerMode,
  onDeveloperModeChange,
}: Pick<SettingsScreenProps, 'developerBuild' | 'developerMode' | 'onDeveloperModeChange'>) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <Icon name="terminal" />
        <div><h2>Developer tools</h2><p>Show local diagnostics for troubleshooting this installation.</p></div>
      </div>
      <label className="toggle-field developer-tools-toggle">
        <input
          checked={developerMode}
          disabled={developerBuild}
          onChange={(event) => onDeveloperModeChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <strong>Developer mode</strong>
          <small>
            {developerBuild
              ? 'Enabled automatically while running npm run dev.'
              : 'Adds a Diagnostics tab below Search. This preference stays on this device.'}
          </small>
        </span>
      </label>
    </section>
  )
}

// ── Appearance ────────────────────────────────────────────────────────────

function AppearanceSection({
  themePreference,
  onThemePreferenceChange,
}: Pick<SettingsScreenProps, 'themePreference' | 'onThemePreferenceChange'>) {
  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <Icon name="palette" />
        <div><h2>Appearance</h2><p>Choose how Chronicle looks on this device.</p></div>
      </div>
      <fieldset className="appearance-options">
        <legend className="sr-only">Application theme</legend>
        {appearanceOptions.map((option) => (
          <label className="appearance-option" key={option.value}>
            <input
              checked={themePreference === option.value}
              name="theme"
              onChange={() => onThemePreferenceChange(option.value)}
              type="radio"
              value={option.value}
            />
            <span><strong>{option.label}</strong><small>{option.description}</small></span>
          </label>
        ))}
      </fieldset>
    </section>
  )
}

// ── Startup & background ────────────────────────────────────────────────

/**
 * Three related but separate choices, in the order they take effect:
 * whether closing the window keeps capturing, whether Chronicle starts with
 * Windows/macOS, and whether that start shows the window.
 *
 * The startup preference is read back from the operating system on every load
 * rather than from settings, because it can be revoked in Task Manager or
 * System Settings while Chronicle is not running.
 */
function StartupSection() {
  const { settings, save } = useSettings()
  const [system, setSystem] = useState<SystemIntegrationState>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    void chronicle.getSystemIntegration().then((state) => {
      if (!cancelled) setSystem(state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const runInBackground = settings?.system.runInBackground ?? false
  // With background capture off there is no tray to reach, so a login launch
  // must show its window; the main process enforces the same rule. Rather than
  // showing a checkbox that ticks itself and then refuses to be changed, the
  // choice disappears and the single remaining behavior is stated in words.
  const windowForced = !runInBackground
  const opensWindow = windowForced || (system?.openAtLoginOpensWindow ?? false)

  const applyLogin = async (enabled: boolean, showWindow: boolean) => {
    setBusy(true)
    setError('')
    try {
      setSystem(await chronicle.setOpenAtLogin(enabled, showWindow))
    } catch (cause) {
      setError(friendlyIpcError(cause, 'Chronicle could not change the startup setting.'))
      // Re-read so the checkboxes show what the operating system actually has.
      setSystem(await chronicle.getSystemIntegration())
    } finally {
      setBusy(false)
    }
  }

  const changeBackground = async (enabled: boolean) => {
    setError('')
    await save({
      system: {
        runInBackground: enabled,
        openAtLoginOpensWindow: settings?.system.openAtLoginOpensWindow ?? false,
      },
    })
    // Turning background capture off strands a tray-only login launch, so
    // promote it to a window launch in the same action.
    if (!enabled && system?.openAtLogin && !system.openAtLoginOpensWindow) {
      await applyLogin(true, true)
    }
  }

  return (
    <section className="settings-section" id="startup-settings">
      <div className="settings-section-heading">
        <Icon name="power" />
        <div>
          <h2>Startup &amp; background</h2>
          <p>Chronicle only captures saves while it is running.</p>
        </div>
      </div>

      <div className="startup-options">
        <label className="toggle-field">
          <input
            checked={runInBackground}
            disabled={!settings}
            onChange={(event) => void changeBackground(event.target.checked)}
            type="checkbox"
          />
          <span>
            <strong>Keep capturing after I close the window</strong>
            <small>
              Chronicle stays in the notification area and keeps versioning your folders. Open or
              quit it from the tray icon. Turn this off to make closing the window quit Chronicle.
            </small>
          </span>
        </label>

        {/*
          With background capture off there is no tray icon, so the only
          reachable login launch is one that opens the window — a single choice,
          shown as a single control. Offering "start at login" and "open the
          window" separately there would present a distinction that does not
          exist, with one of them permanently forced.
        */}
        <label className="toggle-field">
          <input
            checked={system?.openAtLogin ?? false}
            disabled={busy || !system?.openAtLoginSupported}
            onChange={(event) => void applyLogin(event.target.checked, opensWindow)}
            type="checkbox"
          />
          <span>
            <strong>
              {windowForced
                ? 'Start Chronicle and open its window when I sign in'
                : 'Start Chronicle when I sign in'}
            </strong>
            <small>
              {!system?.openAtLoginSupported
                ? (system?.unsupportedReason ?? 'Starting at login is available in the installed app.')
                : windowForced
                  ? 'Saves made while Chronicle is closed are not recorded individually, so starting automatically keeps the history complete. The window opens because background capture is off — without a tray icon there would be no way to reach Chronicle.'
                  : 'Saves made while Chronicle is closed are not recorded individually, so starting automatically keeps the history complete.'}
            </small>
          </span>
        </label>

        {!windowForced && (
          <label className="toggle-field startup-nested">
            <input
              checked={opensWindow}
              disabled={busy || !system?.openAtLoginSupported || !system?.openAtLogin}
              onChange={(event) => void applyLogin(true, event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Open the Chronicle window at sign-in</strong>
              <small>
                Leave this off to start quietly in the notification area and keep capturing without
                a window.
              </small>
            </span>
          </label>
        )}
      </div>

      {error && <p className="form-error" role="alert">{error}</p>}
    </section>
  )
}

// ── Tracked folders ─────────────────────────────────────────────────────

function TrackedFoldersSection({ onAddProject }: { onAddProject: () => void }) {
  const { folders, reload } = useFolders()

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <Icon name="folder-plus" />
        <div><h2>Tracked folders</h2><p>PNG and JPG files in these folders are versioned automatically.</p></div>
      </div>
      {folders.length === 0 ? (
        <p className="settings-empty">No folders tracked yet.</p>
      ) : (
        <div className="folder-list">
          {folders.map((folder) => (
            <div className="folder-row" key={folder.id}>
              <FolderGlyph icon={folder.icon} color={folder.color} />
              <div><strong>{folder.displayName}</strong><span>{folder.path}</span></div>
              <ProjectRemovalControl
                compact
                onRemoved={reload}
                projectId={folder.id}
                projectName={folder.displayName}
              />
            </div>
          ))}
        </div>
      )}
      <button className="secondary-button" onClick={onAddProject} type="button"><Icon name="folder-plus" /> Add a project</button>
    </section>
  )
}

// ── AI summaries ──────────────────────────────────────────────────────────

const modelRate = new Intl.NumberFormat(undefined, {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 6,
})

function formatModelPrice(price: AiModelPrice | null, inputOnly: boolean): string {
  if (!price) return 'Live list price unavailable for this model.'
  const input = `${modelRate.format(price.inputUsdPerMillion)} input`
  const output = inputOnly ? '' : ` · ${modelRate.format(price.outputUsdPerMillion)} output`
  return `Estimated list price · ${input}${output} per 1M tokens · Models.dev`
}

function AiSection({ onAiReady }: { onAiReady: () => void }) {
  const { settings, configuredProviders, loading, save, setApiKey, clearApiKey } = useSettings()

  const [devMode, setDevMode] = useState(false)
  const [chatProvider, setChatProvider] = useState('google_genai')
  const [chatModel, setChatModel] = useState('gemini-flash-latest')
  const [embedProvider, setEmbedProvider] = useState('google_genai')
  const [embedModel, setEmbedModel] = useState('gemini-embedding-001')
  const [saveState, setSaveState] = useState<{ message: string; error: boolean } | null>(null)
  const [priceState, setPriceState] = useState<{
    key: string
    chat: AiModelPrice | null
    embeddings: AiModelPrice | null
    loading: boolean
  } | null>(null)
  const [testingTask, setTestingTask] = useState<AiTask | null>(null)
  const [testStates, setTestStates] = useState<
    Partial<Record<AiTask, { message: string; error: boolean }>>
  >({})

  // Initialize the form once settings arrive.
  useEffect(() => {
    if (!settings) return
    setChatProvider(settings.ai.chat.provider || 'google_genai')
    setChatModel(settings.ai.chat.model || 'gemini-flash-latest')
    setEmbedProvider(settings.ai.embeddings.provider || 'google_genai')
    setEmbedModel(settings.ai.embeddings.model || 'gemini-embedding-001')
    // Show custom configuration automatically when stored values are not presets.
    const preset =
      isPresetModel('chat', settings.ai.chat.provider, settings.ai.chat.model) &&
      isPresetModel('embeddings', settings.ai.embeddings.provider, settings.ai.embeddings.model)
    setDevMode(!preset && settings.ai.chat.provider !== '')
  }, [settings])

  useEffect(() => {
    const chatProviderId = chatProvider.trim()
    const chatModelId = chatModel.trim()
    const embeddingProviderId = embedProvider.trim()
    const embeddingModelId = embedModel.trim()
    const key = [
      chatProviderId,
      chatModelId,
      embeddingProviderId,
      embeddingModelId,
    ].join('\u001f')
    let cancelled = false
    setPriceState({ key, chat: null, embeddings: null, loading: true })
    const timer = setTimeout(async () => {
      let chat: AiModelPrice | null = null
      let embeddings: AiModelPrice | null = null
      if (chatProviderId && chatModelId) {
        try {
          chat = await chronicle.getAiModelPrice(chatProviderId, chatModelId)
        } catch {
          // One unavailable model must not hide the other task's price.
        }
      }
      if (embeddingProviderId && embeddingModelId) {
        try {
          embeddings = await chronicle.getAiModelPrice(
            embeddingProviderId,
            embeddingModelId,
          )
        } catch {
          // Pricing is informational; editing and saving remain available.
        }
      }
      if (!cancelled) setPriceState({ key, chat, embeddings, loading: false })
    }, 250)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [chatProvider, chatModel, embedProvider, embedModel])

  const priceKey = [
    chatProvider.trim(),
    chatModel.trim(),
    embedProvider.trim(),
    embedModel.trim(),
  ].join('\u001f')
  const currentPrices = priceState?.key === priceKey ? priceState : null

  // When switching provider in preset mode, snap the model to that provider's first option.
  const changeProvider = (task: AiTask, providerId: string) => {
    const first = findProvider(providerId)?.[task][0]?.id ?? ''
    if (task === 'chat') {
      setChatProvider(providerId)
      setChatModel(first)
    } else {
      setEmbedProvider(providerId)
      setEmbedModel(first)
    }
  }

  const chatSelectionError = aiSelectionError('chat', chatProvider, chatModel, devMode)
  const embedSelectionError = aiSelectionError('embeddings', embedProvider, embedModel, devMode)
  const missingChatKey =
    chatProvider.trim() !== '' && !configuredProviders.includes(chatProvider.trim())
  const missingEmbedKey =
    embedProvider.trim() !== '' && !configuredProviders.includes(embedProvider.trim())
  const chatError = chatSelectionError ??
    (missingChatKey ? 'No saved key for this provider yet, add one below to generate summaries.' : null)
  const embedError = embedSelectionError ??
    (missingEmbedKey ? 'No saved key for this provider yet, add one below to enable semantic search.' : null)

  const onSave = async () => {
    const validationError = chatError ?? embedError
    if (validationError) {
      setSaveState({ message: validationError, error: true })
      return
    }
    setSaveState({ message: 'Saving…', error: false })
    try {
      await save({
        ai: {
          mode: settings?.ai.mode ?? 'local',
          chat: { provider: chatProvider.trim(), model: chatModel.trim() },
          embeddings: { provider: embedProvider.trim(), model: embedModel.trim() },
        },
      })
      setSaveState({ message: 'Saved.', error: false })
      onAiReady()
    } catch (err) {
      const reason = friendlyIpcError(err, 'The AI configuration could not be validated.')
      setSaveState({
        message: `${reason} Previous settings were kept.`,
        error: true,
      })
      if (settings) {
        setChatProvider(settings.ai.chat.provider)
        setChatModel(settings.ai.chat.model)
        setEmbedProvider(settings.ai.embeddings.provider)
        setEmbedModel(settings.ai.embeddings.model)
      }
    }
  }

  const testConnection = async (task: AiTask) => {
    const isChat = task === 'chat'
    const selectionError = isChat ? chatError : embedError
    if (selectionError) {
      setTestStates((current) => ({
        ...current,
        [task]: { message: selectionError, error: true },
      }))
      return
    }
    setTestingTask(task)
    setTestStates((current) => ({
      ...current,
      [task]: { message: 'Testing the real provider connection…', error: false },
    }))
    try {
      const result = await chronicle.testAiConfiguration(
        task,
        (isChat ? chatProvider : embedProvider).trim(),
        (isChat ? chatModel : embedModel).trim(),
      )
      setTestStates((current) => ({
        ...current,
        [task]: {
          message: result.valid
            ? `Connection passed: ${result.provider} / ${result.model}.`
            : result.message,
          error: !result.valid,
        },
      }))
      if (result.valid && task === 'chat') onAiReady()
    } catch (error) {
      setTestStates((current) => ({
        ...current,
        [task]: {
          message: friendlyIpcError(error, 'The provider connection test failed.'),
          error: true,
        },
      }))
    } finally {
      setTestingTask(null)
    }
  }

  // Providers to show a key row for: the curated catalog plus any custom
  // provider currently selected in custom mode (so its key can be saved).
  const keyProviders = useMemo(() => {
    const rows = AI_PROVIDERS.map((p) => ({ id: p.id, label: p.label }))
    const known = new Set(rows.map((r) => r.id))
    for (const custom of [chatProvider, embedProvider]) {
      const id = custom.trim()
      if (id && !known.has(id)) {
        known.add(id)
        rows.push({ id, label: id })
      }
    }
    return rows
  }, [chatProvider, embedProvider])

  return (
    <section className="settings-section" data-tour="ai-settings" id="ai-settings" tabIndex={-1}>
      <div className="settings-section-heading">
        <Icon name="spark" />
        <div><h2>AI summaries</h2><p>Optional. Versions are always captured, even when AI is unavailable.</p></div>
      </div>

      <label className="toggle-field dev-toggle">
        <input checked={devMode} onChange={(event) => setDevMode(event.target.checked)} type="checkbox" />
        <span>
          <strong>Custom AI configuration</strong>
          <small>Enter any LangChain provider and model instead of the presets.</small>
        </span>
      </label>

      <fieldset className="ai-task">
        <legend>Change summaries (vision)</legend>
        {devMode ? (
          <div className="settings-form-grid">
            <label><span>Provider</span><input aria-invalid={Boolean(chatError)} onChange={(e) => setChatProvider(e.target.value)} placeholder="e.g. google_genai" type="text" value={chatProvider} /></label>
            <label><span>Model</span><input aria-invalid={Boolean(chatError)} onChange={(e) => setChatModel(e.target.value)} placeholder="e.g. gemini-flash-latest" type="text" value={chatModel} /></label>
          </div>
        ) : (
          <ProviderModelPicker task="chat" provider={chatProvider} model={chatModel} onProvider={(p) => changeProvider('chat', p)} onModel={setChatModel} />
        )}
        {chatError && <p className="ai-task-error" role="alert">{chatError}</p>}
        {chatProvider.trim() && chatModel.trim() && (
          <small aria-live="polite" className="ai-model-price">
            {!currentPrices || currentPrices.loading
              ? 'Checking live list price…'
              : formatModelPrice(currentPrices?.chat ?? null, false)}
          </small>
        )}
        <div className="ai-task-test-row">
          <button
            className="secondary-button compact-button"
            disabled={loading || Boolean(chatError) || testingTask !== null}
            onClick={() => void testConnection('chat')}
            type="button"
          >
            {testingTask === 'chat' ? 'Testing…' : 'Test summary connection'}
          </button>
          {testStates.chat && (
            <span
              className={`inline-status ${testStates.chat.error ? 'inline-status-error' : ''}`}
              role={testStates.chat.error ? 'alert' : 'status'}
            >
              {testStates.chat.message}
            </span>
          )}
        </div>
      </fieldset>

      <fieldset className="ai-task">
        <legend>Semantic search (embeddings)</legend>
        {devMode ? (
          <div className="settings-form-grid">
            <label><span>Provider</span><input aria-invalid={Boolean(embedError)} onChange={(e) => setEmbedProvider(e.target.value)} placeholder="e.g. google_genai" type="text" value={embedProvider} /></label>
            <label><span>Model</span><input aria-invalid={Boolean(embedError)} onChange={(e) => setEmbedModel(e.target.value)} placeholder="e.g. gemini-embedding-001" type="text" value={embedModel} /></label>
          </div>
        ) : (
          <ProviderModelPicker task="embeddings" provider={embedProvider} model={embedModel} onProvider={(p) => changeProvider('embeddings', p)} onModel={setEmbedModel} />
        )}
        {embedError && <p className="ai-task-error" role="alert">{embedError}</p>}
        {embedProvider.trim() && embedModel.trim() && (
          <small aria-live="polite" className="ai-model-price">
            {!currentPrices || currentPrices.loading
              ? 'Checking live list price…'
              : formatModelPrice(currentPrices?.embeddings ?? null, true)}
          </small>
        )}
        <div className="ai-task-test-row">
          <button
            className="secondary-button compact-button"
            disabled={loading || Boolean(embedError) || testingTask !== null}
            onClick={() => void testConnection('embeddings')}
            type="button"
          >
            {testingTask === 'embeddings' ? 'Testing…' : 'Test search connection'}
          </button>
          {testStates.embeddings && (
            <span
              className={`inline-status ${testStates.embeddings.error ? 'inline-status-error' : ''}`}
              role={testStates.embeddings.error ? 'alert' : 'status'}
            >
              {testStates.embeddings.message}
            </span>
          )}
        </div>
      </fieldset>

      <div className="save-cluster save-cluster-end">
        {saveState && <span className={`inline-status ${saveState.error ? 'inline-status-error' : ''}`} role={saveState.error ? 'alert' : 'status'}>{saveState.message}</span>}
        <button className="primary-button compact-button" disabled={loading || Boolean(chatError ?? embedError)} onClick={() => void onSave()} type="button">Save AI settings</button>
      </div>

      <div className="api-keys">
        <div className="api-keys-heading">
          <h3>Provider API keys</h3>
          <p>Save a key per provider you use. Keys stay encrypted on this device and are sent only to that provider by default. Optional signed-in sync uploads only a passphrase-encrypted envelope that Chronicle cannot decrypt.</p>
        </div>
        {keyProviders.map((provider) => (
          <ApiKeyRow
            key={provider.id}
            provider={provider.id}
            label={provider.label}
            saved={configuredProviders.includes(provider.id)}
            tourTarget={provider.id === chatProvider}
            onReady={onAiReady}
            onSave={setApiKey}
            onClear={clearApiKey}
          />
        ))}
      </div>
    </section>
  )
}

function ApiKeyRow({
  provider,
  label,
  saved,
  tourTarget,
  onReady,
  onSave,
  onClear,
}: {
  provider: string
  label: string
  saved: boolean
  tourTarget: boolean
  onReady: () => void
  onSave: (provider: string, key: string) => Promise<void>
  onClear: (provider: string) => Promise<void>
}) {
  const [draft, setDraft] = useState('')
  const [status, setStatus] = useState<string | null>(null)

  const save = async () => {
    if (!draft.trim()) return
    setStatus('Saving…')
    try {
      await onSave(provider, draft.trim())
      setDraft('')
      setStatus('Saved.')
      onReady()
    } catch (err) {
      setStatus(err instanceof Error ? err.message : String(err))
    }
  }

  const clear = async () => {
    await onClear(provider)
    setStatus('Removed.')
  }

  return (
    <div className="api-key-row">
      <div className="api-key-label">
        <strong>{label}</strong>
        {saved && <em className="key-saved-badge">Saved</em>}
      </div>
      <div className="input-with-icon">
        <Icon name="key" />
        <input
          aria-label={`${label} API key`}
          data-tour={tourTarget ? 'ai-provider-key' : undefined}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={saved ? 'Saved - type to replace it' : 'Paste API key'}
          type="password"
          value={draft}
        />
      </div>
      <div className="api-key-actions">
        <button
          className="secondary-button compact-button"
          data-tour={tourTarget ? 'ai-provider-key-save' : undefined}
          disabled={!draft.trim()}
          onClick={() => void save()}
          type="button"
        >
          Save
        </button>
        {saved && <button className="text-button" onClick={() => void clear()} type="button">Remove</button>}
      </div>
      {status && <span className="api-key-status inline-status" role="status">{status}</span>}
    </div>
  )
}

function ProviderModelPicker({
  task,
  provider,
  model,
  onProvider,
  onModel,
}: {
  task: AiTask
  provider: string
  model: string
  onProvider: (provider: string) => void
  onModel: (model: string) => void
}) {
  const providers = providersForTask(task)
  const models = findProvider(provider)?.[task] ?? []
  const providerValid = providers.some((option) => option.id === provider)
  const modelValid = models.some((option) => option.id === model)

  return (
    <div className="settings-form-grid">
      <label>
        <span>Provider</span>
        <select aria-invalid={!providerValid} onChange={(event) => onProvider(event.target.value)} value={provider}>
          {!providerValid && <option disabled value={provider}>{provider ? `Unavailable - ${provider}` : 'Select a provider'}</option>}
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Model</span>
        <select aria-invalid={!modelValid} onChange={(event) => onModel(event.target.value)} value={model}>
          {!modelValid && <option disabled value={model}>{model ? `Unavailable - ${model}` : 'Select a model'}</option>}
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label} - {m.tier}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

// ── Account ────────────────────────────────────────────────────────────────

function AccountSection({
  onAdminStateChange,
  onOpenProjects,
}: Pick<SettingsScreenProps, 'onAdminStateChange' | 'onOpenProjects'>) {
  const { settings, save } = useSettings()
  const [email, setEmail] = useState<string | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [passphrase, setPassphrase] = useState('')
  const [controlPlaneAvailable, setControlPlaneAvailable] = useState(false)
  const [authBusy, setAuthBusy] = useState(false)
  const [authStatus, setAuthStatus] = useState<string | null>(null)
  const [keyStatus, setKeyStatus] = useState<string | null>(null)
  const [showDeleteConfirmation, setShowDeleteConfirmation] = useState(false)
  const [showUsageDeleteConfirmation, setShowUsageDeleteConfirmation] = useState(false)

  const refreshAccount = async () => {
    const state = await chronicle.getAccountState()
    setEmail(state.email)
    const admin = state.mode === 'signed-in' && state.isAdmin
    setIsAdmin(admin)
    onAdminStateChange(admin)
  }

  const checkControlPlane = async () => {
    const available = await chronicle.checkControlPlaneHealth().catch(() => false)
    setControlPlaneAvailable(available)
  }

  // Check when Settings opens, then again if connectivity returns — no polling.
  useEffect(() => {
    void refreshAccount()
    void checkControlPlane()
    window.addEventListener('online', checkControlPlane)
    return () => window.removeEventListener('online', checkControlPlane)
  }, [])

  const runAuth = async (operation: () => Promise<void>, success: string) => {
    setAuthBusy(true)
    setAuthStatus(null)
    try {
      await operation()
      await refreshAccount()
      setAuthStatus(success)
    } catch (error) {
      setAuthStatus(friendlyError(error))
    } finally {
      setAuthBusy(false)
    }
  }

  const updateControlPlane = async (patch: Partial<NonNullable<typeof settings>['controlPlane']>) => {
    if (!settings) return
    await save({ controlPlane: { ...settings.controlPlane, ...patch } })
  }

  const toggleKeySync = async (enabled: boolean) => {
    setKeyStatus(null)
    try {
      if (enabled) {
        await updateControlPlane({ apiKeySyncEnabled: true })
        setKeyStatus('Enter a passphrase, then save an encrypted cloud copy.')
      } else {
        await chronicle.disableApiKeySync()
        await updateControlPlane({ apiKeySyncEnabled: false })
        setPassphrase('')
        setKeyStatus('Encrypted cloud copy deleted. Local keys were kept.')
      }
    } catch (error) {
      setKeyStatus(friendlyError(error))
    }
  }

  const runKeyOperation = async (operation: () => Promise<void>, success: string) => {
    setKeyStatus('Working…')
    try {
      await operation()
      setPassphrase('')
      setKeyStatus(success)
    } catch (error) {
      setKeyStatus(friendlyError(error))
    }
  }

  const exportAccount = async () => {
    await runAuth(async () => {
      const saved = await chronicle.exportAccountData()
      if (!saved) throw new Error('Export cancelled.')
    }, 'Account data exported.')
  }

  const deleteAccount = async () => {
    await runAuth(async () => {
      await chronicle.deleteCloudAccount()
      setShowDeleteConfirmation(false)
    }, 'Account and linked cloud data permanently deleted. Chronicle is now in local mode; local history and provider keys were kept.')
  }

  const deleteUsageData = async () => {
    await runAuth(async () => {
      await chronicle.deleteCloudUsageData()
      if (settings) {
        await save({
          controlPlane: { ...settings.controlPlane, telemetryOptIn: false },
        })
      }
      setShowUsageDeleteConfirmation(false)
    }, 'This installation’s registered and usage data was deleted, and usage reporting was turned off.')
  }

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <Icon name="info" />
        <div><h2>Account</h2><p>An account is optional and never gates local version history.</p></div>
      </div>
      <div className="account-access">
        <p className="settings-empty">
          {email ? `Signed in as ${email}${isAdmin ? ' (admin)' : ''}.` : 'Running in local mode. Local features remain available offline.'}
        </p>
        <div className="account-access-actions">
          {controlPlaneAvailable && !email && (
            <button
              className="google-button settings-google-button"
              disabled={authBusy}
              onClick={() => void runAuth(async () => { await chronicle.loginWithGoogle() }, 'Signed in with Google.')}
              type="button"
            >
              <span className="google-button-label"><GoogleMark />{authBusy ? 'Connecting…' : 'Continue with Google'}</span>
            </button>
          )}
          {email && <button className="secondary-button" disabled={authBusy} onClick={() => void runAuth(() => chronicle.logout(), 'Signed out.')} type="button">Sign out</button>}
        </div>
        {authStatus && <span className="inline-status" role="status">{authStatus}</span>}
      </div>

      {settings && (
        <div className="account-preferences">
          <label className="toggle-field">
            <input
              checked={settings.controlPlane.telemetryOptIn}
              onChange={(event) => void updateControlPlane({ telemetryOptIn: event.target.checked })}
              type="checkbox"
            />
            <span><strong>Help improve Chronicle</strong><small>Enabled by default. Sends app activity, provider/model usage, sanitized failures, count snapshots, and coarse location derived by Cloudflare—never creative files, names, paths, summaries, tags, search text, credentials, or raw IP.</small></span>
          </label>
          <label className="toggle-field">
            <input
              checked={settings.controlPlane.settingsSyncEnabled}
              disabled={!email}
              onChange={(event) => void updateControlPlane({ settingsSyncEnabled: event.target.checked })}
              type="checkbox"
            />
            <span><strong>Sync preferences</strong><small>Signed-in only. Automatically syncs changes to AI provider/model choices and these preferences, never device paths or project metadata.</small></span>
          </label>

          <label className="toggle-field">
            <input
              checked={settings.controlPlane.apiKeySyncEnabled}
              disabled={!email}
              onChange={(event) => void toggleKeySync(event.target.checked)}
              type="checkbox"
            />
            <span><strong>Encrypted API-key sync</strong><small>Optional and separate from preference sync. Chronicle stores only an opaque passphrase-encrypted envelope.</small></span>
          </label>
          {email && settings.controlPlane.apiKeySyncEnabled && (
            <div className="key-sync-panel">
              <label className="key-sync-passphrase">
                <span>Sync passphrase</span>
                <input autoComplete="off" minLength={12} onChange={(event) => setPassphrase(event.target.value)} placeholder="At least 12 characters" type="password" value={passphrase} />
                <small>Used only for this action. Chronicle never saves or receives the passphrase, so it cannot be recovered.</small>
              </label>
              <div className="key-sync-actions">
                <button className="secondary-button compact-button" disabled={passphrase.length < 12} onClick={() => void runKeyOperation(() => chronicle.syncApiKeys(passphrase), 'Encrypted cloud copy saved.')} type="button">Save encrypted copy</button>
                <button className="secondary-button compact-button" disabled={passphrase.length < 12} onClick={() => void runKeyOperation(() => chronicle.restoreApiKeys(passphrase), 'Keys restored to this device.')} type="button">Restore to this device</button>
                <button className="text-button" onClick={() => void toggleKeySync(false)} type="button">Disable and delete cloud copy</button>
              </div>
              {keyStatus && <span className="inline-status" role="status">{keyStatus}</span>}
            </div>
          )}
        </div>
      )}

      <div className="account-resource-list">
        <div className="account-resource-row">
          <div className="account-resource-copy">
            <strong>Legal and privacy</strong>
            <p>Review the policies that apply when you use Chronicle.</p>
          </div>
          <div className="account-legal-links">
            <a href={TERMS_URL} rel="noreferrer" target="_blank">
              Terms
            </a>
            <a href={PRIVACY_URL} rel="noreferrer" target="_blank">
              Privacy
            </a>
          </div>
        </div>
        <div className="account-resource-row">
          <div className="account-resource-copy">
            <strong>Your cloud data</strong>
            <p>Download a copy of the information Chronicle stores online.</p>
          </div>
          <button
            className="secondary-button compact-button"
            disabled={authBusy || !controlPlaneAvailable}
            onClick={() => void exportAccount()}
            type="button"
          >
            Export data
          </button>
        </div>
      </div>

      {!email && controlPlaneAvailable && (
        <div className="account-danger-zone">
          <div>
            <strong>Delete this installation’s cloud data</strong>
            <p>Erase its random registration, preference record, and uploaded usage statistics. Local creative data is not affected.</p>
          </div>
          {!showUsageDeleteConfirmation ? (
            <button className="danger-button" onClick={() => setShowUsageDeleteConfirmation(true)} type="button">
              Delete cloud usage data
            </button>
          ) : (
            <div className="account-delete-confirmation" role="alert">
              <strong>Delete cloud usage data?</strong>
              <p>This turns usage reporting off and permanently deletes server data for this random installation ID. Watched folders, original files, the version library, and provider keys stay on this device.</p>
              <div className="account-delete-actions">
                <button className="secondary-button compact-button" onClick={() => setShowUsageDeleteConfirmation(false)} type="button">Cancel</button>
                <button className="danger-button" disabled={authBusy} onClick={() => void deleteUsageData()} type="button">Delete cloud usage data</button>
              </div>
            </div>
          )}
        </div>
      )}

      {email && (
        <div className="account-danger-zone">
          <div>
            <strong>Delete account and cloud data</strong>
            <p>Permanently erase the Chronicle account and all data linked to it on Chronicle's control plane.</p>
          </div>
          {!showDeleteConfirmation ? (
            <button
              className="danger-button"
              disabled={authBusy}
              onClick={() => setShowDeleteConfirmation(true)}
              type="button"
            >
              Delete account and cloud data
            </button>
          ) : (
            <div className="account-delete-confirmation" role="alert">
              <strong>This cannot be undone.</strong>
              <p>
                Chronicle will permanently delete your account, Google identity link, synced
                preferences, encrypted key envelope, linked installations, and account-linked
                usage statistics.
              </p>
              <p>
                Watched folders, original files, the local version library, and provider keys
                saved on this device will not be deleted. Usage reporting is an independent
                control above.
              </p>
              <button className="text-button" onClick={onOpenProjects} type="button">
                Open Projects to manage local project/history deletion
              </button>
              <div className="account-delete-actions">
                <button
                  className="secondary-button compact-button"
                  disabled={authBusy}
                  onClick={() => setShowDeleteConfirmation(false)}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className="danger-button"
                  disabled={authBusy}
                  onClick={() => void deleteAccount()}
                  type="button"
                >
                  {authBusy ? 'Deleting…' : 'Permanently delete account'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
