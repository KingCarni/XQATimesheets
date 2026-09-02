import type { AppRole } from "@/types/domain";

export const LOGIN_PATH = "/login";
export const DEFAULT_AUTHED_PATH = "/my-timesheet";

/**
 * Coarse route gate used by middleware and navigation.
 * Authoritative authorization is enforced by server-side checks.
 *
 * Matching is longest-prefix: `/admin` covers `/admin/users`, etc.
 */
const ROUTE_ROLES: Array<{ prefix: string; roles: readonly AppRole[] }> = [
  { prefix: "/my-timesheet", roles: ["employee", "manager", "admin"] },
  { prefix: "/pto", roles: ["employee", "manager", "admin"] },
  { prefix: "/team", roles: ["employee", "manager", "admin"] },
  { prefix: "/approvals", roles: ["employee", "manager", "admin"] },
  { prefix: "/reports", roles: ["manager", "admin"] },
  { prefix: "/admin", roles: ["admin"] },
];

export function allowedRolesForPath(pathname: string): readonly AppRole[] | null {
  const match = ROUTE_ROLES.filter(
    (r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"),
  ).sort((a, b) => b.prefix.length - a.prefix.length)[0];

  return match ? match.roles : null;
}

export function isRouteAllowed(pathname: string, role: AppRole): boolean {
  const roles = allowedRolesForPath(pathname);
  return roles ? roles.includes(role) : true;
}

export type NavItem = {
  href: string;
  label: string;
  roles: readonly AppRole[];
};

export const NAV_ITEMS: NavItem[] = [
  {
    href: "/my-timesheet",
    label: "My Timesheet",
    roles: ["employee", "manager", "admin"],
  },
  {
    href: "/pto",
    label: "Time Off",
    roles: ["employee", "manager", "admin"],
  },
  {
    href: "/team",
    label: "Team Timesheets",
    roles: ["employee", "manager", "admin"],
  },
  {
    href: "/approvals",
    label: "Approvals",
    roles: ["employee", "manager", "admin"],
  },
  {
    href: "/reports",
    label: "Reports",
    roles: ["manager", "admin"],
  },
  {
    href: "/admin",
    label: "Employees",
    roles: ["admin"],
  },
  {
    href: "/admin/projects",
    label: "Projects",
    roles: ["admin"],
  },
];

export function navItemsForRole(
  role: AppRole,
  opts: { canReview?: boolean } = {},
): NavItem[] {
  return NAV_ITEMS.filter((item) => {
    if (!item.roles.includes(role)) return false;

    if (
      (item.href === "/team" || item.href === "/approvals") &&
      !opts.canReview
    ) {
      return false;
    }

    return true;
  });
}