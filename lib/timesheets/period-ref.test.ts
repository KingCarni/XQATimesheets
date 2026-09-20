/**
 * Pure tests for the approval period-ref codec. The approvals queue mixes
 * operational project periods with legacy weekly periods; approve/reject route
 * to the correct table purely from the ref. Correct routing is what guarantees
 * that approving one item never touches an unrelated one of the other kind.
 *
 *   node --test lib/timesheets/period-ref.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { decodePeriodRef, encodePeriodRef } from "./period-ref.ts";

test("round-trips a project ref", () => {
  const id = "11111111-1111-1111-1111-111111111111";
  const ref = encodePeriodRef("project", id);
  assert.equal(ref, `project:${id}`);
  assert.deepEqual(decodePeriodRef(ref), { kind: "project", id });
});

test("round-trips a legacy ref", () => {
  const id = "22222222-2222-2222-2222-222222222222";
  const ref = encodePeriodRef("legacy", id);
  assert.deepEqual(decodePeriodRef(ref), { kind: "legacy", id });
});

test("a bare (pre-MHV-8) id decodes as legacy", () => {
  const id = "33333333-3333-3333-3333-333333333333";
  assert.deepEqual(decodePeriodRef(id), { kind: "legacy", id });
});

test("project and legacy refs for the same uuid are distinct", () => {
  const id = "44444444-4444-4444-4444-444444444444";
  assert.notEqual(encodePeriodRef("project", id), encodePeriodRef("legacy", id));
});

test("an unknown kind prefix is treated as legacy (never silently project)", () => {
  // Defensive: a forged/garbage prefix must not be routed to the project table.
  assert.deepEqual(decodePeriodRef("bogus:abc"), { kind: "legacy", id: "abc" });
});
