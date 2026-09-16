"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, ChevronRight, Copy, Mail, Trash2, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import {
  createInviteAction,
  revokeInviteAction,
  type InviteState,
} from "@/app/(app)/admin/invite-actions";
import type { PendingInvitation } from "@/lib/invitations/queries";

const initial: InviteState = null;

export function InvitePanel({ pending }: { pending: PendingInvitation[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [state, formAction, submitting] = useActionState(createInviteAction, initial);

  return (
    <section className="rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl p-5 text-left transition hover:bg-muted/40"
      >
        <span className="flex items-center gap-2 text-lg font-semibold">
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Mail className="h-4 w-4" />
          Invite by email
        </span>
        <span className="text-xs text-muted-foreground">
          {pending.length > 0 ? `${pending.length} pending` : "Send a secure join link"}
        </span>
      </button>

      {open ? (
        <div className="grid gap-4 border-t border-border p-5">
          <form
            action={async (fd) => {
              await formAction(fd);
              router.refresh();
            }}
            className="flex flex-wrap items-end gap-3"
          >
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-invite-email">Email</Label>
              <Input
                id="admin-invite-email"
                name="email"
                type="email"
                placeholder="teammate@company.com"
                required
                className="w-64"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="admin-invite-role">Role</Label>
              <Select id="admin-invite-role" name="role" defaultValue="employee" className="w-36">
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
            <ul className="divide-y divide-border rounded-xl border border-border">
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
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function InviteLink({ email, link }: { email: string; link: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex flex-col gap-2 rounded-xl border border-success/30 bg-success/10 p-4">
      <p className="text-success text-sm font-semibold">Invitation created for {email}</p>
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
      <p className="text-muted-foreground text-xs">Expires in 14 days.</p>
    </div>
  );
}
