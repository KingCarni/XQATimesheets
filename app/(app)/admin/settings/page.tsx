import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { requireOrganizationAdmin } from "@/lib/tenant/context";
import { getPayPeriodSettings } from "@/lib/organizations/pay-period-settings";
import { getOrgPayPeriodContext, orgToday } from "@/lib/pay-periods/queries";
import { PayPeriodSettingsForm } from "@/components/admin/pay-period-settings-form";

export default async function PayPeriodSettingsPage() {
  const { organization } = await requireOrganizationAdmin();
  const settings = await getPayPeriodSettings(organization.id);
  const ctx = await getOrgPayPeriodContext(organization.id);
  const today = orgToday(ctx);

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
    </div>
  );
}
