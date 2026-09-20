import { requireOrganizationContext } from "@/lib/tenant/context";
import { getMyTimesheetData } from "@/lib/timesheets/operational-view";
import { OperationalTimesheet } from "@/components/timesheets/operational-timesheet";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default async function MyTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { user, organization } = await requireOrganizationContext();
  const params = await searchParams;

  if (!user.profile) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>No employee profile</CardTitle>
          </CardHeader>

          <CardContent className="text-muted-foreground text-sm">
            Your account isn&apos;t linked to an employee profile yet, so
            there&apos;s nowhere to log time. Ask an admin to create one for
            you.
          </CardContent>
        </Card>
      </div>
    );
  }

  const data = await getMyTimesheetData(user.profile, organization.id, params);

  return (
    <OperationalTimesheet
      today={data.today}
      projectSections={data.projectSections}
      general={data.general}
      catalogs={data.catalogs}
      templates={data.templates}
    />
  );
}
