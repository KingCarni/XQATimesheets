"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { DEFAULT_MONTHLY_START_DAY, DEFAULT_SPLIT_DAY } from "@/lib/pay-periods/calc";
import type { PayPeriodSettings } from "@/lib/organizations/pay-period-settings";
import { savePayPeriodSettings, type SettingsState } from "@/app/(app)/admin/settings/actions";
import { PayPeriodFields } from "./pay-period-fields";

const initial: SettingsState = { error: null, ok: false };

export function PayPeriodSettingsForm({
  settings,
  today,
}: {
  settings: PayPeriodSettings;
  /** Current calendar date in the organization's timezone (yyyy-MM-dd). */
  today: string;
}) {
  const [state, formAction, pending] = useActionState(savePayPeriodSettings, initial);
  const [valid, setValid] = useState(true);

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        Employees continue submitting <strong>weekly</strong> timesheets. Pay periods control how hours are
        grouped for payroll, reports, and reminders — they don&rsquo;t change how employees enter or submit time.
      </div>

      <PayPeriodFields
        today={today}
        onValidChange={setValid}
        initial={{
          cadence: settings.cadence ?? "weekly",
          startWeekday: settings.startWeekday ?? 1,
          anchor: settings.anchor ?? "",
          splitDay: settings.splitDay ?? DEFAULT_SPLIT_DAY,
          monthlyStartDay: settings.monthlyStartDay ?? DEFAULT_MONTHLY_START_DAY,
        }}
      />

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.ok ? (
        <p className="text-sm text-emerald-600" role="status">
          Pay-period settings saved.
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !valid}>
          {pending ? "Saving…" : "Save pay-period settings"}
        </Button>
      </div>
    </form>
  );
}
