import { describe, expect, it } from 'vitest'
import { WIZARD_STEPS, isLastStep, clampStep, canAdvance } from '../src/renderer/src/onboarding-wizard'

describe('WIZARD_STEPS', () => {
  it('runs welcome → folders → reviewers → slack', () => {
    expect(WIZARD_STEPS).toEqual(['welcome', 'folders', 'reviewers', 'slack'])
  })
})

describe('isLastStep', () => {
  it('is true only on the final step index', () => {
    expect(isLastStep(0)).toBe(false)
    expect(isLastStep(2)).toBe(false)
    expect(isLastStep(3)).toBe(true)
  })
})

describe('clampStep', () => {
  it('keeps the index within the step range', () => {
    expect(clampStep(-1)).toBe(0)
    expect(clampStep(0)).toBe(0)
    expect(clampStep(3)).toBe(3)
    expect(clampStep(9)).toBe(3)
  })
})

describe('canAdvance', () => {
  it('blocks leaving the folders step until at least one folder is added', () => {
    expect(canAdvance('folders', { folderCount: 0 })).toBe(false)
    expect(canAdvance('folders', { folderCount: 1 })).toBe(true)
  })

  it('never blocks the other steps', () => {
    expect(canAdvance('welcome', { folderCount: 0 })).toBe(true)
    expect(canAdvance('reviewers', { folderCount: 0 })).toBe(true)
    expect(canAdvance('slack', { folderCount: 0 })).toBe(true)
  })
})
