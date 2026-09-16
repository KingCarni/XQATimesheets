import "server-only";

import ExcelJS from "exceljs";

import { prisma } from "@/lib/prisma";

/** Column order of the import template: Name, Email, Project, Employee ID. */
export type RawImportRow = {
  rowNumber: number;
  name: string;
  email: string;
  project: string;
  employeeCode: string;
};

export type ImportRowStatus = "ready" | "warning" | "error";

export type ImportPreviewRow = {
  rowNumber: number;
  name: string;
  email: string;
  project: string;
  employeeCode: string;
  matchedProjectId: string | null;
  status: ImportRowStatus;
  messages: string[];
};

export type ImportPreview = {
  rows: ImportPreviewRow[];
  counts: { total: number; ready: number; warning: number; error: number };
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cellText(value: ExcelJS.CellValue): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") {
    const v = value as { text?: unknown; result?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (Array.isArray(v.richText)) return v.richText.map((r) => r.text).join("").trim();
    if (typeof v.text === "string") return v.text.trim();
    if (typeof v.result === "string" || typeof v.result === "number") return String(v.result).trim();
  }
  return "";
}

function looksLikeHeader(row: RawImportRow): boolean {
  const cells = [row.name, row.email, row.project, row.employeeCode].map((c) => c.toLowerCase());
  return (
    cells.includes("name") ||
    cells.includes("email") ||
    cells.includes("project") ||
    cells.some((c) => c === "employee id" || c === "employee code" || c === "id")
  );
}

/** Parse an .xlsx buffer into raw rows (first worksheet, positional columns). */
export async function parseEmployeeWorkbook(buffer: Buffer): Promise<RawImportRow[]> {
  const wb = new ExcelJS.Workbook();
  // exceljs's types predate the generic Node Buffer; the cast bridges them.
  await wb.xlsx.load(buffer as unknown as Parameters<typeof wb.xlsx.load>[0]);
  const sheet = wb.worksheets[0];
  if (!sheet) return [];

  const rows: RawImportRow[] = [];
  sheet.eachRow((row, rowNumber) => {
    const raw: RawImportRow = {
      rowNumber,
      name: cellText(row.getCell(1).value),
      email: cellText(row.getCell(2).value),
      project: cellText(row.getCell(3).value),
      employeeCode: cellText(row.getCell(4).value),
    };
    rows.push(raw);
  });

  // Drop a leading header row if present.
  if (rows.length > 0 && looksLikeHeader(rows[0])) rows.shift();

  // Drop fully-empty rows.
  return rows.filter((r) => r.name || r.email || r.project || r.employeeCode);
}

/**
 * Validate raw rows against the database and the file itself. Pure read — never
 * writes. Produces a per-row status (ready/warning/error) and messages, plus a
 * resolved project id for rows whose project matched (used at commit time).
 */
export async function validateImportRows(raw: RawImportRow[], organizationId: string): Promise<ImportPreview> {
  const emails = raw.map((r) => r.email.trim().toLowerCase()).filter(Boolean);
  const codes = raw.map((r) => r.employeeCode.trim()).filter(Boolean);

  const [existingUsers, projects, existingCodes] = await Promise.all([
    // Users are global identities — an email taken in ANY org blocks creation here.
    emails.length
      ? prisma.users.findMany({ where: { email: { in: emails } }, select: { email: true } })
      : Promise.resolve([]),
    // Projects are matched only within the current organization.
    prisma.projects.findMany({ where: { is_active: true, organization_id: organizationId }, select: { id: true, name: true } }),
    codes.length
      ? prisma.employee_profiles.findMany({
          where: { employee_code: { in: codes }, organization_id: organizationId },
          select: { employee_code: true },
        })
      : Promise.resolve([]),
  ]);

  const existingEmailSet = new Set(existingUsers.map((u) => u.email.toLowerCase()));
  const projectByName = new Map(projects.map((p) => [p.name.trim().toLowerCase(), p]));
  const existingCodeSet = new Set(existingCodes.map((c) => c.employee_code).filter((c): c is string => Boolean(c)));

  const emailSeen = new Map<string, number>();
  const codeSeen = new Map<string, number>();

  const rows: ImportPreviewRow[] = raw.map((r) => {
    const messages: string[] = [];
    let status: ImportRowStatus = "ready";
    const error = (m: string) => {
      messages.push(m);
      status = "error";
    };
    const warn = (m: string) => {
      messages.push(m);
      if (status !== "error") status = "warning";
    };

    const name = r.name.trim();
    const email = r.email.trim().toLowerCase();
    const project = r.project.trim();
    const code = r.employeeCode.trim();

    if (!name) error("Name is required.");

    if (!email) {
      error("Email is required.");
    } else if (!EMAIL_RE.test(email)) {
      error("Email is not a valid address.");
    } else {
      const priorRow = emailSeen.get(email);
      if (priorRow) error(`Duplicate email in file (also row ${priorRow}).`);
      else emailSeen.set(email, r.rowNumber);
      if (existingEmailSet.has(email)) error("An account with this email already exists — will be skipped.");
    }

    let matchedProjectId: string | null = null;
    if (!project) {
      error("Project is required.");
    } else {
      const match = projectByName.get(project.toLowerCase());
      if (!match) error(`Project "${project}" does not match any existing project.`);
      else matchedProjectId = match.id;
    }

    if (code) {
      const priorRow = codeSeen.get(code.toLowerCase());
      if (priorRow) warn(`Duplicate employee ID in file (also row ${priorRow}).`);
      else codeSeen.set(code.toLowerCase(), r.rowNumber);
      if (existingCodeSet.has(code)) warn("This employee ID is already used by another employee.");
    }

    return {
      rowNumber: r.rowNumber,
      name,
      email,
      project,
      employeeCode: code,
      matchedProjectId,
      status,
      messages,
    };
  });

  return {
    rows,
    counts: {
      total: rows.length,
      ready: rows.filter((r) => r.status === "ready").length,
      warning: rows.filter((r) => r.status === "warning").length,
      error: rows.filter((r) => r.status === "error").length,
    },
  };
}
