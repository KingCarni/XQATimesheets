"use client";

import { useActionState, useState } from "react";

import { Button } from "@/components/ui/button";
import { saveContractExpiryWarningSettings, type SettingsState } from "@/app/(app)/admin/settings/actions";

const initial: SettingsState = { error: null, ok: false };

/**
 * MHV-13 admin form. An empty value disables warnings entirely (sweep won't
 * create any notification for the tenant). 0..365 is enforced both here and
 * by a DB CHECK.
 */
export function ContractExpiryWarningForm({ warningDays }: { warningDays: number | null }) {
  const [state, formAction, pending] = useActionState(saveContractExpiryWarningSettings, initial);
  const [value, setValue] = useState<string>(warningDays === null ? "" : String(warningDays));

  const preview =
    value.trim() === ""
      ? "Warnings are disabled. Admins will not receive expiry notifications."
      : `Admins receive an in-app notification when an employee contract with an end date is ${value} day${value === "1" ? "" : "s"} or fewer from expiring.`;

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium">Warning window (days)</span>
        <input
          type="number"
          name="warningDays"
          min={0}
          max={365}
          step={1}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="e.g. 30 — leave blank to disable"
          className="h-9 w-40 rounded-md border border-border bg-background px-3 text-sm"
        />
      </label>
      <p className="text-xs text-muted-foreground">{preview}</p>
      {state.error ? <p className="text-xs text-destructive">{state.error}</p> : null}
      {state.ok ? <p className="text-xs text-success">Saved.</p> : null}
      <div>
        <Button type="submit" size="sm" disabled={pending}>Save</Button>
      </div>
    </form>
  );
}
