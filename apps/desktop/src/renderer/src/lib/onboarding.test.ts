import { describe, expect, it } from 'vitest'
import {
  ONBOARDING_STORAGE_KEY,
  completeOnboarding,
  completedStepCount,
  deferAiSetup,
  dismissOnboarding,
  firstIncompleteStep,
  freshOnboardingState,
  markAiReady,
  markProjectReady,
  markTimelineSeen,
  readOnboardingState,
  resumeOnboarding,
  writeOnboardingState,
} from './onboarding'

function memoryStorage(initial: string | null = null) {
  let value = initial
  return {
    getItem: (key: string) => (key === ONBOARDING_STORAGE_KEY ? value : null),
    setItem: (key: string, next: string) => {
      if (key === ONBOARDING_STORAGE_KEY) value = next
    },
    value: () => value,
  }
}

describe('getting-started onboarding state', () => {
  it('starts fresh only for a genuinely new workspace', () => {
    expect(readOnboardingState(memoryStorage())).toEqual(freshOnboardingState())
    expect(readOnboardingState(memoryStorage(), true)).toMatchObject({
      status: 'complete',
      completed: { project: true, timeline: true, ai: true },
    })
  })

  it('round-trips a versioned, metadata-safe state', () => {
    const storage = memoryStorage()
    const state = markProjectReady(freshOnboardingState(), 42)
    writeOnboardingState(state, storage)
    expect(readOnboardingState(storage)).toEqual(state)
    expect(storage.value()).not.toContain('path')
  })

  it('recovers from malformed or unsupported persisted data', () => {
    expect(readOnboardingState(memoryStorage('{bad'))).toEqual(freshOnboardingState())
    expect(readOnboardingState(memoryStorage('{"version":2}'))).toEqual(freshOnboardingState())
  })

  it('advances only from real completion markers', () => {
    let state = freshOnboardingState()
    expect(firstIncompleteStep(state)).toBe(1)

    state = markProjectReady(state, 7)
    expect(firstIncompleteStep(state)).toBe(2)

    state = markTimelineSeen(state)
    expect(firstIncompleteStep(state)).toBe(3)

    state = markAiReady(state)
    expect(firstIncompleteStep(state)).toBe(4)
    expect(completedStepCount(state)).toBe(3)
  })

  it('records deferral separately and preserves progress across dismiss/resume', () => {
    let state = deferAiSetup(markTimelineSeen(markProjectReady(freshOnboardingState(), 8)))
    expect(state.aiDeferred).toBe(true)
    state = dismissOnboarding(state)
    expect(resumeOnboarding(state)).toMatchObject({
      status: 'active',
      completed: { project: true, timeline: true, ai: true },
    })
    expect(completeOnboarding(state).status).toBe('complete')
  })
})
