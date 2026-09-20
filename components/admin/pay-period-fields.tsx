"use client";

import { useEffect, useMemo, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  MAX_MONTHLY_START_DAY,
  MAX_SPLIT_DAY,
  MIN_MONTHLY_START_DAY,
  MIN_SPLIT_DAY,
  WEEKDAY_NAMES,
  effectiveEndWeekday,
  fieldValuesToConfig,
  getNextPayPeriod,
  getPayPeriodForDate,
  getPreviousPayPeriod,
  monthlyBoundaryText,
  ordinal,
  validatePayPeriodConfig,
  type Cadence,
  type PayPeriodFieldValues,
} from "@/lib/pay-periods/calc";

export type { PayPeriodFieldValues };

export const CADENCE_OPTIONS: { value: Cadence; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Bi-weekly" },
  { value: "semimonthly", label: "Semi-monthly" },
  { value: "monthly", label: "Monthly" },
];

/**
 * Shared cadence controls + live previous/current/next preview, used by both the
 * organization settings form and the project override form. Renders form inputs
 * named cadence/startWeekday/anchor/splitDay/monthlyStartDay. Calls
 * `onValidChange` so the parent can enable/disable its submit button.
 */
export function PayPeriodFields({
  initial,
  today,
  onValidChange,
}: {
  initial: PayPeriodFieldValues;
  /** Current calendar date in the organization's timezone (yyyy-MM-dd). */
  today: string;
  onValidChange?: (valid: boolean) => void;
}) {
  const [cadence, setCadence] = useState<Cadence>(initial.cadence);
  const [startWeekday, setStartWeekday] = useState<number>(initial.startWeekday);
  const [anchor, setAnchor] = useState<string>(initial.anchor);
  const [splitDay, setSplitDay] = useState<number>(initial.splitDay);
  const [monthlyStartDay, setMonthlyStartDay] = useState<number>(initial.monthlyStartDay);

  const isWeekdayBased = cadence === "weekly" || cadence === "biweekly";

  const preview = useMemo(() => {
    const config = fieldValuesToConfig({ cadence, startWeekday, anchor, splitDay, monthlyStartDay });
    const check = validatePayPeriodConfig(config);
    if (!check.ok) return { error: check.error };
    try {
      const current = getPayPeriodForDate(config, today);
      return {
        previous: getPreviousPayPeriod(config, current),
        current,
        next: getNextPayPeriod(config, current),
      };
    } catch (e) {
      return { error: e instanceof Error ? e.message : "Cannot preview this configuration." };
    }
  }, [cadence, startWeekday, anchor, splitDay, monthlyStartDay, today]);

  const valid = !("error" in preview);
  useEffect(() => {
    onValidChange?.(valid);
  }, [valid, onValidChange]);

  const monthlyText = monthlyBoundaryText(monthlyStartDay);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="cadence">Pay-period frequency</Label>
        <Select id="cadence" name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value as Cadence)}>
          {CADENCE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </div>

      {isWeekdayBased ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="startWeekday">Starts on</Label>
            <Select
              id="startWeekday"
              name="startWeekday"
              value={String(startWeekday)}
              onChange={(e) => setStartWeekday(Number(e.target.value))}
            >
              {WEEKDAY_NAMES.map((name, i) => (
                <option key={name} value={String(i)}>
                  {name}
                </option>
              ))}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Effective end day</Label>
            <p className="flex h-9 items-center text-sm font-medium">
              {WEEKDAY_NAMES[effectiveEndWeekday(startWeekday)]}
            </p>
          </div>
        </div>
      ) : null}

      {cadence === "biweekly" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="anchor">Anchor date</Label>
          <Input id="anchor" name="anchor" type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} required />
          <p className="text-xs text-muted-foreground">
            The start of any one two-week cycle. Must fall on a {WEEKDAY_NAMES[startWeekday]}.
          </p>
        </div>
      ) : null}

      {cadence === "semimonthly" ? (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="splitDay">Split day</Label>
          <Input
            id="splitDay"
            name="splitDay"
            type="number"
            min={MIN_SPLIT_DAY}
            max={MAX_SPLIT_DAY}
            value={String(splitDay)}
            onChange={(e) => setSplitDay(Number(e.target.value))}
            required
          />
          <p className="text-xs text-muted-foreground">
            First period runs the 1st through this day; the second runs the next day through month end.
          </p>
        </div>
      ) : null}

      {cadence === "monthly" ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="monthlyStartDay">Monthly period starts on</Label>
            <Select
              id="monthlyStartDay"
              name="monthlyStartDay"
              value={String(monthlyStartDay)}
              onChange={(e) => setMonthlyStartDay(Number(e.target.value))}
            >
              {Array.from({ length: MAX_MONTHLY_START_DAY - MIN_MONTHLY_START_DAY + 1 }, (_, i) => {
                const day = MIN_MONTHLY_START_DAY + i;
                return (
                  <option key={day} value={String(day)}>
                    {ordinal(day)}
                  </option>
                );
              })}
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Effective boundary</Label>
            <p className="flex h-9 items-center text-sm font-medium">
              Starts {monthlyText.starts} · ends {monthlyText.ends}
            </p>
          </div>
        </div>
      ) : null}

      <div className="rounded-md border border-border p-4">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Preview (organization time)
        </p>
        {"error" in preview ? (
          <p className="text-destructive text-sm" role="alert">
            {preview.error}
          </p>
        ) : (
          <dl className="grid gap-1.5 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Previous</dt>
              <dd className="font-medium">{preview.previous.label}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Current</dt>
              <dd className="font-semibold">{preview.current.label}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Next</dt>
              <dd className="font-medium">{preview.next.label}</dd>
            </div>
          </dl>
        )}
      </div>
    </div>
  );
}
