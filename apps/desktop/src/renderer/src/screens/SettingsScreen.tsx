import { useEffect, useMemo, useState } from 'react'
import { Icon } from '../components/Icon'
import { FolderGlyph } from '../components/FolderGlyph'
import { GoogleMark } from '../components/GoogleMark'
import { PageHeader } from '../components/PageHeader'
import { ProjectRemovalControl } from '../components/ProjectRemovalControl'
import type { ThemePreference } from '../App'
import {
  AI_PROVIDERS,
  findProvider,
  isPresetModel,
  providersForTask,
  type AiTask,
} from '../lib/aiCatalog'
import { useFolders, useSettings } from '../lib/useChronicle'
import { chronicle } from '../lib/bridge'

interface SettingsScreenProps {
  themePreference: ThemePreference
  onAddProject: () => void
  onThemePreferenceChange: (preference: ThemePreference) => void
}

const appearanceOptions: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'System', description: 'Match your device appearance' },
  { value: 'dark', label: 'Dark', description: 'Use the dark workspace' },
  { value: 'light', label: 'Light', description: 'Use the light workspace' },
]

export function SettingsScreen({ themePreference, onAddProject, onThemePreferenceChange }: SettingsScreenProps) {
  return (
    <section className="page settings-page" aria-labelledby="settings-title">
      <PageHeader
        eyebrow="Chronicle preferences"
        title="Settings"
        description="Choose what Chronicle watches and how optional AI summaries are created."
      />

      <div className="settings-sections">
        <AppearanceSection themePreference={themePreference} onThemePreferenceChange={onThemePreferenceChange} />
        <TrackedFoldersSection onAddProject={onAddProject} />
        <AiSection />
        <AccountSection />
      </div>
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

function AiSection() {
  const { settings, configuredProviders, loading, save, setApiKey, clearApiKey } = useSettings()

  const [devMode, setDevMode] = useState(false)
  const [chatProvider, setChatProvider] = useState('google')
  const [chatModel, setChatModel] = useState('gemini-flash-latest')
  const [embedProvider, setEmbedProvider] = useState('google')
  const [embedModel, setEmbedModel] = useState('gemini-embedding-001')
  const [saveState, setSaveState] = useState<string | null>(null)

  // Initialize the form once settings arrive.
  useEffect(() => {
    if (!settings) return
    setChatProvider(settings.ai.chat.provider || 'google')
    setChatModel(settings.ai.chat.model || 'gemini-flash-latest')
    setEmbedProvider(settings.ai.embeddings.provider || 'google')
    setEmbedModel(settings.ai.embeddings.model || 'gemini-embedding-001')
    // Show developer mode automatically when stored values are not presets.
    const preset =
      isPresetModel('chat', settings.ai.chat.provider, settings.ai.chat.model) &&
      isPresetModel('embeddings', settings.ai.embeddings.provider, settings.ai.embeddings.model)
    setDevMode(!preset && settings.ai.chat.provider !== '')
  }, [settings])

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

  const onSave = async () => {
    setSaveState('Saving…')
    try {
      await save({
        ai: {
          mode: settings?.ai.mode ?? 'local',
          chat: { provider: chatProvider.trim(), model: chatModel.trim() },
          embeddings: { provider: embedProvider.trim(), model: embedModel.trim() },
        },
      })
      setSaveState('Saved.')
    } catch (err) {
      setSaveState(err instanceof Error ? err.message : String(err))
    }
  }

  // Providers to show a key row for: the curated catalog plus any custom
  // provider currently selected in developer mode (so its key can be saved).
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

  const missingChatKey = chatProvider.trim() !== '' && !configuredProviders.includes(chatProvider.trim())

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <Icon name="spark" />
        <div><h2>AI summaries</h2><p>Optional. Versions are always captured, even when AI is unavailable.</p></div>
      </div>

      <label className="toggle-field dev-toggle">
        <input checked={devMode} onChange={(event) => setDevMode(event.target.checked)} type="checkbox" />
        <span>
          <strong>Developer mode</strong>
          <small>Enter any LangChain provider and model instead of the presets.</small>
        </span>
      </label>

      <fieldset className="ai-task">
        <legend>Change summaries (vision)</legend>
        {devMode ? (
          <div className="settings-form-grid">
            <label><span>Provider</span><input onChange={(e) => setChatProvider(e.target.value)} placeholder="e.g. google" type="text" value={chatProvider} /></label>
            <label><span>Model</span><input onChange={(e) => setChatModel(e.target.value)} placeholder="e.g. gemini-flash-latest" type="text" value={chatModel} /></label>
          </div>
        ) : (
          <ProviderModelPicker task="chat" provider={chatProvider} model={chatModel} onProvider={(p) => changeProvider('chat', p)} onModel={setChatModel} />
        )}
        {missingChatKey && <p className="ai-task-hint">No saved key for this provider yet — add one below to generate summaries.</p>}
      </fieldset>

      <fieldset className="ai-task">
        <legend>Semantic search (embeddings)</legend>
        {devMode ? (
          <div className="settings-form-grid">
            <label><span>Provider</span><input onChange={(e) => setEmbedProvider(e.target.value)} placeholder="e.g. google" type="text" value={embedProvider} /></label>
            <label><span>Model</span><input onChange={(e) => setEmbedModel(e.target.value)} placeholder="e.g. gemini-embedding-001" type="text" value={embedModel} /></label>
          </div>
        ) : (
          <ProviderModelPicker task="embeddings" provider={embedProvider} model={embedModel} onProvider={(p) => changeProvider('embeddings', p)} onModel={setEmbedModel} />
        )}
      </fieldset>

      <div className="save-cluster save-cluster-end">
        {saveState && <span className="inline-status" role="status">{saveState}</span>}
        <button className="primary-button compact-button" disabled={loading} onClick={() => void onSave()} type="button">Save AI settings</button>
      </div>

      <div className="api-keys">
        <div className="api-keys-heading">
          <h3>Provider API keys</h3>
          <p>Save a key per provider you use. Keys are encrypted on this device and sent only to that provider — never to Chronicle's backend. A task's provider can be switched without re-entering its key.</p>
        </div>
        {keyProviders.map((provider) => (
          <ApiKeyRow
            key={provider.id}
            provider={provider.id}
            label={provider.label}
            saved={configuredProviders.includes(provider.id)}
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
  onSave,
  onClear,
}: {
  provider: string
  label: string
  saved: boolean
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
          onChange={(event) => setDraft(event.target.value)}
          placeholder={saved ? 'Saved — type to replace it' : 'Paste API key'}
          type="password"
          value={draft}
        />
      </div>
      <div className="api-key-actions">
        <button className="secondary-button compact-button" disabled={!draft.trim()} onClick={() => void save()} type="button">Save</button>
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
  const models = findProvider(provider)?.[task] ?? AI_PROVIDERS.find((p) => p[task].length > 0)![task]

  return (
    <div className="settings-form-grid">
      <label>
        <span>Provider</span>
        <select onChange={(event) => onProvider(event.target.value)} value={provider}>
          {providers.map((p) => (
            <option key={p.id} value={p.id}>{p.label}</option>
          ))}
        </select>
      </label>
      <label>
        <span>Model</span>
        <select onChange={(event) => onModel(event.target.value)} value={model}>
          {models.map((m) => (
            <option key={m.id} value={m.id}>{m.label} — {m.tier}</option>
          ))}
        </select>
      </label>
    </div>
  )
}

// ── Account ────────────────────────────────────────────────────────────────

function AccountSection() {
  const [email, setEmail] = useState<string | null>(null)

  useEffect(() => {
    void chronicle.getAccountState().then((state) => setEmail(state.email))
  }, [])

  return (
    <section className="settings-section">
      <div className="settings-section-heading">
        <Icon name="info" />
        <div><h2>Account</h2><p>An account is optional and never gates local version history.</p></div>
      </div>
      <p className="settings-empty">{email ? `Signed in as ${email}.` : 'Running in local mode. Your history stays on this device.'}</p>
      <button className="google-button settings-google-button" disabled type="button">
        <span className="google-button-label"><GoogleMark />Continue with Google</span><span className="soon-badge">Coming soon</span>
      </button>
    </section>
  )
}
