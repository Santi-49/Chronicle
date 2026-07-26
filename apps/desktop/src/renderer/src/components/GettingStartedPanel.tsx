import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react'
import type { AppRoute } from '../types/navigation'
import {
  firstIncompleteStep,
  type OnboardingState,
} from '../lib/onboarding'
import { Icon } from './Icon'

interface GettingStartedPanelProps {
  state: OnboardingState
  route: AppRoute
  onNavigate: (route: AppRoute) => void
  onDeferAi: () => void
  onDismiss: () => void
  onFinish: () => void
  onTimelineExplored: () => void
}

type TourStep = 1 | 2 | 3 | 4
type Placement = 'top' | 'right' | 'bottom' | 'left' | 'center'

interface TourTarget {
  selectors: string[]
  title: string
  description: string
  instruction?: string
}

interface TargetPosition {
  rect: DOMRect
  placement: Placement
  top: number
  left: number
  arrowLeft: number
  arrowTop: number
  arrowAngle: number
}

interface CoachBounds {
  top: number
  bottom: number
}

interface CoachSize {
  width: number
  height: number
}

const COACH_WIDTH = 280
const COACH_HEIGHT = 168
const COACH_GAP = 12
const VIEWPORT_GUTTER = 16
const DESCRIPTION_ID = 'getting-started-description'

function isVisible(element: HTMLElement): boolean {
  const rect = element.getBoundingClientRect()
  const style = window.getComputedStyle(element)
  return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden'
}

function firstVisibleTarget(selectors: string[]): HTMLElement | null {
  for (const selector of selectors) {
    const target = [...document.querySelectorAll<HTMLElement>(selector)].find(isVisible)
    if (target) return target
  }
  return null
}

export function positionCoachMark(
  rect: DOMRect,
  viewportWidth: number,
  viewportHeight: number,
  bounds: CoachBounds = { top: 0, bottom: viewportHeight },
  coachSize: CoachSize = { width: COACH_WIDTH, height: COACH_HEIGHT },
): TargetPosition {
  const room = {
    top: rect.top - bounds.top,
    right: viewportWidth - rect.right,
    bottom: bounds.bottom - rect.bottom,
    left: rect.left,
  }

  let placement: Placement = 'bottom'
  if (room.right >= coachSize.width + COACH_GAP) placement = 'right'
  else if (room.left >= coachSize.width + COACH_GAP) placement = 'left'
  else if (room.bottom >= coachSize.height + COACH_GAP) placement = 'bottom'
  else if (room.top >= coachSize.height + COACH_GAP) placement = 'top'

  const clampLeft = (value: number) =>
    Math.min(Math.max(value, VIEWPORT_GUTTER), viewportWidth - coachSize.width - VIEWPORT_GUTTER)
  const minimumTop = bounds.top + VIEWPORT_GUTTER
  const maximumTop = Math.max(minimumTop, bounds.bottom - coachSize.height - VIEWPORT_GUTTER)
  const clampTop = (value: number) => Math.min(Math.max(value, minimumTop), maximumTop)

  let top: number
  let left: number
  if (placement === 'right') {
    top = clampTop(rect.top + rect.height / 2 - coachSize.height / 2)
    left = rect.right + COACH_GAP
  } else if (placement === 'left') {
    top = clampTop(rect.top + rect.height / 2 - coachSize.height / 2)
    left = rect.left - coachSize.width - COACH_GAP
  } else if (placement === 'top') {
    top = rect.top - coachSize.height - COACH_GAP
    left = clampLeft(rect.left + rect.width / 2 - coachSize.width / 2)
  } else {
    top = rect.bottom + COACH_GAP
    left = clampLeft(rect.left + rect.width / 2 - coachSize.width / 2)
  }

  const deltaX = rect.left + rect.width / 2 - (left + coachSize.width / 2)
  const deltaY = rect.top + rect.height / 2 - (top + coachSize.height / 2)
  const edgeScale = Math.min(
    deltaX === 0 ? Number.POSITIVE_INFINITY : (coachSize.width / 2) / Math.abs(deltaX),
    deltaY === 0 ? Number.POSITIVE_INFINITY : (coachSize.height / 2) / Math.abs(deltaY),
  )

  return {
    rect,
    placement,
    top,
    left,
    arrowLeft: coachSize.width / 2 + deltaX * edgeScale,
    arrowTop: coachSize.height / 2 + deltaY * edgeScale,
    arrowAngle: Math.atan2(deltaY, deltaX) * 180 / Math.PI,
  }
}

function targetForStep(step: TourStep, route: AppRoute): TourTarget {
  if (step === 1 && route.name === 'new-project') {
    return {
      selectors: ['[data-tour="create-project-submit"]:not(:disabled)', '[data-tour="choose-folder"]'],
      title: 'Choose a folder',
      description: 'Chronicle watches it for meaningful saves. Your files stay where they are.',
      instruction: 'Use the highlighted control.',
    }
  }
  if (step === 1) {
    return {
      selectors: ['[data-tour="create-project"]'],
      title: 'Create a project',
      description: 'Connect Chronicle to a folder on your computer.',
      instruction: 'Select Add project.',
    }
  }
  if (step === 2 && route.name === 'project') {
    return {
      selectors: ['[data-tour="open-asset"]', '[data-tour="project-empty"]'],
      title: 'Open an asset',
      description: 'Its Timeline contains every captured save.',
      instruction: 'If empty, save a supported file first.',
    }
  }
  if (step === 2 && route.name === 'timeline') {
    return {
      selectors: ['[data-tour="timeline-version"]', '[data-tour="timeline"]'],
      title: 'Explore the Timeline',
      description: 'Open a version to inspect its summary and restore options.',
      instruction: 'Take your time. Use → when ready.',
    }
  }
  if (step === 2 && route.name === 'version') {
    return {
      selectors: [],
      title: '',
      description: '',
    }
  }
  if (step === 2 && route.name === 'projects') {
    return {
      selectors: ['[data-tour="open-project"]'],
      title: 'Open your project',
      description: 'Projects contains all your tracked folders.',
      instruction: 'Select the highlighted project.',
    }
  }
  if (step === 2) {
    return {
      selectors: ['[data-tour="nav-projects"]'],
      title: 'Your projects live here',
      description: 'Open a project, then choose an asset to see its Timeline.',
      instruction: 'Select Projects.',
    }
  }
  if (step === 3 && route.name === 'settings') {
    return {
      selectors: [
        '[data-tour="ai-provider-key-save"]:not(:disabled)',
        '[data-tour="ai-provider-key"]',
        '[data-tour="ai-settings"]',
      ],
      title: 'Connect an AI provider',
      description: 'Add and save your provider key. It stays encrypted locally.',
      instruction: 'AI is optional.',
    }
  }
  if (step === 3) {
    return {
      selectors: ['[data-tour="nav-settings"]'],
      title: 'Optional AI setup',
      description: 'Settings connects summaries and semantic search.',
      instruction: 'Select Settings, or use → to defer.',
    }
  }
  return {
    selectors: [],
    title: 'You’re ready',
    description: 'Keep working in your folder. Chronicle will build the version history as you save.',
  }
}

export function GettingStartedPanel({
  state,
  route,
  onNavigate,
  onDeferAi,
  onDismiss,
  onFinish,
  onTimelineExplored,
}: GettingStartedPanelProps) {
  const nextStep = firstIncompleteStep(state)
  const [visibleStep, setVisibleStep] = useState<TourStep>(nextStep)
  const [target, setTarget] = useState<HTMLElement | null>(null)
  const [position, setPosition] = useState<TargetPosition | null>(null)
  const lastScrolledTarget = useRef<HTMLElement | null>(null)
  const coachMarkRef = useRef<HTMLElement | null>(null)
  const coach = useMemo(() => targetForStep(visibleStep, route), [route, visibleStep])

  // Synchronize real completion before paint so the previous coach card never
  // flashes after project creation, Timeline entry, or provider-key saving.
  useLayoutEffect(() => setVisibleStep(nextStep), [nextStep])

  useLayoutEffect(() => {
    if (state.status !== 'active' || coach.selectors.length === 0) {
      setTarget(null)
      setPosition(null)
      return
    }

    let currentTarget: HTMLElement | null = null
    const targetResizeObserver = new ResizeObserver(() => update())
    const update = () => {
      const nextTarget = firstVisibleTarget(coach.selectors)
      if (!nextTarget) {
        currentTarget?.removeAttribute('aria-describedby')
        targetResizeObserver.disconnect()
        currentTarget = null
        setTarget(null)
        setPosition(null)
        return
      }

      if (currentTarget !== nextTarget) {
        currentTarget?.removeAttribute('aria-describedby')
        targetResizeObserver.disconnect()
        currentTarget = nextTarget
        currentTarget.setAttribute('aria-describedby', DESCRIPTION_ID)
        targetResizeObserver.observe(currentTarget)
        setTarget(currentTarget)
      }

      const rect = currentTarget.getBoundingClientRect()
      const workspaceRect = document.querySelector<HTMLElement>('.workspace-shell')?.getBoundingClientRect()
      const coachRect = coachMarkRef.current?.getBoundingClientRect()
      setPosition(positionCoachMark(
        rect,
        window.innerWidth,
        window.innerHeight,
        {
          top: workspaceRect?.top ?? 0,
          bottom: workspaceRect?.bottom ?? window.innerHeight,
        },
        {
          width: coachRect?.width || COACH_WIDTH,
          height: coachRect?.height || COACH_HEIGHT,
        },
      ))

      const outsideViewport =
        rect.top < VIEWPORT_GUTTER ||
        rect.bottom > window.innerHeight - VIEWPORT_GUTTER
      if (outsideViewport && lastScrolledTarget.current !== currentTarget) {
        lastScrolledTarget.current = currentTarget
        const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        currentTarget.scrollIntoView({ block: 'center', behavior: reducedMotion ? 'auto' : 'smooth' })
      }
    }

    // Route content enters with a short translate animation. Follow it until
    // settled so the spotlight does not retain the initial 7px offset.
    const trackingStartedAt = performance.now()
    let trackingFrame = 0
    const trackEntrance = () => {
      update()
      if (performance.now() - trackingStartedAt < 400) {
        trackingFrame = window.requestAnimationFrame(trackEntrance)
      }
    }
    trackingFrame = window.requestAnimationFrame(trackEntrance)
    const observer = new MutationObserver(update)
    observer.observe(document.body, {
      attributes: true,
      attributeFilter: ['disabled'],
      childList: true,
      subtree: true,
    })
    window.addEventListener('resize', update)
    window.addEventListener('scroll', update, true)

    return () => {
      window.cancelAnimationFrame(trackingFrame)
      observer.disconnect()
      targetResizeObserver.disconnect()
      window.removeEventListener('resize', update)
      window.removeEventListener('scroll', update, true)
      currentTarget?.removeAttribute('aria-describedby')
    }
  }, [coach, state.status])

  useEffect(() => {
    const skipOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && state.status === 'active') onDismiss()
    }
    window.addEventListener('keydown', skipOnEscape)
    return () => window.removeEventListener('keydown', skipOnEscape)
  }, [onDismiss, state.status])

  if (state.status !== 'active') return null

  const goBack = () => {
    if (visibleStep === 2) {
      setVisibleStep(1)
      onNavigate({ name: 'home' })
    } else if (visibleStep === 3) {
      setVisibleStep(2)
      onNavigate(state.projectId
        ? { name: 'project', projectId: state.projectId }
        : { name: 'projects' })
    } else if (visibleStep === 4) {
      setVisibleStep(3)
    }
  }

  const skipCurrentStep = () => {
    if (visibleStep === 1) {
      setVisibleStep(2)
    } else if (visibleStep === 2) {
      if (route.name === 'timeline' || route.name === 'version') onTimelineExplored()
      else setVisibleStep(3)
    } else if (visibleStep === 3) {
      onDeferAi()
      setVisibleStep(4)
    }
  }

  if (visibleStep === 2 && route.name === 'version') {
    return (
      <button
        className="tour-continue-card"
        onClick={() => {
          onTimelineExplored()
          setVisibleStep(3)
        }}
        type="button"
      >
        <span>
          <small>Quick tour · 2 of 3</small>
          <strong>Continue tour</strong>
        </span>
        <Icon name="chevron-right" />
      </button>
    )
  }

  const style = position
    ? ({
        '--arrow-angle': `${position.arrowAngle}deg`,
        '--arrow-left': `${position.arrowLeft}px`,
        '--arrow-top': `${position.arrowTop}px`,
        '--coach-left': `${position.left}px`,
        '--coach-top': `${position.top}px`,
      } as CSSProperties)
    : undefined
  const emptyProject = target?.dataset.tour === 'project-empty'
  const displayedTitle = emptyProject ? 'Create the first version' : coach.title
  const displayedDescription = emptyProject
    ? 'Save a supported creative file inside this project folder. Chronicle will detect it and show the asset here automatically.'
    : coach.description
  const displayedInstruction = emptyProject
    ? 'Return to your creative app, save the file, then come back and click the highlighted asset.'
    : coach.instruction

  const fallbackAction = !target && visibleStep < 4
    ? visibleStep === 1
      ? {
          label: 'Create project',
          icon: 'folder-plus' as const,
          run: () => onNavigate({ name: 'new-project' } as const),
        }
      : visibleStep === 2
        ? {
            label: 'Open project',
            icon: 'folder' as const,
            run: () => onNavigate(state.projectId
              ? { name: 'project', projectId: state.projectId }
              : { name: 'projects' }),
          }
        : {
            label: 'Open AI settings',
            icon: 'settings' as const,
            run: () => onNavigate({ name: 'settings', section: 'ai' } as const),
          }
    : null

  return (
    <>
      {position && (
        <div
          aria-hidden="true"
          className="tour-spotlight"
          style={{
            borderRadius: target ? window.getComputedStyle(target).borderRadius : undefined,
            height: position.rect.height,
            left: position.rect.left,
            top: position.rect.top,
            width: position.rect.width,
          }}
        />
      )}
      <aside
        aria-labelledby="getting-started-title"
        aria-modal="false"
        className={position ? 'tour-coach-mark' : 'tour-coach-mark tour-coach-fallback'}
        data-placement={position?.placement ?? 'center'}
        ref={coachMarkRef}
        role="dialog"
        style={style}
      >
        <span className="tour-arrow" aria-hidden="true" />
        <div className="tour-coach-heading">
          <p className="section-label">Quick tour · {Math.min(visibleStep, 3)} of 3</p>
        </div>
        <h2 id="getting-started-title">{displayedTitle}</h2>
        <p id={DESCRIPTION_ID}>{displayedDescription}</p>
        {displayedInstruction && <p className="tour-instruction">{displayedInstruction}</p>}

        <div className="tour-coach-actions">
          <div className="tour-step-navigation">
            <button
              aria-label="Previous step"
              className="icon-button tour-step-button"
              disabled={visibleStep === 1}
              onClick={goBack}
              title="Previous step"
              type="button"
            >
              <Icon name="arrow-left" />
            </button>
            {visibleStep < 4 && (
              <button
                aria-label="Skip this step"
                className="icon-button tour-step-button"
                onClick={skipCurrentStep}
                title="Skip this step"
                type="button"
              >
                <Icon name="chevron-right" />
              </button>
            )}
          </div>
          <div className="tour-secondary-actions">
            {fallbackAction && (
              <button className="primary-button compact-button" onClick={fallbackAction.run} type="button">
                <Icon name={fallbackAction.icon} /> {fallbackAction.label}
              </button>
            )}
            {visibleStep === 4 ? (
              <button className="primary-button compact-button" onClick={onFinish} type="button">
                <Icon name="check" /> Finish
              </button>
            ) : (
              <button className="text-button" onClick={onDismiss} type="button">Skip tour</button>
            )}
          </div>
        </div>
        <span className="sr-only" aria-live="polite">
          Tutorial step {Math.min(visibleStep, 3)} of 3. {target ? 'The next control is highlighted.' : ''}
        </span>
      </aside>
    </>
  )
}
