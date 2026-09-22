import { NextResponse } from "next/server";

import { getOrganizationContext } from "@/lib/tenant/context";
import { listOrganizationEquipment } from "@/lib/equipment/inventory";
import { buildInventoryCsv, buildInventoryXlsx } from "@/lib/equipment/inventory-export";
import { inventoryExportFilename } from "@/lib/equipment/inventory-shape";
import { EQUIPMENT_STATUSES, type EquipmentStatus } from "@/types/domain";

/**
 * Admin-only export mirroring the inventory page filters exactly. Auth
 * matches `canManageEquipment` (admin membership) — no manager or employee
 * ever downloads organization inventory.
 */
export async function GET(request: Request) {
  const ctx = await getOrganizationContext();
  if (ctx.status === "unauthenticated") return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (ctx.status !== "ok") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const { organization, membership } = ctx.context;
  if (membership.role !== "admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  const rawStatus = url.searchParams.get("status") ?? "";
  const status = (EQUIPMENT_STATUSES as readonly string[]).includes(rawStatus)
    ? (rawStatus as EquipmentStatus)
    : undefined;
  const employeeProfileId = url.searchParams.get("employee")?.trim() || undefined;
  const search = url.searchParams.get("q")?.trim() || undefined;

  const { rows } = await listOrganizationEquipment(organization.id, { status, employeeProfileId, search });

  if (format === "csv") {
    return new NextResponse(buildInventoryCsv(rows), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${inventoryExportFilename(organization.slug, "csv")}"`,
      },
    });
  }
  const buffer = await buildInventoryXlsx(rows, organization.name);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${inventoryExportFilename(organization.slug, "xlsx")}"`,
    },
  });
}
