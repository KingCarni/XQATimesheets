import { cn } from "@/lib/utils";

/**
 * Shared status pill used across Approvals, Team, My Timesheet, and Profile so
 * every status reads the same way. Colors map onto the brand token palette.
 */
const STATUS_STYLES: Record<string, string> = {
  // timesheet
  open: "bg-xqa-sky-soft text-xqa-blue",
  submitted: "bg-warning/15 text-warning",
  approved: "bg-success/15 text-success",
  rejected: "bg-destructive/15 text-destructive",
  locked: "bg-muted text-muted-foreground",
  // pto / hardware
  requested: "bg-warning/15 text-warning",
  cancelled: "bg-muted text-muted-foreground",
  fulfilled: "bg-success/15 text-success",
  // contract
  active: "bg-success/15 text-success",
  upcoming: "bg-xqa-sky-soft text-xqa-blue",
  expired: "bg-muted text-muted-foreground",
  terminated: "bg-destructive/15 text-destructive",
  // equipment
  assigned: "bg-success/15 text-success",
  returned: "bg-xqa-sky-soft text-xqa-blue",
  retired: "bg-muted text-muted-foreground",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold capitalize",
        STATUS_STYLES[status] ?? "bg-muted text-muted-foreground",
        className,
      )}
    >
      {status}
    </span>
  );
}
