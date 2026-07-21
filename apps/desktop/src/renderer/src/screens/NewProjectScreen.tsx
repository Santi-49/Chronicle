import { useEffect, useMemo, useState } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { FOLDER_COLORS, FOLDER_ICONS } from '../components/FolderGlyph'
import { PageHeader } from '../components/PageHeader'
import { chronicle } from '../lib/bridge'
import { formatBytes } from '../lib/useChronicle'
import type { FolderScanEntry } from '../../../shared/ipc'

interface NewProjectScreenProps {
  onCancel: () => void
  onCreated: (projectId: number) => void
}

/** File-type toggles offered in the tree. Each maps to one or more extensions. */
const FILE_TYPES: { id: 'png' | 'jpg'; label: string; extensions: string[] }[] = [
  { id: 'png', label: 'PNG', extensions: ['.png'] },
  { id: 'jpg', label: 'JPG / JPEG', extensions: ['.jpg', '.jpeg'] },
]

function baseName(p: string): string {
  const parts = p.split(/[\\/]/).filter(Boolean)
  return parts[parts.length - 1] ?? p
}

/** Group scan entries by their parent directory (relative, "/"-normalized), root first. */
function groupByDirectory(entries: FolderScanEntry[]): { dir: string; files: FolderScanEntry[] }[] {
  const groups = new Map<string, FolderScanEntry[]>()
  for (const entry of entries) {
    const normalized = entry.relativePath.replace(/\\/g, '/')
    const slash = normalized.lastIndexOf('/')
    const dir = slash === -1 ? '' : normalized.slice(0, slash)
    const list = groups.get(dir) ?? []
    list.push(entry)
    groups.set(dir, list)
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dir, files]) => ({ dir, files }))
}

export function NewProjectScreen({ onCancel, onCreated }: NewProjectScreenProps) {
  const [name, setName] = useState('')
  const [icon, setIcon] = useState<IconName | 'custom'>('folder')
  const [customIcon, setCustomIcon] = useState('')
  const [color, setColor] = useState(FOLDER_COLORS[0]!)
  const [customColor, setCustomColor] = useState<string | null>(null)
  const [folderPath, setFolderPath] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Folder scan + selection state.
  const [scan, setScan] = useState<FolderScanEntry[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set())
  const [enabledTypes, setEnabledTypes] = useState<Set<'png' | 'jpg'>>(new Set(['png', 'jpg']))

  const activeColor = customColor ?? color

  // Which extensions are currently enabled, from the type toggles.
  const enabledExtensions = useMemo(() => {
    const exts = new Set<string>()
    for (const type of FILE_TYPES) if (enabledTypes.has(type.id)) type.extensions.forEach((e) => exts.add(e))
    return exts
  }, [enabledTypes])

  const typeEnabled = (entry: FolderScanEntry) => enabledExtensions.has(entry.ext)
  const isTracked = (entry: FolderScanEntry) => typeEnabled(entry) && !excluded.has(entry.path)
  const trackedCount = scan ? scan.filter(isTracked).length : 0
  const eligible = scan ? scan.filter(typeEnabled) : []
  const allTracked = eligible.length > 0 && eligible.every((e) => !excluded.has(e.path))

  const groups = useMemo(() => (scan ? groupByDirectory(scan) : []), [scan])

  const handleBrowse = async () => {
    setError(null)
    const chosen = await chronicle.pickFolder()
    if (!chosen) return
    setFolderPath(chosen)
    setScanning(true)
    setScan(null)
    setExcluded(new Set())
    try {
      const entries = await chronicle.scanFolder(chosen)
      setScan(entries)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setScanning(false)
    }
  }

  const toggleFile = (entry: FolderScanEntry) => {
    setExcluded((prev) => {
      const next = new Set(prev)
      if (next.has(entry.path)) next.delete(entry.path)
      else next.add(entry.path)
      return next
    })
  }

  const toggleAll = () => {
    setExcluded((prev) => {
      if (allTracked) return new Set([...prev, ...eligible.map((e) => e.path)])
      const next = new Set(prev)
      eligible.forEach((e) => next.delete(e.path))
      return next
    })
  }

  const toggleType = (id: 'png' | 'jpg') => {
    setEnabledTypes((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!folderPath) {
      setError('Choose a folder to watch first.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const allowedExtensions = FILE_TYPES.filter((t) => enabledTypes.has(t.id)).flatMap((t) => t.extensions)
      // Only record deselections for files whose type is enabled — files of a
      // disabled type are already covered by allowedExtensions.
      const excludedPaths = eligible.filter((e) => excluded.has(e.path)).map((e) => e.path)
      const folder = await chronicle.addFolder(folderPath, {
        displayName: name.trim() || baseName(folderPath),
        icon: icon === 'custom' ? customIcon || 'folder' : icon,
        color: activeColor,
        allowedExtensions,
        excludedPaths,
      })
      onCreated(folder.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

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

      <form className="new-project-form" onSubmit={handleSubmit}>
        <div className="form-section">
          <label className="field">
            <span>Project name</span>
            <input
              onChange={(event) => setName(event.target.value)}
              placeholder={folderPath ? baseName(folderPath) : 'e.g. Aurora launch'}
              type="text"
              value={name}
            />
          </label>

          <label className="field">
            <span>Folder to watch</span>
            <div className="folder-picker">
              <div className="input-with-icon">
                <Icon name="folder" />
                <input placeholder="Choose a folder…" readOnly type="text" value={folderPath} />
              </div>
              <button className="secondary-button" onClick={handleBrowse} type="button">
                Browse…
              </button>
            </div>
          </label>
        </div>

        <div className="form-section">
          <fieldset className="picker-fieldset">
            <legend>Icon</legend>
            <div className="icon-picker" role="radiogroup" aria-label="Project icon">
              {FOLDER_ICONS.map((option) => (
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
                style={{ color: activeColor }}
                type="button"
              >
                {customIcon ? <span className="custom-icon-glyph">{customIcon}</span> : <span className="custom-icon-label" style={{ color: activeColor }}>Aa</span>}
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
              {FOLDER_COLORS.map((option) => (
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
          <div className="file-types-field">
            <p className="section-label">File types</p>
            <div className="file-type-chips">
              {FILE_TYPES.map((type) => {
                const on = enabledTypes.has(type.id)
                return (
                  <button
                    aria-pressed={on}
                    className={on ? 'file-type-chip file-type-active' : 'file-type-chip'}
                    key={type.id}
                    onClick={() => toggleType(type.id)}
                    type="button"
                  >
                    <Icon name={on ? 'check' : 'close'} />
                    {type.label}
                  </button>
                )
              })}
              <span className="file-type-chip file-type-soon">SVG · PSD · BLEND <em>Coming soon</em></span>
            </div>
          </div>

          {folderPath && (
            <div className="scan-panel">
              <div className="scan-summary">
                <div>
                  <strong>{scanning ? 'Scanning…' : `${trackedCount} ${trackedCount === 1 ? 'file' : 'files'} will be tracked`}</strong>
                  {scan && !scanning && (
                    <small>
                      {scan.length} supported {scan.length === 1 ? 'file' : 'files'} found
                      {scan.length !== trackedCount && ` · ${scan.length - trackedCount} skipped`}
                    </small>
                  )}
                </div>
                {eligible.length > 0 && (
                  <label className="scan-select-all">
                    <input checked={allTracked} onChange={toggleAll} type="checkbox" />
                    <span>{allTracked ? 'Deselect all' : 'Select all'}</span>
                  </label>
                )}
              </div>

              {scan && !scanning && scan.length === 0 && (
                <p className="scan-empty">No PNG or JPG files here yet — versions will appear as you save them.</p>
              )}

              {scan && scan.length > 0 && (
                <div className="scan-tree">
                  {groups.map((group) => (
                    <div className="scan-group" key={group.dir || '.'}>
                      <div className="scan-group-label">
                        <Icon name="folder" />
                        {group.dir || 'Root folder'}
                      </div>
                      {group.files.map((entry) => {
                        const enabled = typeEnabled(entry)
                        return (
                          <label
                            className={enabled ? 'scan-file' : 'scan-file scan-file-disabled'}
                            key={entry.path}
                            title={enabled ? '' : 'This file type is turned off above'}
                          >
                            <input
                              checked={isTracked(entry)}
                              disabled={!enabled}
                              onChange={() => toggleFile(entry)}
                              type="checkbox"
                            />
                            <span className="scan-file-name">{baseName(entry.relativePath)}</span>
                            <span className="scan-file-size">{formatBytes(entry.sizeBytes)}</span>
                          </label>
                        )
                      })}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-actions">
          <button className="text-button" onClick={onCancel} type="button">Cancel</button>
          <button className="primary-button" disabled={busy || !folderPath} type="submit">
            <Icon name="folder-plus" />
            {busy ? 'Creating…' : 'Create project'}
          </button>
        </div>
      </form>
    </section>
  )
}
