export const ONBOARDING_STORAGE_KEY = 'chronicle-getting-started-v1'

export type OnboardingStatus = 'active' | 'dismissed' | 'complete'
export type OnboardingStep = 'project' | 'timeline' | 'ai'

export interface OnboardingState {
  version: 1
  status: OnboardingStatus
  completed: Record<OnboardingStep, boolean>
  projectId?: number
  aiDeferred: boolean
}

interface OnboardingStorage {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function freshOnboardingState(): OnboardingState {
  return {
    version: 1,
    status: 'active',
    completed: { project: false, timeline: false, ai: false },
    aiDeferred: false,
  }
}

function completedLegacyState(): OnboardingState {
  return {
    version: 1,
    status: 'complete',
    completed: { project: true, timeline: true, ai: true },
    aiDeferred: false,
  }
}

function isBooleanRecord(value: unknown): value is Record<OnboardingStep, boolean> {
  if (!value || typeof value !== 'object') return false
  const record = value as Record<string, unknown>
  return (
    typeof record.project === 'boolean' &&
    typeof record.timeline === 'boolean' &&
    typeof record.ai === 'boolean'
  )
}

/** Invalid or future data safely restarts the small tutorial. */
export function readOnboardingState(
  storage: OnboardingStorage,
  legacyWorkspaceEntered = false,
): OnboardingState {
  const raw = storage.getItem(ONBOARDING_STORAGE_KEY)
  if (raw === null) return legacyWorkspaceEntered ? completedLegacyState() : freshOnboardingState()

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>
    if (
      parsed.version !== 1 ||
      !['active', 'dismissed', 'complete'].includes(parsed.status ?? '') ||
      !isBooleanRecord(parsed.completed) ||
      typeof parsed.aiDeferred !== 'boolean' ||
      (parsed.projectId !== undefined &&
        (!Number.isInteger(parsed.projectId) || (parsed.projectId ?? 0) <= 0))
    ) {
      return freshOnboardingState()
    }
    return parsed as OnboardingState
  } catch {
    return freshOnboardingState()
  }
}

export function writeOnboardingState(
  state: OnboardingState,
  storage: OnboardingStorage,
): void {
  storage.setItem(ONBOARDING_STORAGE_KEY, JSON.stringify(state))
}

export function markProjectReady(state: OnboardingState, projectId: number): OnboardingState {
  return {
    ...state,
    completed: { ...state.completed, project: true },
    projectId,
  }
}

export function markTimelineSeen(state: OnboardingState): OnboardingState {
  return {
    ...state,
    completed: { ...state.completed, timeline: true },
  }
}

export function markAiReady(state: OnboardingState): OnboardingState {
  return {
    ...state,
    completed: { ...state.completed, ai: true },
    aiDeferred: false,
  }
}

export function deferAiSetup(state: OnboardingState): OnboardingState {
  return {
    ...state,
    completed: { ...state.completed, ai: true },
    aiDeferred: true,
  }
}

export function dismissOnboarding(state: OnboardingState): OnboardingState {
  return { ...state, status: 'dismissed' }
}

export function resumeOnboarding(state: OnboardingState): OnboardingState {
  return { ...state, status: 'active' }
}

export function completeOnboarding(state: OnboardingState): OnboardingState {
  return { ...state, status: 'complete' }
}

export function completedStepCount(state: OnboardingState): number {
  return Object.values(state.completed).filter(Boolean).length
}

export function firstIncompleteStep(state: OnboardingState): 1 | 2 | 3 | 4 {
  if (!state.completed.project) return 1
  if (!state.completed.timeline) return 2
  if (!state.completed.ai) return 3
  return 4
}
