import { describe, expect, it } from 'vitest'
import { releaseAdoption } from './releaseAdoption'

describe('releaseAdoption', () => {
  it('compares the highest observed semantic version with older installations', () => {
    expect(releaseAdoption([
      { label: '0.9.0', count: 8 },
      { label: '0.10.0', count: 12 },
      { label: '0.8.2', count: 4 },
    ])).toEqual({
      latestVersion: '0.10.0',
      latestCount: 12,
      outdatedCount: 12,
      total: 24,
    })
  })

  it('keeps malformed legacy labels in the outdated total', () => {
    expect(releaseAdoption([
      { label: 'development', count: 2 },
      { label: 'v1.2.3', count: 5 },
    ])).toEqual({
      latestVersion: 'v1.2.3',
      latestCount: 5,
      outdatedCount: 2,
      total: 7,
    })
  })

  it('uses the shipped version even before any installation reports it', () => {
    expect(releaseAdoption([
      { label: '0.9.0', count: 10 },
      { label: '0.8.0', count: 3 },
    ], '0.10.0')).toEqual({
      latestVersion: '0.10.0',
      latestCount: 0,
      outdatedCount: 13,
      total: 13,
    })
  })

  it('returns an empty comparison when no versions were reported', () => {
    expect(releaseAdoption([])).toEqual({
      latestVersion: null,
      latestCount: 0,
      outdatedCount: 0,
      total: 0,
    })
  })
})
