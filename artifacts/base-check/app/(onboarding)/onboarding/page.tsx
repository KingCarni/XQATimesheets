import { redirect } from "next/navigation";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireOrganizationAdmin } from "@/lib/tenant/context";
import { getOrganizationSettings } from "@/lib/organizations/queries";
import { getAdminProjectListData } from "@/lib/admin/projects";
import { listPendingInvitations } from "@/lib/invitations/queries";
import {
  STEP_LABELS,
  normalizeStep,
  stepIndex,
  type OnboardingStep,
} from "@/lib/onboarding/steps";
import { OnboardingStepper } from "@/components/onboarding/onboarding-stepper";
import { CompanyStep } from "@/components/onboarding/company-step";
import { BrandingStep } from "@/components/onboarding/branding-step";
import { ProjectsStep } from "@/components/onboarding/projects-step";
import { TeamStep } from "@/components/onboarding/team-step";
import { finishOnboardingAction } from "./actions";

export const dynamic = "force-dynamic";

type SearchParams = Promise<{ step?: string }>;

const STEP_INTRO: Record<OnboardingStep, string> = {
  company: "Tell us about your company.",
  branding: "Make the workspace yours.",
  projects: "Set up the projects your team tracks.",
  team: "Bring your team on board.",
  finish: "You're all set.",
};

export default async function OnboardingPage({ searchParams }: { searchParams: SearchParams }) {
  const { organization } = await requireOrganizationAdmin();
  if (organization.onboardingCompletedAt) redirect("/my-timesheet");

  // The persisted step is the furthest the admin has reached. A `?step=` value
  // may revisit an earlier, already-reached step but can never jump ahead.
  const furthest = normalizeStep(organization.onboardingStep);
  const { step: requested } = await searchParams;
  const requestedStep = requested ? normalizeStep(requested) : furthest;
  const current: OnboardingStep =
    stepIndex(requestedStep) <= stepIndex(furthest) ? requestedStep : furthest;

  return (
    <div className="flex flex-col gap-6">
      <div className="text-white">
        <p className="text-sm font-medium tracking-wide text-white/60">Welcome to HourOps</p>
        <h1 className="text-2xl font-semibold">Set up {organization.name}</h1>
      </div>

      <Card className="bg-white/95">
        <CardHeader className="gap-4">
          <OnboardingStepper current={current} furthest={furthest} />
          <CardTitle className="text-xl">
            {STEP_LABELS[current]} — <span className="text-muted-foreground font-normal">{STEP_INTRO[current]}</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <StepBody current={current} organizationId={organization.id} />
        </CardContent>
      </Card>
    </div>
  );
}

async function StepBody({ current, organizationId }: { current: OnboardingStep; organizationId: string }) {
  if (current === "company") {
    const settings = await getOrganizationSettings(organizationId);
    return <CompanyStep settings={settings} />;
  }
  if (current === "branding") {
    const settings = await getOrganizationSettings(organizationId);
    return (
      <BrandingStep
        settings={settings}
        existingLogoUrl={settings.hasLogo ? "/api/org-logo" : null}
      />
    );
  }
  if (current === "projects") {
    const projects = await getAdminProjectListData(organizationId);
    return <ProjectsStep projects={projects} />;
  }
  if (current === "team") {
    const pending = await listPendingInvitations(organizationId);
    return <TeamStep pending={pending} />;
  }

  // finish
  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">
        Your workspace is ready. You can fine-tune projects, branding, and your team anytime from the
        admin area.
      </p>
      <form action={finishOnboardingAction} className="flex justify-end">
        <Button type="submit">Go to workspace</Button>
      </form>
    </div>
  );
}
