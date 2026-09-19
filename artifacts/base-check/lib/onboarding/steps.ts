/**
 * The ordered first-time setup (FTUE) steps for a new organization. The current
 * step is persisted server-side on `organizations.onboarding_step`, so a partly
 * finished setup resumes where the admin left off — the client can never skip a
 * step by editing the URL, because every onboarding action re-reads and advances
 * the persisted value.
 */
export const ONBOARDING_STEPS = ["company", "branding", "projects", "team", "finish"] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export function isOnboardingStep(value: string): value is OnboardingStep {
  return (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** Clamp an arbitrary stored/query value to a valid step (defaults to the first). */
export function normalizeStep(value: string | null | undefined): OnboardingStep {
  return value && isOnboardingStep(value) ? value : ONBOARDING_STEPS[0];
}

export function stepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/** The step after `step`, or null if `step` is the last one. */
export function nextStep(step: OnboardingStep): OnboardingStep | null {
  const i = stepIndex(step);
  return i >= 0 && i < ONBOARDING_STEPS.length - 1 ? ONBOARDING_STEPS[i + 1] : null;
}

export function previousStep(step: OnboardingStep): OnboardingStep | null {
  const i = stepIndex(step);
  return i > 0 ? ONBOARDING_STEPS[i - 1] : null;
}

export const STEP_LABELS: Record<OnboardingStep, string> = {
  company: "Company",
  branding: "Branding",
  projects: "Projects",
  team: "Team",
  finish: "Finish",
};
