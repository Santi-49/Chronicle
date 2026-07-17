import { useState } from 'react'
import { Icon } from '../components/Icon'
import { PageHeader } from '../components/PageHeader'
import { projectColors, projectIcons } from '../data/demoData'
import type { IconName } from '../components/Icon'

interface NewProjectScreenProps {
  onCancel: () => void
}

export function NewProjectScreen({ onCancel }: NewProjectScreenProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<IconName | 'custom'>('folder')
  const [customIcon, setCustomIcon] = useState('')
  const [color, setColor] = useState(projectColors[0])
  const [customColor, setCustomColor] = useState<string | null>(null)
  const [watchSubfolders, setWatchSubfolders] = useState(true)

  const activeColor = customColor ?? color

  return (
    <section className="page new-project-page" aria-labelledby="new-project-title">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onCancel} type="button">Projects</button>
        <Icon name="chevron-right" />
        <span aria-current="page">New project</span>
      </nav>

      <PageHeader
        eyebrow="Tracked folder"
        title="New project"
        description="Point Chronicle at a folder. Every save inside it becomes a version automatically."
      />

      <form className="new-project-form" onSubmit={(event) => event.preventDefault()}>
        <div className="form-section">
          <label className="field">
            <span>Project name</span>
            <input
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Aurora launch"
              type="text"
              value={name}
            />
          </label>

          <label className="field">
            <span>Folder to watch</span>
            <div className="folder-picker">
              <div className="input-with-icon">
                <Icon name="folder" />
                <input placeholder="D:\Creative\…" readOnly type="text" value="" />
              </div>
              <button
                className="secondary-button"
                disabled
                title="Folder selection is not connected in this UI skeleton"
                type="button"
              >
                Browse…
              </button>
            </div>
          </label>
        </div>

        <div className="form-section">
          <fieldset className="picker-fieldset">
            <legend>Icon</legend>
            <div className="icon-picker" role="radiogroup" aria-label="Project icon">
              {projectIcons.map((option) => (
                <button
                  aria-checked={icon === option}
                  aria-label={option}
                  className={icon === option ? 'icon-choice icon-choice-active' : 'icon-choice'}
                  key={option}
                  onClick={() => setIcon(option)}
                  role="radio"
                  style={{ color: activeColor }}
                  type="button"
                >
                  <Icon name={option} />
                </button>
              ))}
              <button
                aria-checked={icon === 'custom'}
                aria-label="Custom icon"
                className={icon === 'custom' ? 'icon-choice icon-choice-active' : 'icon-choice'}
                onClick={() => setIcon('custom')}
                role="radio"
                type="button"
              >
                {customIcon ? <span className="custom-icon-glyph">{customIcon}</span> : <span className="custom-icon-label">Aa</span>}
              </button>
              {icon === 'custom' && (
                <input
                  aria-label="Custom icon character"
                  className="custom-icon-input"
                  maxLength={2}
                  onChange={(event) => setCustomIcon(event.target.value)}
                  placeholder="Emoji or letter"
                  type="text"
                  value={customIcon}
                />
              )}
            </div>
          </fieldset>

          <fieldset className="picker-fieldset">
            <legend>Color</legend>
            <div className="color-picker" role="radiogroup" aria-label="Project color">
              {projectColors.map((option) => (
                <button
                  aria-checked={customColor === null && color === option}
                  aria-label={`Color ${option}`}
                  className={
                    customColor === null && color === option ? 'color-choice color-choice-active' : 'color-choice'
                  }
                  key={option}
                  onClick={() => {
                    setColor(option)
                    setCustomColor(null)
                  }}
                  role="radio"
                  style={{ background: option }}
                  type="button"
                />
              ))}
              <label
                className={customColor !== null ? 'color-choice color-choice-custom color-choice-active' : 'color-choice color-choice-custom'}
                style={customColor !== null ? { background: customColor } : undefined}
                title="Custom color"
              >
                <input
                  aria-label="Custom color"
                  onChange={(event) => setCustomColor(event.target.value)}
                  type="color"
                  value={customColor ?? color}
                />
                {customColor === null && <span aria-hidden="true">+</span>}
              </label>
            </div>
          </fieldset>
        </div>

        <div className="form-section">
          <label className="toggle-field">
            <input
              checked={watchSubfolders}
              onChange={(event) => setWatchSubfolders(event.target.checked)}
              type="checkbox"
            />
            <span>
              <strong>Include subfolders</strong>
              <small>Watch every folder inside the project recursively.</small>
            </span>
          </label>

          <div className="file-types-field">
            <p className="section-label">File types</p>
            <div className="file-type-chips">
              <span className="file-type-chip file-type-active">PNG</span>
              <span className="file-type-chip file-type-active">JPG / JPEG</span>
              <span className="file-type-chip">CAD (DWG/DXF) <em>Coming soon</em></span>
            </div>
          </div>
        </div>

        <div className="form-actions">
          <button className="text-button" onClick={onCancel} type="button">Cancel</button>
          <button
            className="primary-button"
            disabled
            title="Project creation is not connected in this UI skeleton"
            type="submit"
          >
            <Icon name="folder-plus" />
            Create project
          </button>
        </div>
      </form>
    </section>
  )
}
