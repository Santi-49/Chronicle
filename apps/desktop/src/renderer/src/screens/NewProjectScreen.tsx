import { useEffect, useMemo, useState, type ReactElement } from 'react'
import { Icon, type IconName } from '../components/Icon'
import { FOLDER_COLORS, FOLDER_ICONS } from '../components/FolderGlyph'
import { PageHeader } from '../components/PageHeader'
import { chronicle } from '../lib/bridge'
import { formatBytes } from '../lib/useChronicle'
import type { FolderScanEntry, TrackedFolder } from '../../../shared/ipc'

interface NewProjectScreenProps {
  onCancel: () => void
  onCreated: (projectId: number) => void
  /** When provided, the same form edits an existing project with its folder locked. */
  project?: TrackedFolder
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

interface FileNode {
  type: 'file'
  name: string
  entry: FolderScanEntry
}
interface DirNode {
  type: 'dir'
  name: string
  /** Relative path of this directory, "/"-normalized (root = ""). */
  relPath: string
  dirs: DirNode[]
  files: FileNode[]
}

/** Build a nested folder tree from the flat scan result. */
function buildTree(entries: FolderScanEntry[]): DirNode {
  const root: DirNode = { type: 'dir', name: '', relPath: '', dirs: [], files: [] }
  for (const entry of entries) {
    const parts = entry.relativePath.replace(/\\/g, '/').split('/')
    let node = root
    for (let i = 0; i < parts.length - 1; i++) {
      const name = parts[i]!
      const relPath = node.relPath ? `${node.relPath}/${name}` : name
      let child = node.dirs.find((d) => d.name === name)
      if (!child) {
        child = { type: 'dir', name, relPath, dirs: [], files: [] }
        node.dirs.push(child)
      }
      node = child
    }
    node.files.push({ type: 'file', name: parts[parts.length - 1]!, entry })
  }
  const sort = (dir: DirNode): void => {
    dir.dirs.sort((a, b) => a.name.localeCompare(b.name))
    dir.files.sort((a, b) => a.name.localeCompare(b.name))
    dir.dirs.forEach(sort)
  }
  sort(root)
  return root
}

/** All file entries anywhere under a directory node (recursive). */
function filesUnder(dir: DirNode): FolderScanEntry[] {
  return [...dir.files.map((f) => f.entry), ...dir.dirs.flatMap(filesUnder)]
}

export function NewProjectScreen({ onCancel, onCreated, project }: NewProjectScreenProps) {
  const editing = project !== undefined
  const knownIcon = project ? FOLDER_ICONS.includes(project.icon as IconName) : true
  const [name, setName] = useState(project?.displayName ?? '')
  const [description, setDescription] = useState(project?.description ?? '')
  const [icon, setIcon] = useState<IconName | 'custom'>(
    project && !knownIcon ? 'custom' : (project?.icon as IconName | undefined) ?? 'folder',
  )
  const [customIcon, setCustomIcon] = useState(project && !knownIcon ? project.icon : '')
  const [color, setColor] = useState(project?.color ?? FOLDER_COLORS[0]!)
  const [customColor, setCustomColor] = useState<string | null>(
    project && !FOLDER_COLORS.includes(project.color) ? project.color : null,
  )
  const [folderPath, setFolderPath] = useState(project?.path ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Folder scan + selection state.
  const [scan, setScan] = useState<FolderScanEntry[] | null>(null)
  const [scanning, setScanning] = useState(false)
  const [excluded, setExcluded] = useState<Set<string>>(new Set(project?.excludedPaths ?? []))
  const [enabledTypes, setEnabledTypes] = useState<Set<'png' | 'jpg'>>(() => {
    if (!project) return new Set(['png', 'jpg'])
    const enabled = new Set<'png' | 'jpg'>()
    if (project.allowedExtensions.includes('.png')) enabled.add('png')
    if (project.allowedExtensions.includes('.jpg') || project.allowedExtensions.includes('.jpeg')) enabled.add('jpg')
    return enabled
  })
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

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

  const tree = useMemo(() => (scan ? buildTree(scan) : null), [scan])

  useEffect(() => {
    if (!project) return
    let cancelled = false
    setScanning(true)
    void chronicle.scanFolder(project.path)
      .then((entries) => {
        if (!cancelled) setScan(entries)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setScanning(false)
      })
    return () => {
      cancelled = true
    }
  }, [project])

  const toggleExpand = (relPath: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(relPath)) next.delete(relPath)
      else next.add(relPath)
      return next
    })
  }

  /** Select/deselect every eligible file under a directory in one click. */
  const toggleFolder = (dir: DirNode) => {
    const eligiblePaths = filesUnder(dir).filter(typeEnabled).map((e) => e.path)
    const allSelected = eligiblePaths.length > 0 && eligiblePaths.every((p) => !excluded.has(p))
    setExcluded((prev) => {
      const next = new Set(prev)
      if (allSelected) eligiblePaths.forEach((p) => next.add(p))
      else eligiblePaths.forEach((p) => next.delete(p))
      return next
    })
  }

  /** Recursive tree: folders (collapsed by default) then files, indented by depth. */
  const renderNodes = (dir: DirNode, depth: number): ReactElement[] => {
    const rows: ReactElement[] = []
    const indent = { paddingLeft: depth * 18 + 12 }

    for (const child of dir.dirs) {
      const open = expanded.has(child.relPath)
      const eligiblePaths = filesUnder(child).filter(typeEnabled).map((e) => e.path)
      const trackedN = eligiblePaths.filter((p) => !excluded.has(p)).length
      const allSel = eligiblePaths.length > 0 && trackedN === eligiblePaths.length
      const someSel = trackedN > 0

      rows.push(
        <div className="tree-row tree-folder-row" key={`d:${child.relPath}`} style={indent}>
          <button
            aria-expanded={open}
            aria-label={open ? 'Collapse folder' : 'Expand folder'}
            className="tree-disclosure"
            onClick={() => toggleExpand(child.relPath)}
            type="button"
          >
            <Icon name="chevron-right" className={open ? 'tree-chevron tree-chevron-open' : 'tree-chevron'} />
          </button>
          <input
            aria-label={`Track all files in ${child.name}`}
            checked={allSel}
            className="tree-check"
            disabled={eligiblePaths.length === 0}
            onChange={() => toggleFolder(child)}
            ref={(el) => {
              if (el) el.indeterminate = someSel && !allSel
            }}
            type="checkbox"
          />
          <button className="tree-folder-name" onClick={() => toggleExpand(child.relPath)} type="button">
            <Icon name="folder" />
            <span>{child.name}</span>
            <em>{trackedN}/{eligiblePaths.length}</em>
          </button>
        </div>,
      )
      if (open) rows.push(...renderNodes(child, depth + 1))
    }

    for (const file of dir.files) {
      const enabled = typeEnabled(file.entry)
      rows.push(
        <label
          className={enabled ? 'tree-row tree-file-row' : 'tree-row tree-file-row scan-file-disabled'}
          key={`f:${file.entry.path}`}
          style={indent}
          title={enabled ? '' : 'This file type is turned off above'}
        >
          <span className="tree-disclosure-spacer" />
          <input
            checked={isTracked(file.entry)}
            className="tree-check"
            disabled={!enabled}
            onChange={() => toggleFile(file.entry)}
            type="checkbox"
          />
          <Icon name="image" className="tree-file-icon" />
          <span className="tree-file-name">{file.name}</span>
          <span className="tree-file-size">{formatBytes(file.entry.sizeBytes)}</span>
        </label>,
      )
    }

    return rows
  }

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
    const allowedExtensions = FILE_TYPES.filter((type) => enabledTypes.has(type.id))
      .flatMap((type) => type.extensions)
    if (allowedExtensions.length === 0) {
      setError('Choose at least one file type to track.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      // Only record deselections for files whose type is enabled — files of a
      // disabled type are already covered by allowedExtensions.
      const excludedPaths = scan === null
        ? [...excluded]
        : eligible.filter((e) => excluded.has(e.path)).map((e) => e.path)
      const meta = {
        displayName: name.trim() || baseName(folderPath),
        description: description.trim(),
        icon: icon === 'custom' ? customIcon || 'folder' : icon,
        color: activeColor,
        allowedExtensions,
        excludedPaths,
      }
      const folder = project
        ? await chronicle.updateFolder(project.id, meta)
        : await chronicle.addFolder(folderPath, meta)
      onCreated(folder.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
      setBusy(false)
    }
  }

  return (
    <section className="page new-project-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button onClick={onCancel} type="button">{editing ? project.displayName : 'Projects'}</button>
        <Icon name="chevron-right" />
        <span aria-current="page">{editing ? 'Edit project' : 'New project'}</span>
      </nav>

      <PageHeader
        eyebrow="Tracked folder"
        title={editing ? 'Edit project' : 'New project'}
        description={editing
          ? 'Update project details and choose which creative files Chronicle should track.'
          : 'Point Chronicle at a folder. Every save inside it becomes a version automatically.'}
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
            <span>Project description <em>Optional</em></span>
            <textarea
              aria-describedby="project-description-help"
              maxLength={280}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Add a short note about this project"
              rows={3}
              value={description}
            />
            <small id="project-description-help">Give the project context your future self will recognize.</small>
          </label>

          <label className="field">
            <span>Folder to watch</span>
            <div className="folder-picker">
              <div className="input-with-icon">
                <Icon name="folder" />
                <input placeholder="Choose a folder…" readOnly type="text" value={folderPath} />
              </div>
              {editing ? (
                <button className="secondary-button" disabled type="button">Locked</button>
              ) : (
                <button className="secondary-button" onClick={handleBrowse} type="button">Browse…</button>
              )}
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

              {tree && scan && scan.length > 0 && (
                <div className="scan-tree">{renderNodes(tree, 0)}</div>
              )}
            </div>
          )}
        </div>

        {error && <p className="form-error" role="alert">{error}</p>}

        <div className="form-actions">
          <button className="text-button" onClick={onCancel} type="button">Cancel</button>
          <button className="primary-button" disabled={busy || !folderPath} type="submit">
            <Icon name={editing ? 'check' : 'folder-plus'} />
            {busy ? (editing ? 'Saving…' : 'Creating…') : (editing ? 'Save changes' : 'Create project')}
          </button>
        </div>
      </form>
    </section>
  )
}
