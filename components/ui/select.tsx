import * as React from "react";

import { cn } from "@/lib/utils";

/** Lightweight styled native select — keyboard-friendly, good enough for internal tooling. */
export const Select = React.forwardRef<HTMLSelectElement, React.ComponentProps<"select">>(
  ({ className, ...props }, ref) => (
    <select
      ref={ref}
      className={cn(
        "border-input bg-card h-9 w-full rounded-md border px-2 text-sm",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        "disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  ),
);
Select.displayName = "Select";
