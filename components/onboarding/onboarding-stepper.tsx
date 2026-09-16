import { Check } from "lucide-react";

import { cn } from "@/lib/utils";
import { ONBOARDING_STEPS, STEP_LABELS, stepIndex, type OnboardingStep } from "@/lib/onboarding/steps";

/** Horizontal progress indicator for the onboarding flow. */
export function OnboardingStepper({
  current,
  furthest,
}: {
  current: OnboardingStep;
  furthest: OnboardingStep;
}) {
  const currentIdx = stepIndex(current);
  const furthestIdx = stepIndex(furthest);

  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-3">
      {ONBOARDING_STEPS.map((step, i) => {
        const done = i < furthestIdx;
        const active = i === currentIdx;
        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs font-semibold",
                active
                  ? "border-transparent bg-gradient-to-r from-xqa-blue to-xqa-blue-2 text-white"
                  : done
                    ? "border-transparent bg-success/15 text-success"
                    : "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : i + 1}
            </span>
            <span
              className={cn(
                "text-sm",
                active ? "font-semibold text-foreground" : "text-muted-foreground",
              )}
            >
              {STEP_LABELS[step]}
            </span>
            {i < ONBOARDING_STEPS.length - 1 ? (
              <span className="mx-1 hidden h-px w-8 bg-border sm:block" />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}
