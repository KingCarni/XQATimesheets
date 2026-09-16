"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Copy, Check, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { EmployeeImport } from "@/components/admin/employee-import";
import {
  continueToFinishStep,
  inviteMemberAction,
  revokeInviteAction,
  type InviteState,
} from "@/app/(onboarding)/onboarding/actions";
import type { PendingInvitation } from "@/lib/invitations/queries";

const initial: InviteState = null;

export function TeamStep({ pending }: { pending: PendingInvitation[] }) {
  const router = useRouter();
  const [state, formAction, submitting] = useActionState(inviteMemberAction, initial);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-muted-foreground text-sm">
        Invite teammates by email, or bulk-import employees from a spreadsheet. Invitations create a
        secure link the person uses to set their own password.
      </p>

      <form
        action={async (fd) => {
          await formAction(fd);
          router.refresh();
        }}
        className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-4"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-email">Email</Label>
          <Input id="invite-email" name="email" type="email" placeholder="teammate@company.com" required className="w-64" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="invite-role">Role</Label>
          <Select id="invite-role" name="role" defaultValue="employee" className="w-36">
            <option value="employee">Employee</option>
            <option value="manager">Manager</option>
            <option value="admin">Admin</option>
          </Select>
        </div>
        <Button type="submit" disabled={submitting}>
          <UserPlus className="h-4 w-4" />
          {submitting ? "Inviting…" : "Send invite"}
        </Button>
        {state && !state.ok ? <span className="text-destructive text-sm">{state.error}</span> : null}
      </form>

      {state && state.ok ? <InviteLink email={state.email} link={state.link} /> : null}

      {pending.length > 0 ? (
        <div className="rounded-xl border border-border">
          <div className="border-b border-border px-4 py-2 text-xs font-semibold uppercase text-muted-foreground">
            Pending invitations ({pending.length})
          </div>
          <ul className="divide-y divide-border">
            {pending.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0">
                  <span className="font-medium">{inv.email}</span>{" "}
                  <span className="text-muted-foreground capitalize">· {inv.role}</span>
                  {inv.isExpired ? <span className="text-destructive"> · expired</span> : null}
                </span>
                <form action={async (fd) => { await revokeInviteAction(fd); router.refresh(); }}>
                  <input type="hidden" name="id" value={inv.id} />
                  <Button type="submit" variant="ghost" size="sm" aria-label={`Revoke invite for ${inv.email}`}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </form>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <EmployeeImport />

      <div className="flex items-center justify-between gap-3">
        <p className="text-muted-foreground text-xs">You can invite more people anytime from the admin area.</p>
        <form action={continueToFinishStep}>
          <Button type="submit">Continue</Button>
        </form>
      </div>
    </div>
  );
}

function InviteLink({ email, link }: { email: string; link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-success/30 bg-success/10 p-4">
      <p className="text-success text-sm font-semibold">Invitation created for {email}</p>
      <p className="text-muted-foreground text-xs">
        Share this link with them — it lets them set a password and join. It expires in 14 days.
      </p>
      <div className="flex items-center gap-2">
        <Input value={link} readOnly className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(link);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            } catch {
              /* clipboard unavailable — the field is selectable as a fallback */
            }
          }}
        >
          {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
    </div>
  );
}
