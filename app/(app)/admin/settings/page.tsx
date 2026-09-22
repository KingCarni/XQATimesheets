import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrganizationAdmin } from "@/lib/tenant/context";
import { getPayPeriodSettings } from "@/lib/organizations/pay-period-settings";
import { getOrgPayPeriodContext, orgToday } from "@/lib/pay-periods/queries";
import { PayPeriodSettingsForm } from "@/components/admin/pay-period-settings-form";
import { prisma } from "@/lib/prisma";
import { SubmissionCutoffForm } from "@/components/admin/submission-cutoff-form";
import { ContractExpiryWarningForm } from "@/components/admin/contract-expiry-form";

export default async function PayPeriodSettingsPage() {
  const { organization } = await requireOrganizationAdmin();
  const settings = await getPayPeriodSettings(organization.id);
  const ctx = await getOrgPayPeriodContext(organization.id);
  const today = orgToday(ctx);

  const org = await prisma.organizations.findUnique({
    where: { id: organization.id },
    select: {
      timezone: true,
      submission_cutoff_enabled: true,
      submission_cutoff_offset_days: true,
      submission_cutoff_time: true,
      contract_expiry_warning_days: true,
    },
  });

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Pay periods</h1>
        <p className="text-muted-foreground text-sm">
          Configure how your organization&rsquo;s hours are grouped for payroll and reporting.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Payroll period</CardTitle>
          <CardDescription>
            Timezone: {settings.timezone}
            {settings.isFallback ? " · Currently using the default weekly grouping." : null}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <PayPeriodSettingsForm settings={settings} today={today} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submission cutoff</CardTitle>
          <CardDescription>
            When enabled, employees see a due-by badge on each open project pay period
            and receive due-soon / overdue reminders. Cutoffs are computed per period end,
            in your organization&rsquo;s timezone ({org?.timezone ?? "—"}). Late submissions
            remain possible.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SubmissionCutoffForm
            enabled={org?.submission_cutoff_enabled ?? false}
            offsetDays={org?.submission_cutoff_offset_days ?? null}
            timeLocal={org?.submission_cutoff_time ?? null}
            timezone={org?.timezone ?? "America/Vancouver"}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Contract expiry warnings</CardTitle>
          <CardDescription>
            Send admin notifications when an employee contract with an end date is
            within this many days of expiring. Leave blank to disable warnings for
            the whole organization.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ContractExpiryWarningForm warningDays={org?.contract_expiry_warning_days ?? null} />
        </CardContent>
      </Card>
    </div>
  );
}
