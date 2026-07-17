import { Icon } from '../components/Icon'
import { GoogleMark } from '../components/GoogleMark'
import { PageHeader } from '../components/PageHeader'
import type { ThemePreference } from '../App'
import { projects } from '../data/demoData'

interface SettingsScreenProps {
  themePreference: ThemePreference
  onAddProject: () => void
  onThemePreferenceChange: (preference: ThemePreference) => void
}

const appearanceOptions: { value: ThemePreference; label: string; description: string }[] = [
  { value: 'system', label: 'System', description: 'Match your device appearance' },
  { value: 'dark', label: 'Dark', description: 'Use the dark workspace' },
  { value: 'light', label: 'Light', description: 'Use the light workspace' }
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

        <section className="settings-section">
          <div className="settings-section-heading">
            <Icon name="folder-plus" />
            <div><h2>Tracked folders</h2><p>PNG and JPG files in these folders are versioned automatically.</p></div>
          </div>
          <div className="folder-list">
            {projects.map((project) => (
              <div className="folder-row" key={project.id}>
                <div><strong>{project.name}</strong><span>{project.path}</span></div>
                <button className="text-button" disabled title="Folder management is not connected in this UI skeleton" type="button">Remove</button>
              </div>
            ))}
          </div>
          <button className="secondary-button" onClick={onAddProject} type="button"><Icon name="folder-plus" /> Add a project</button>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <Icon name="spark" />
            <div><h2>AI summaries</h2><p>Optional. Versions are always captured, even when AI is unavailable.</p></div>
          </div>
          <div className="settings-form-grid">
            <label>
              <span>Provider</span>
              <select defaultValue="watsonx">
                <option value="watsonx">watsonx / Granite</option>
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
              </select>
            </label>
            <label>
              <span>Model</span>
              <input defaultValue="granite-vision-3.2-2b" type="text" />
            </label>
            <label className="full-field">
              <span>API key</span>
              <div className="input-with-icon"><Icon name="key" /><input placeholder="Stored encrypted on this device" type="password" /></div>
            </label>
          </div>
          <div className="settings-action-row">
            <p>Keys are sent only to the provider you choose.</p>
            <button className="primary-button compact-button" disabled title="Settings persistence is not connected in this UI skeleton" type="button">Save AI settings</button>
          </div>
        </section>

        <section className="settings-section">
          <div className="settings-section-heading">
            <Icon name="info" />
            <div><h2>Account</h2><p>An account is optional and never gates local version history.</p></div>
          </div>
          <button className="google-button settings-google-button" disabled type="button">
            <span className="google-button-label"><GoogleMark />Continue with Google</span><span className="soon-badge">Coming soon</span>
          </button>
        </section>
      </div>
    </section>
  )
}
