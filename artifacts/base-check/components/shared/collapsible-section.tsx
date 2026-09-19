import { ChevronRight } from "lucide-react";

/**
 * Collapsed-by-default section built on native <details>/<summary> — keyboard
 * accessible and requires no client JS. Used for secondary analytics/detail
 * that should stay out of the way until the user opens it.
 */
export function CollapsibleSection({
  title,
  subtitle,
  defaultOpen = false,
  children,
}: {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details
      open={defaultOpen}
      className="group rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] [&_summary::-webkit-details-marker]:hidden"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl p-5 transition hover:bg-muted/40">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          {subtitle ? <p className="text-sm text-muted-foreground">{subtitle}</p> : null}
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground transition group-open:rotate-90" />
      </summary>
      <div className="border-t border-border p-5">{children}</div>
    </details>
  );
}
