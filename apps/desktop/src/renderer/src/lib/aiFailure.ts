import type { AiFailure } from '../../../shared/ipc'

export interface AiFailureFeedback {
  title: string
  explanation: string
  action: string
}

/** Converts safe service error codes into concise, actionable product copy. */
export function aiFailureFeedback(failure: AiFailure | null): AiFailureFeedback {
  if (failure?.code === 'provider_quota_exceeded' || failure?.status === 429) {
    return {
      title: 'AI provider quota reached',
      explanation: failure.message,
      action: 'Check the provider project’s quota or billing, wait for it to reset, then retry.',
    }
  }
  if (failure?.code === 'provider_auth_error' || failure?.status === 401 || failure?.status === 403) {
    return {
      title: 'AI provider credentials rejected',
      explanation: failure.message,
      action: 'Replace or verify the provider API key in Settings → AI summaries, then retry.',
    }
  }
  if (failure?.code === 'provider_request_too_large' || failure?.status === 413) {
    return {
      title: 'Image too large for the AI provider',
      explanation: failure.message,
      action: 'Use a smaller image or select a provider with a larger request limit.',
    }
  }
  if (failure?.code === 'invalid_model_output') {
    return {
      title: 'The provider returned an invalid summary',
      explanation: failure.message,
      action: 'Retry once, or choose another chat model in Settings if it happens again.',
    }
  }
  if (failure?.code === 'provider_timeout' || failure?.status === 504) {
    return {
      title: 'AI provider timed out',
      explanation: failure.message,
      action: 'Check your connection and provider status, then retry later.',
    }
  }
  if (failure?.code === 'provider_unavailable' || failure?.status === 503) {
    return {
      title: 'AI provider integration unavailable',
      explanation: failure.message,
      action: 'Choose an installed provider in Settings → AI summaries, then retry.',
    }
  }
  return {
    title: 'The AI provider returned an unspecified error',
    explanation: failure?.status === 502
      ? 'Chronicle reached the provider, but the older provider response did not identify whether the model, account quota, credentials, or request caused the rejection.'
      : failure?.message ?? 'The provider did not return a usable summary.',
    action: 'Open Settings → AI summaries and run Test summary connection. Retry this job only if that test passes.',
  }
}
