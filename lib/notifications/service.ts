import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  CreateNotificationInput,
  NotificationRow,
  NotificationType,
} from "./types";

/**
 * MHV-3 notification write path. All producers go through here — no page or
 * server action should insert directly into `notifications`. This keeps
 * dedupe/idempotency, tenant scope, and future channel-delivery hooks in
 * exactly one place.
 *
 * Idempotency: a partial unique index on (organization_id, user_id, dedupe_key)
 * makes repeated inserts with the same dedupe key a no-op. We use raw SQL with
 * ON CONFLICT DO NOTHING so a retry of a server action never surfaces a
 * P2002; the second call simply returns `null`.
 */
export async function createNotification(
  input: CreateNotificationInput,
  tx?: Prisma.TransactionClient,
): Promise<string | null> {
  const client = tx ?? prisma;
  const metadata = input.metadata ? JSON.stringify(input.metadata) : null;

  const rows = await client.$queryRaw<{ id: string }[]>`
    INSERT INTO notifications
      (organization_id, user_id, type, title, message, href, metadata, dedupe_key)
    VALUES
      (${input.organizationId}::uuid,
       ${input.userId}::uuid,
       ${input.type},
       ${input.title},
       ${input.message},
       ${input.href ?? null},
       ${metadata}::jsonb,
       ${input.dedupeKey ?? null})
    ON CONFLICT (organization_id, user_id, dedupe_key)
      WHERE dedupe_key IS NOT NULL
      DO NOTHING
    RETURNING id
  `;
  return rows[0]?.id ?? null;
}

/**
 * Bulk fan-out to many recipients. Preserves per-recipient dedupe; a producer
 * that wants "one notification per recipient per event" should pass a stable
 * `dedupeKey` and let the DB drop repeats.
 */
export async function createNotifications(
  inputs: CreateNotificationInput[],
  tx?: Prisma.TransactionClient,
): Promise<number> {
  let inserted = 0;
  for (const input of inputs) {
    const id = await createNotification(input, tx);
    if (id) inserted += 1;
  }
  return inserted;
}

function mapRow(r: {
  id: string;
  organization_id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  href: string | null;
  metadata: unknown;
  dedupe_key: string | null;
  read_at: Date | null;
  created_at: Date;
}): NotificationRow {
  return {
    id: r.id,
    organizationId: r.organization_id,
    userId: r.user_id,
    type: r.type as NotificationType,
    title: r.title,
    message: r.message,
    href: r.href,
    metadata: (r.metadata as Record<string, unknown> | null) ?? null,
    dedupeKey: r.dedupe_key,
    readAt: r.read_at,
    createdAt: r.created_at,
  };
}

/**
 * Recipient-scoped read. Tenant is included so an operator that changed
 * organizations mid-session cannot pull another tenant's notifications.
 */
export async function listNotificationsForUser(
  userId: string,
  organizationId: string,
  opts: { onlyUnread?: boolean; limit?: number } = {},
): Promise<NotificationRow[]> {
  const rows = await prisma.notifications.findMany({
    where: {
      user_id: userId,
      organization_id: organizationId,
      ...(opts.onlyUnread ? { read_at: null } : {}),
    },
    orderBy: { created_at: "desc" },
    take: opts.limit ?? 50,
  });
  return rows.map(mapRow);
}

export async function unreadCount(userId: string, organizationId: string): Promise<number> {
  return prisma.notifications.count({
    where: { user_id: userId, organization_id: organizationId, read_at: null },
  });
}

/**
 * Read-mark by id. Tenant + user match is enforced in the WHERE — an id owned
 * by another user cannot be flipped even if guessed.
 */
export async function markNotificationRead(
  notificationId: string,
  userId: string,
  organizationId: string,
): Promise<boolean> {
  const result = await prisma.notifications.updateMany({
    where: {
      id: notificationId,
      user_id: userId,
      organization_id: organizationId,
      read_at: null,
    },
    data: { read_at: new Date() },
  });
  return result.count === 1;
}

export async function markAllNotificationsRead(
  userId: string,
  organizationId: string,
): Promise<number> {
  const result = await prisma.notifications.updateMany({
    where: { user_id: userId, organization_id: organizationId, read_at: null },
    data: { read_at: new Date() },
  });
  return result.count;
}
