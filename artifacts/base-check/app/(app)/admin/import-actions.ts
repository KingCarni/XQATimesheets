"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireWritableOrganizationAdmin } from "@/lib/tenant/context";
import { prisma } from "@/lib/prisma";
import { provisionEmployee } from "@/lib/admin/provision";
import { parseEmployeeWorkbook, validateImportRows, type ImportPreview } from "@/lib/admin/import";

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const MAX_IMPORT_BYTES = 5 * 1024 * 1024;

/**
 * Step 1–4: upload → parse → validate → preview. This NEVER writes to the
 * database; it only returns a per-row preview the admin can review before
 * committing. Admin-only.
 */
export async function parseEmployeeImport(
  _prev: ActionResult<ImportPreview> | null,
  formData: FormData,
): Promise<ActionResult<ImportPreview>> {
  try {
    const { organization } = await requireWritableOrganizationAdmin();
    const file = formData.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose an .xlsx file to import.");
    if (file.size > MAX_IMPORT_BYTES) throw new Error("The file exceeds the 5 MB limit.");
    const name = file.name.toLowerCase();
    if (file.type !== XLSX_MIME && !name.endsWith(".xlsx")) {
      throw new Error("Only .xlsx workbooks are supported.");
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const raw = await parseEmployeeWorkbook(buffer);
    if (raw.length === 0) throw new Error("No data rows were found in the workbook.");

    const preview = await validateImportRows(raw, organization.id);
    return { ok: true, data: preview };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not read the workbook." };
  }
}

const commitRowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  employeeCode: z.string().optional().nullable(),
  projectId: z.string().uuid(),
});

export type ImportCommitResult = {
  imported: { email: string; fullName: string; temporaryPassword: string }[];
  skipped: { email: string; reason: string }[];
  failed: { email: string; reason: string }[];
  counts: { imported: number; skipped: number; failed: number };
};

/**
 * Step 5–6: confirm → commit. Re-validates every row server-side (email format,
 * existing user, active project) before creating, so nothing is trusted blindly
 * from the client. Each employee is created in its own transaction via the
 * shared provisioning path (secure temp password, member-only assignment), so a
 * single bad row never rolls back the whole import. Admin-only.
 */
export async function commitEmployeeImport(
  _prev: ActionResult<ImportCommitResult> | null,
  formData: FormData,
): Promise<ActionResult<ImportCommitResult>> {
  try {
    const { user: admin, organization } = await requireWritableOrganizationAdmin();

    const parsed = z.array(commitRowSchema).safeParse(JSON.parse(String(formData.get("rows") ?? "[]")));
    if (!parsed.success) throw new Error("The import payload was malformed. Re-run the preview.");
    const rows = parsed.data;
    if (rows.length === 0) throw new Error("There are no importable rows.");

    // Resolve valid active project ids once — only projects in THIS org count.
    const projectIds = [...new Set(rows.map((r) => r.projectId))];
    const validProjects = await prisma.projects.findMany({
      where: { id: { in: projectIds }, is_active: true, organization_id: organization.id },
      select: { id: true },
    });
    const validProjectSet = new Set(validProjects.map((p) => p.id));

    const result: ImportCommitResult = {
      imported: [],
      skipped: [],
      failed: [],
      counts: { imported: 0, skipped: 0, failed: 0 },
    };

    const seenEmails = new Set<string>();

    for (const row of rows) {
      const email = row.email.trim().toLowerCase();
      try {
        if (seenEmails.has(email)) {
          result.skipped.push({ email, reason: "Duplicate email within the import." });
          continue;
        }
        seenEmails.add(email);

        if (!validProjectSet.has(row.projectId)) {
          result.failed.push({ email, reason: "Project is no longer valid." });
          continue;
        }

        const existing = await prisma.users.findUnique({ where: { email }, select: { id: true } });
        if (existing) {
          result.skipped.push({ email, reason: "An account with this email already exists." });
          continue;
        }

        const created = await prisma.$transaction(async (tx) => {
          const provisioned = await provisionEmployee(tx, {
            organizationId: organization.id,
            email,
            fullName: row.name,
            role: "employee",
            employeeCode: row.employeeCode?.trim() || null,
            assignments: [{ project_id: row.projectId, assignment_role: "member" }],
          });
          await tx.audit_history.create({
            data: {
              entity_type: "user",
              entity_id: provisioned.userId,
              action: "import_create",
              actor_user_id: admin.id,
              organization_id: organization.id,
              metadata: { email, project_id: row.projectId },
            },
          });
          return provisioned;
        });

        result.imported.push({
          email: created.email,
          fullName: created.fullName,
          temporaryPassword: created.temporaryPassword,
        });
      } catch (e) {
        result.failed.push({ email, reason: e instanceof Error ? e.message : "Unknown error." });
      }
    }

    result.counts = {
      imported: result.imported.length,
      skipped: result.skipped.length,
      failed: result.failed.length,
    };

    revalidatePath("/admin");
    return { ok: true, data: result };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not complete the import." };
  }
}
