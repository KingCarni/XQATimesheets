import * as React from "react";

import { cn } from "@/lib/utils";

type Variant = "default" | "outline" | "ghost" | "destructive";
type Size = "default" | "sm" | "lg";

const variants: Record<Variant, string> = {
  default:
    "bg-gradient-to-r from-xqa-blue to-xqa-blue-2 text-primary-foreground shadow-sm hover:brightness-105",
  outline: "border border-border bg-card text-foreground shadow-sm hover:bg-xqa-sky-soft",
  ghost: "text-foreground hover:bg-xqa-sky-soft",
  destructive: "bg-destructive text-destructive-foreground shadow-sm hover:brightness-105",
};

const sizes: Record<Size, string> = {
  default: "h-9 px-4 py-2 text-sm",
  sm: "h-8 px-3 text-xs",
  lg: "h-10 px-6 text-sm",
};

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "default", size = "default", ...props }, ref) => (
    <button
      ref={ref}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg font-medium transition",
        "focus-visible:ring-ring focus-visible:ring-2 focus-visible:outline-none",
        "disabled:pointer-events-none disabled:opacity-50",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    />
  ),
);
Button.displayName = "Button";
