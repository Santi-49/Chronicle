import { beforeEach, describe, expect, it } from 'vitest'
import { addDiagnosticLog, clearDiagnosticLogs, getDiagnosticLogs } from './diagnostics'

describe('renderer diagnostics log', () => {
  beforeEach(clearDiagnosticLogs)

  it('redacts common secret fields and bearer values', () => {
    addDiagnosticLog('error', [
      'request failed',
      { apiKey: 'sk-example-secret-value', nested: { authorization: 'Bearer abc.def.ghi' } },
    ], '2026-07-23T10:00:00.000Z')

    expect(getDiagnosticLogs()).toEqual([
      expect.objectContaining({
        level: 'error',
        timestamp: '2026-07-23T10:00:00.000Z',
        message: 'request failed {"apiKey":"[redacted]","nested":{"authorization":"[redacted]"}}',
      }),
    ])
  })

  it('keeps only the newest 250 entries', () => {
    for (let index = 0; index < 260; index += 1) addDiagnosticLog('debug', [index])
    const logs = getDiagnosticLogs()
    expect(logs).toHaveLength(250)
    expect(logs[0]?.message).toBe('10')
    expect(logs.at(-1)?.message).toBe('259')
  })
})

