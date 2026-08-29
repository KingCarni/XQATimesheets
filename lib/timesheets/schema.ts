import { z } from "zod";

const uuid = z.string().uuid();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected yyyy-MM-dd");

/** Hours: quarter-hour granularity, > 0 and ≤ 24 (matches DB check). */
const hours = z
  .number({ message: "Enter hours" })
  .positive("Hours must be greater than 0")
  .max(24, "Hours cannot exceed 24")
  .refine((h) => Math.round(h * 4) === h * 4, "Use 15-minute increments");

export const newEntrySchema = z.object({
  weekStart: dateStr,
  entryDate: dateStr,
  projectId: uuid.nullable().optional().default(null),
  platformId: uuid.nullable().optional().default(null),
  activityTypeId: uuid,
  hours,
  description: z.string().max(2000).optional().default(""),
});
export type NewEntryInput = z.infer<typeof newEntrySchema>;

export const editEntrySchema = z.object({
  id: uuid,
  projectId: uuid.nullable().optional(),
  platformId: uuid.nullable().optional(),
  activityTypeId: uuid.optional(),
  hours: hours.optional(),
  description: z.string().max(2000).optional(),
});
export type EditEntryInput = z.infer<typeof editEntrySchema>;

/** Parse a possibly-empty string field from a form into a nullable uuid. */
export function emptyToNull(value: FormDataEntryValue | null): string | null {
  const s = typeof value === "string" ? value.trim() : "";
  return s === "" ? null : s;
}
