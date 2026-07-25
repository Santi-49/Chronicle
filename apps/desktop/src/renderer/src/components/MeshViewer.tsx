import { useEffect, useRef, useState } from 'react'
import { formatById, type FormatId } from '../../../shared/formats'
import { Icon } from './Icon'
import { loadMeshGeometry } from '../lib/meshLoaders'

/**
 * Interactive 3D view of a captured mesh version (OBJ, STEP).
 *
 * three.js and the CAD tessellator are imported dynamically, so the cost of the
 * 3D stack is paid only when a mesh version is actually opened — the assets,
 * timeline, and search screens never load them.
 *
 * Drag rotates, wheel zooms. Everything is loaded from the chronicle:// URL of
 * the stored bytes, so the renderer still never touches a filesystem path.
 */
export function MeshViewer({
  src,
  format,
  label,
}: {
  src: string
  format: FormatId
  label: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading')
  const [detail, setDetail] = useState<string | null>(null)

  useEffect(() => {
    let disposed = false
    let cleanup: (() => void) | undefined
    setState('loading')
    setDetail(null)

    void (async () => {
      try {
        const three = await import('three')
        const geometry = await loadMeshGeometry(src, format, three)
        if (disposed) return
        const container = host.current
        if (!container) return

        cleanup = mount(container, three, geometry)
        setState('ready')
        setDetail(
          `${geometry.attributes['position']!.count.toLocaleString()} vertices` +
            (geometry.userData['truncated'] === true ? ' (partially loaded)' : ''),
        )
      } catch (error) {
        if (disposed) return
        setState('failed')
        setDetail(error instanceof Error ? error.message : String(error))
      }
    })()

    return () => {
      disposed = true
      cleanup?.()
    }
  }, [src, format])

  if (state === 'failed') {
    return (
      <div className="mesh-viewer mesh-viewer-empty">
        <Icon name={formatById(format).icon} />
        <p>This 3D file could not be displayed.</p>
        {detail && <p className="mesh-viewer-detail">{detail}</p>}
      </div>
    )
  }

  return (
    <div className="mesh-viewer">
      <div aria-label={`3D view of ${label}`} className="mesh-viewer-canvas" ref={host} role="img" />
      {state === 'loading' ? (
        <p className="mesh-viewer-detail">Loading 3D view…</p>
      ) : (
        <p className="mesh-viewer-detail">Drag to rotate · scroll to zoom{detail ? ` · ${detail}` : ''}</p>
      )}
    </div>
  )
}

type Three = typeof import('three')

/**
 * Build the scene and return a disposer. Kept plain three.js — no controls
 * add-on — because the interaction needed here is one orbit and one zoom.
 */
function mount(
  container: HTMLDivElement,
  three: Three,
  geometry: import('three').BufferGeometry,
): () => void {
  const renderer = new three.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  container.replaceChildren(renderer.domElement)

  const scene = new three.Scene()
  const camera = new three.PerspectiveCamera(45, 1, 0.01, 1_000)

  const material = new three.MeshStandardMaterial({
    color: 0x9aa4b2,
    metalness: 0.1,
    roughness: 0.65,
    side: three.DoubleSide,
  })
  const isPointCloud = geometry.getIndex() === null && geometry.attributes['normal'] === undefined
  const object = isPointCloud
    ? new three.Points(geometry, new three.PointsMaterial({ color: 0x4589ff, size: 0.01 }))
    : new three.Mesh(geometry, material)

  // Centre the model on the origin and frame it, so any model scale looks right.
  geometry.computeBoundingSphere()
  const sphere = geometry.boundingSphere!
  object.position.set(-sphere.center.x, -sphere.center.y, -sphere.center.z)
  const pivot = new three.Group()
  pivot.add(object)
  scene.add(pivot)

  scene.add(new three.HemisphereLight(0xffffff, 0x333844, 1.1))
  const key = new three.DirectionalLight(0xffffff, 1.4)
  key.position.set(1, 1.4, 1.8)
  scene.add(key)

  let distance = Math.max(sphere.radius * 3, 0.1)
  let yaw = Math.PI / 5
  let pitch = Math.PI / 8

  const place = (): void => {
    camera.position.set(
      distance * Math.cos(pitch) * Math.sin(yaw),
      distance * Math.sin(pitch),
      distance * Math.cos(pitch) * Math.cos(yaw),
    )
    camera.lookAt(0, 0, 0)
  }

  const draw = (): void => {
    place()
    renderer.render(scene, camera)
  }

  const resize = (): void => {
    const size = Math.max(container.clientWidth, 1)
    const height = Math.max(container.clientHeight, 1)
    renderer.setSize(size, height, false)
    camera.aspect = size / height
    camera.updateProjectionMatrix()
    draw()
  }

  const observer = new ResizeObserver(resize)
  observer.observe(container)
  resize()

  let dragging = false
  let lastX = 0
  let lastY = 0
  const onPointerDown = (event: PointerEvent): void => {
    dragging = true
    lastX = event.clientX
    lastY = event.clientY
    renderer.domElement.setPointerCapture(event.pointerId)
  }
  const onPointerMove = (event: PointerEvent): void => {
    if (!dragging) return
    yaw -= (event.clientX - lastX) * 0.01
    pitch = Math.max(-1.5, Math.min(1.5, pitch + (event.clientY - lastY) * 0.01))
    lastX = event.clientX
    lastY = event.clientY
    draw()
  }
  const onPointerUp = (): void => {
    dragging = false
  }
  const onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    distance = Math.max(sphere.radius * 0.4, Math.min(sphere.radius * 12, distance * (1 + event.deltaY * 0.001)))
    draw()
  }

  renderer.domElement.addEventListener('pointerdown', onPointerDown)
  renderer.domElement.addEventListener('pointermove', onPointerMove)
  renderer.domElement.addEventListener('pointerup', onPointerUp)
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false })

  return () => {
    observer.disconnect()
    renderer.domElement.removeEventListener('pointerdown', onPointerDown)
    renderer.domElement.removeEventListener('pointermove', onPointerMove)
    renderer.domElement.removeEventListener('pointerup', onPointerUp)
    renderer.domElement.removeEventListener('wheel', onWheel)
    geometry.dispose()
    material.dispose()
    renderer.dispose()
    container.replaceChildren()
  }
}
