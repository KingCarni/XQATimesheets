import { requireUser } from "@/lib/auth/session";
import { getWeekData } from "@/lib/timesheets/queries";
import { getWeekRange, todayStr } from "@/lib/timesheets/week";
import { isPeriodEditable } from "@/types/domain";
import { WeeklyTimesheet } from "@/components/timesheets/weekly-timesheet";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function MyTimesheetPage({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const user = await requireUser();
  const { week: weekParam } = await searchParams;

  if (!user.profile) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>No employee profile</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Your account isn&apos;t linked to an employee profile yet, so there&apos;s nowhere to
            log time. Ask an admin to create one for you.
          </CardContent>
        </Card>
      </div>
    );
  }

  const seed = weekParam && DATE_RE.test(weekParam) ? weekParam : todayStr();
  const weekStart = getWeekRange(seed).start;

  const data = await getWeekData(user.profile, weekStart);
  const editable = data.period ? isPeriodEditable(data.period.status) : true;

  return (
    <WeeklyTimesheet
      key={weekStart}
      weekStart={weekStart}
      week={data.week}
      defaultDailyHours={Number(user.profile.default_daily_hours)}
      periodStatus={data.period?.status ?? null}
      editable={editable}
      initialEntries={data.entries}
      catalogs={{
        projects: data.projects,
        platforms: data.platforms,
        activityTypes: data.activityTypes,
      }}
      templates={data.templates}
    />
  );
}
