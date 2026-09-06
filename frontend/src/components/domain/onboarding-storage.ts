/**
 * Shared onboarding / model-wizard persistence (#29).
 *
 * Single completion key for the unified first-run wizard, one-time
 * migration from the legacy ``lexflow.onboarded`` flag, and session-scoped
 * Ollama pull state so closing the wizard mid-download restores the UI.
 */

import type { TierKey } from '@/lib/model-tiering';

export const WIZARD_COMPLETED_STORAGE_KEY = 'lexflow.wizard-completed';

const LEGACY_ONBOARDED_KEY = 'lexflow.onboarded';

export const WIZARD_PULL_STORAGE_KEY = 'lexflow.wizard-pull';

export type WizardPullPhase = 'pulling' | 'done' | 'error';

export interface WizardPullState {
  tierKey: TierKey;
  model: string;
  phase: WizardPullPhase;
  startedAt: string;
  lastStatus?: string;
}

/** One-time migration: legacy onboarding page → unified wizard key. */
function migrateLegacyOnboarded(): void {
  try {
    if (
      localStorage.getItem(LEGACY_ONBOARDED_KEY) === '1' &&
      localStorage.getItem(WIZARD_COMPLETED_STORAGE_KEY) !== 'true'
    ) {
      localStorage.setItem(WIZARD_COMPLETED_STORAGE_KEY, 'true');
      localStorage.removeItem(LEGACY_ONBOARDED_KEY);
    }
  } catch {
    /* private mode — ignore. */
  }
}

/** True when the user has finished (or skipped via "Lo haré más tarde") the wizard. */
export function readWizardCompleted(): boolean {
  migrateLegacyOnboarded();
  try {
    return localStorage.getItem(WIZARD_COMPLETED_STORAGE_KEY) === 'true';
  } catch {
    return true;
  }
}

/** Persist wizard completion and drop the legacy onboarding flag. */
export function markWizardCompleted(): void {
  try {
    localStorage.setItem(WIZARD_COMPLETED_STORAGE_KEY, 'true');
    localStorage.removeItem(LEGACY_ONBOARDED_KEY);
  } catch {
    /* private mode — ignore. */
  }
}

export function readWizardPull(): WizardPullState | null {
  try {
    const raw = sessionStorage.getItem(WIZARD_PULL_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WizardPullState;
  } catch {
    return null;
  }
}

export function writeWizardPull(state: WizardPullState): void {
  try {
    sessionStorage.setItem(WIZARD_PULL_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* ignore */
  }
}

export function clearWizardPull(): void {
  try {
    sessionStorage.removeItem(WIZARD_PULL_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
