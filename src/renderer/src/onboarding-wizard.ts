// Pure navigation logic for the first-launch setup wizard. Keeping it out of
// the component makes the step order and the "can I move forward yet?" rules
// unit-testable.

export type WizardStep = 'welcome' | 'folders' | 'reviewers' | 'slack'

export const WIZARD_STEPS: WizardStep[] = ['welcome', 'folders', 'reviewers', 'slack']

export function isLastStep(index: number): boolean {
  return index === WIZARD_STEPS.length - 1
}

export function clampStep(index: number): number {
  return Math.max(0, Math.min(index, WIZARD_STEPS.length - 1))
}

// Whether the user may advance past `step` given the current form state.
// Only the folders step gates: there is nothing to scan without a folder.
export function canAdvance(step: WizardStep, state: { folderCount: number }): boolean {
  if (step === 'folders') return state.folderCount > 0
  return true
}
