"use client";

import { useActionState, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveBrandingStep, type SimpleState } from "@/app/(onboarding)/onboarding/actions";
import type { OrganizationSettings } from "@/lib/organizations/queries";

const initial: SimpleState = { error: null };
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function BrandingStep({
  settings,
  existingLogoUrl,
}: {
  settings: OrganizationSettings;
  existingLogoUrl: string | null;
}) {
  const [state, formAction, pending] = useActionState(saveBrandingStep, initial);
  const [primary, setPrimary] = useState(settings.primaryColor);
  const [accent, setAccent] = useState(settings.accentColor);
  const [logoPreview, setLogoPreview] = useState<string | null>(existingLogoUrl);

  // Release object URLs created for the local logo preview.
  useEffect(() => {
    return () => {
      if (logoPreview && logoPreview.startsWith("blob:")) URL.revokeObjectURL(logoPreview);
    };
  }, [logoPreview]);

  const safePrimary = HEX_RE.test(primary) ? primary : "#127fc4";
  const safeAccent = HEX_RE.test(accent) ? accent : "#07111a";

  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_20rem]">
      <form action={formAction} className="flex flex-col gap-5">
        <ColorField label="Primary colour" name="primaryColor" value={primary} onChange={setPrimary} />
        <ColorField label="Accent colour" name="accentColor" value={accent} onChange={setAccent} />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="logo">Logo (optional)</Label>
          <input
            id="logo"
            name="logo"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/svg+xml"
            className="text-sm file:mr-2 file:rounded-md file:border file:border-border file:bg-card file:px-2 file:py-1 file:text-xs"
            onChange={(e) => {
              const file = e.target.files?.[0];
              setLogoPreview(file ? URL.createObjectURL(file) : existingLogoUrl);
            }}
          />
          <p className="text-muted-foreground text-xs">PNG, JPEG, WebP, or SVG · up to 1 MB.</p>
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

      <div className="flex flex-col gap-2">
        <Label>Live preview</Label>
        <div className="overflow-hidden rounded-xl border border-border shadow-[var(--shadow-soft)]">
          <div className="flex items-center gap-3 p-4" style={{ backgroundColor: safeAccent }}>
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="Logo preview" className="h-8 w-auto object-contain" />
            ) : (
              <span className="text-sm font-semibold text-white">{settings.name}</span>
            )}
          </div>
          <div className="flex flex-col gap-3 bg-card p-4">
            <div className="h-2 w-24 rounded-full" style={{ backgroundColor: safePrimary }} />
            <div className="h-2 w-32 rounded-full bg-muted" />
            <button
              type="button"
              className="mt-1 w-fit rounded-lg px-4 py-1.5 text-sm font-medium text-white"
              style={{ backgroundColor: safePrimary }}
            >
              Primary action
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColorField({
  label,
  name,
  value,
  onChange,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={name}>{label}</Label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={HEX_RE.test(value) ? value : "#000000"}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded-lg border border-border bg-card p-1"
          aria-label={`${label} picker`}
        />
        <Input
          id={name}
          name={name}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="max-w-32 font-mono"
        />
      </div>
    </div>
  );
}
