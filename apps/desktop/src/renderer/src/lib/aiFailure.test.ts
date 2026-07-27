import { describe, expect, it } from 'vitest'
import { aiFailureFeedback } from './aiFailure'

describe('aiFailureFeedback', () => {
  it('gives quota failures billing guidance', () => {
    expect(aiFailureFeedback({
      message: 'Quota reached.',
      code: 'provider_quota_exceeded',
      status: 429,
    })).toEqual({
      title: 'AI provider quota reached',
      explanation: 'Quota reached.',
      action: 'Check the provider project’s quota or billing, wait for it to reset, then retry.',
    })
  })

  it('gives credential failures a Settings recovery path', () => {
    expect(aiFailureFeedback({
      message: 'Credential rejected.',
      code: 'provider_auth_error',
      status: 401,
    }).action).toContain('Settings → AI summaries')
  })

  it('keeps legacy failures actionable', () => {
    expect(aiFailureFeedback(null)).toMatchObject({
      title: 'The AI provider returned an unspecified error',
    })
  })

  it('does not blame the provider for a file Chronicle could not read', () => {
    const feedback = aiFailureFeedback({
      message: 'The BLEND file is corrupt or unsupported.',
      code: 'extraction_error',
      status: 400,
    })
    expect(feedback.title).toBe('Chronicle could not read this file')
    expect(feedback.explanation).toBe('The BLEND file is corrupt or unsupported.')
    // The provider was never contacted, so testing the AI connection is not the fix.
    expect(feedback.action).not.toContain('Test summary connection')
    expect(feedback.action).toContain('restored')
  })

  it('explains a format the running service cannot summarize', () => {
    const feedback = aiFailureFeedback({
      message: "The AI service cannot annotate 'blend' files yet.",
      code: 'unsupported_format',
      status: 400,
    })
    expect(feedback.title).toBe('This file type has no AI change summary')
    expect(feedback.action).toContain('Update Chronicle')
  })

  it('surfaces the raw provider error for a generic 502', () => {
    const feedback = aiFailureFeedback({
      message: 'The AI provider rejected the request. Provider error: 401 UNAUTHENTICATED.',
      code: 'provider_error',
      status: 502,
    })
    expect(feedback.explanation).toBe(
      'The AI provider rejected the request. Provider error: 401 UNAUTHENTICATED.',
    )
    expect(feedback.action).toContain('Test summary connection')
  })
})
