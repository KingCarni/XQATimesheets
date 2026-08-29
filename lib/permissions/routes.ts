import type { AppRole } from "@/types/domain";

export const LOGIN_PATH = "/login";
export const DEFAULT_AUTHED_PATH = "/my-timesheet";

/**
 * Coarse route → allowed-roles map, used by middleware and the nav.
 * Matching is longest-prefix: `/admin` covers `/admin/users`, etc.
 *
 * Authoritative authorization is still enforced per-action and by RLS —
 * this only shapes navigation and blocks obviously-wrong page loads.
 */
const ROUTE_ROLES: Array<{ prefix: string; roles: readonly AppRole[] }> = [
  { prefix: "/my-timesheet", roles: ["employee", "manager", "admin"] },
  { prefix: "/pto", roles: ["employee", "manager", "admin"] },
  { prefix: "/team", roles: ["manager", "admin"] },
  { prefix: "/approvals", roles: ["manager", "admin"] },
  { prefix: "/reports", roles: ["manager", "admin"] },
  { prefix: "/admin", roles: ["admin"] },
];

export function allowedRolesForPath(pathname: string): readonly AppRole[] | null {
  const match = ROUTE_ROLES.filter((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"))
    // longest prefix wins
    .sort((a, b) => b.prefix.length - a.prefix.length)[0];
  return match ? match.roles : null;
}

/** Unknown routes are allowed for any signed-in user (e.g. `/`, settings). */
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
  { href: "/my-timesheet", label: "My Timesheet", roles: ["employee", "manager", "admin"] },
  { href: "/team", label: "Team Timesheets", roles: ["manager", "admin"] },
  { href: "/approvals", label: "Approvals", roles: ["manager", "admin"] },
  { href: "/reports", label: "Reports", roles: ["manager", "admin"] },
  { href: "/admin", label: "Admin", roles: ["admin"] },
];

export function navItemsForRole(role: AppRole): NavItem[] {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}
