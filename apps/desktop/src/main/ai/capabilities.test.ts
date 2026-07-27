/**
 * The shared answer to "can the service that is actually running annotate this
 * format?" — the difference between a version honestly labelled 'deferred' and
 * one that shows "pending" forever.
 */
import { describe, expect, it, vi } from 'vitest'
import { formatById } from '../../shared/formats'
import { createAnnotationCapabilities } from './capabilities'

function clientReporting(formats: string[] | undefined) {
  return {
    capabilities: vi.fn().mockResolvedValue({
      service: 'chronicle-ai',
      version: '0.1.0',
      ...(formats ? { annotate: { formats } } : {}),
    }),
  }
}

describe('annotation capabilities', () => {
  it('asks the service once and reuses the answer', async () => {
    const client = clientReporting(['png', 'jpg'])
    const capabilities = createAnnotationCapabilities(client)

    expect(await capabilities.formats()).toEqual(['png', 'jpg'])
    expect(await capabilities.formats()).toEqual(['png', 'jpg'])
    expect(client.capabilities).toHaveBeenCalledTimes(1)
  })

  it('coalesces concurrent lookups into one request', async () => {
    const client = clientReporting(['png'])
    const capabilities = createAnnotationCapabilities(client)

    await Promise.all([capabilities.formats(), capabilities.formats(), capabilities.formats()])

    expect(client.capabilities).toHaveBeenCalledTimes(1)
  })

  it('defers a format the running service leaves out', async () => {
    const capabilities = createAnnotationCapabilities(clientReporting(['png', 'jpg']))
    await capabilities.formats()

    expect(capabilities.isDeferred(formatById('obj'))).toBe(true)
    expect(capabilities.isDeferred(formatById('blend'))).toBe(true)
    expect(capabilities.isDeferred(formatById('png'))).toBe(false)
  })

  it('defers nothing once the service reports the full POST-02 set', async () => {
    const capabilities = createAnnotationCapabilities(
      clientReporting(['png', 'jpg', 'jpeg', 'psd', 'psb', 'svg', 'blend', 'obj', 'step']),
    )
    await capabilities.formats()

    for (const id of ['png', 'jpg', 'svg', 'psd', 'psb', 'obj', 'step', 'blend'] as const) {
      expect(capabilities.isDeferred(formatById(id)), id).toBe(false)
    }
  })

  it('fails open before the service has answered', async () => {
    const client = { capabilities: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }
    const capabilities = createAnnotationCapabilities(client)

    // Nothing is called deferred on a guess: an unreachable service means the
    // request itself decides, and the job simply waits in the queue.
    expect(capabilities.isDeferred(formatById('obj'))).toBe(false)
    expect(await capabilities.formats()).toBeNull()
    expect(capabilities.isDeferred(formatById('obj'))).toBe(false)
  })

  it('retries a failed lookup only after the backoff window', async () => {
    const client = { capabilities: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) }
    let now = 1_000
    const capabilities = createAnnotationCapabilities(client, () => now)

    expect(await capabilities.formats()).toBeNull()
    expect(await capabilities.formats()).toBeNull()
    expect(client.capabilities).toHaveBeenCalledTimes(1)

    now += 30_001
    client.capabilities.mockResolvedValue({
      service: 'chronicle-ai',
      version: '0.1.0',
      annotate: { formats: ['png'] },
    })
    expect(await capabilities.formats()).toEqual(['png'])
    expect(client.capabilities).toHaveBeenCalledTimes(2)
  })

  it('treats a service that reports no annotate list as unknown, not empty', async () => {
    const capabilities = createAnnotationCapabilities(clientReporting(undefined))
    expect(await capabilities.formats()).toBeNull()
    expect(capabilities.isDeferred(formatById('png'))).toBe(false)
  })

  it('never defers an unsupported extension, which has no job to defer', () => {
    const capabilities = createAnnotationCapabilities(clientReporting(['png']))
    expect(capabilities.isDeferred(null)).toBe(false)
  })
})
