"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarCheck,
  CalendarOff,
  Clock3,
  FolderKanban,
  Settings,
  Users,
} from "lucide-react";

import { cn } from "@/lib/utils";
import type { NavItem } from "@/lib/permissions/routes";

const iconByHref = {
  "/my-timesheet": Clock3,
  "/pto": CalendarOff,
  "/approvals": CalendarCheck,
  "/team": Users,
  "/reports": BarChart3,
  "/admin": Settings,
  "/admin/projects": FolderKanban,
} as const;

export function AppNav({ items }: { items: NavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-col gap-1">
      {items.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = iconByHref[item.href as keyof typeof iconByHref] ?? FolderKanban;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition",
              active
                ? "from-xqa-blue to-xqa-blue-2 bg-gradient-to-r text-white shadow-lg shadow-xqa-blue/20"
                : "text-white/68 hover:bg-white/8 hover:text-white",
            )}
          >
            <Icon className="h-4 w-4 shrink-0" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
