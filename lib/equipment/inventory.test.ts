import { test } from "node:test";
import assert from "node:assert/strict";

import {
  filterInventory,
  inventoryExportFilename,
  sortInventoryForDisplay,
  summarizeInventory,
  type EquipmentInventoryRow,
} from "./inventory-shape.ts";

function row(o: Partial<EquipmentInventoryRow>): EquipmentInventoryRow {
  return {
    id: o.id ?? "e-" + Math.random(),
    name: o.name ?? "Laptop",
    assetTag: o.assetTag ?? null,
    status: o.status ?? "assigned",
    issuedOn: o.issuedOn ?? null,
    returnedOn: o.returnedOn ?? null,
    notes: o.notes ?? null,
    employeeProfileId: o.employeeProfileId ?? "p1",
    employeeName: o.employeeName ?? "Alice",
    employeeEmail: o.employeeEmail ?? "alice@x.test",
  };
}

const rows: EquipmentInventoryRow[] = [
  row({ id: "1", name: "MacBook Pro", assetTag: "XQA-100", status: "assigned", employeeProfileId: "p1", employeeName: "Alice", issuedOn: "2026-01-01" }),
  row({ id: "2", name: "Dell XPS", assetTag: "XQA-200", status: "returned", employeeProfileId: "p1", employeeName: "Alice", issuedOn: "2025-06-01", returnedOn: "2025-12-31" }),
  row({ id: "3", name: "iPhone 15", assetTag: "PHN-1", status: "assigned", employeeProfileId: "p2", employeeName: "Bob", issuedOn: "2026-02-15" }),
  row({ id: "4", name: "Dell Monitor", assetTag: null, status: "retired", employeeProfileId: "p2", employeeName: "Bob", issuedOn: "2023-01-01" }),
];

// ---- authorization boundary (tests 1/15/16) not exercised here — those
// are enforced by requireOrganizationAdmin (see page.tsx) and the query's
// organization_id scope, both of which are integration/build-level checks.
// The purely testable rules are the filter/search/sort semantics.

test("4. unassigned/returned/retired equipment remains visible with no status filter", () => {
  assert.equal(filterInventory(rows, {}).length, 4);
});

test("5. returned equipment stays visible AND status filter narrows it", () => {
  const r = filterInventory(rows, { status: "returned" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "2");
});

test("8. status=assigned narrows to two assigned items", () => {
  const r = filterInventory(rows, { status: "assigned" });
  assert.equal(r.length, 2);
});

test("status='all' behaves like no filter", () => {
  assert.equal(filterInventory(rows, { status: "all" }).length, 4);
});

test("6. employee filter narrows to only that profile", () => {
  const r = filterInventory(rows, { employeeProfileId: "p2" });
  assert.equal(r.length, 2);
  assert.ok(r.every((x) => x.employeeProfileId === "p2"));
});

test("9. serial/name search — substring case-insensitive over name", () => {
  const r = filterInventory(rows, { search: "macbook" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "1");
});

test("10. asset-tag search — substring case-insensitive over assetTag", () => {
  const r = filterInventory(rows, { search: "xqa-200" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "2");
});

test("null asset tag does not match empty search hit", () => {
  const r = filterInventory(rows, { search: "monitor" });
  assert.equal(r.length, 1);
  assert.equal(r[0].id, "4");
});

test("combined filters intersect (status + employee + search)", () => {
  const r = filterInventory(rows, { status: "assigned", employeeProfileId: "p1", search: "macbook" });
  assert.equal(r.length, 1);
});

test("13. reassigned asset preserves the old assignment row (history rows retained)", () => {
  // Alice: one assigned, one returned. Both remain in the visible list.
  const r = filterInventory(rows, { employeeProfileId: "p1" });
  assert.equal(r.length, 2);
  assert.ok(r.some((x) => x.status === "assigned"));
  assert.ok(r.some((x) => x.status === "returned"));
});

test("12. sort places assigned first, then most recently issued", () => {
  const sorted = sortInventoryForDisplay(rows);
  assert.equal(sorted[0].status, "assigned");
  assert.equal(sorted[1].status, "assigned");
  // Between the two assigned, iPhone 15 (2026-02-15) is more recent than MacBook Pro (2026-01-01).
  assert.equal(sorted[0].id, "3");
  assert.equal(sorted[1].id, "1");
});

test("summary counts by status + distinct employees", () => {
  const s = summarizeInventory(rows);
  assert.equal(s.total, 4);
  assert.equal(s.assigned, 2);
  assert.equal(s.returned, 1);
  assert.equal(s.retired, 1);
  assert.equal(s.employees, 2);
});

test("empty inventory yields zero-summary and empty filter results", () => {
  const s = summarizeInventory([]);
  assert.deepEqual(s, { total: 0, assigned: 0, returned: 0, retired: 0, employees: 0 });
  assert.equal(filterInventory([], { search: "anything" }).length, 0);
});

test("14. export filename encodes org slug + extension", () => {
  assert.equal(inventoryExportFilename("xqa", "xlsx"), "xqa-equipment-inventory.xlsx");
  assert.equal(inventoryExportFilename("acme", "csv"), "acme-equipment-inventory.csv");
});
