"use client";

import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { saveCompanyStep, type SimpleState } from "@/app/(onboarding)/onboarding/actions";
import type { OrganizationSettings } from "@/lib/organizations/queries";

const initial: SimpleState = { error: null };

// A short, commonly-useful timezone list; free-form value is preserved if it
// isn't one of these (the current value is always rendered as an option).
const TIMEZONES = [
  "America/Vancouver",
  "America/Edmonton",
  "America/Toronto",
  "America/New_York",
  "America/Chicago",
  "America/Los_Angeles",
  "UTC",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Kolkata",
  "Australia/Sydney",
];

export function CompanyStep({ settings }: { settings: OrganizationSettings }) {
  const [state, formAction, pending] = useActionState(saveCompanyStep, initial);
  const zones = TIMEZONES.includes(settings.timezone) ? TIMEZONES : [settings.timezone, ...TIMEZONES];

  return (
    <form action={formAction} className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="name">Company name</Label>
        <Input id="name" name="name" defaultValue={settings.name} required />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="timezone">Default timezone</Label>
          <Select id="timezone" name="timezone" defaultValue={settings.timezone}>
            {zones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="weekStart">Week starts on</Label>
          <Select id="weekStart" name="weekStart" defaultValue={String(settings.weekStart)}>
            <option value="1">Monday</option>
            <option value="0">Sunday</option>
          </Select>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="payrollPeriod">Payroll period (optional)</Label>
        <Select id="payrollPeriod" name="payrollPeriod" defaultValue={settings.payrollPeriod ?? ""}>
          <option value="">Not set</option>
          <option value="weekly">Weekly</option>
          <option value="biweekly">Bi-weekly</option>
        </Select>
      </div>

      {state.error ? (
        <p className="text-destructive text-sm" role="alert">
          {state.error}
        </p>
      ) : null}

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Continue"}
        </Button>
      </div>
    </form>
  );
}
