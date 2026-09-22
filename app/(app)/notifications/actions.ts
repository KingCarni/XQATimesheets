"use server";

import { revalidatePath } from "next/cache";

import { requireOrganizationContext } from "@/lib/tenant/context";
import { markAllNotificationsRead, markNotificationRead } from "@/lib/notifications/service";

/**
 * MHV-3 read-mark server actions. Every mutation asserts tenant + owner match
 * in the underlying updateMany WHERE clause, so an id owned by another user
 * or tenant cannot be flipped even if the id is known.
 */
export async function markOneRead(formData: FormData): Promise<void> {
  const { user, organization } = await requireOrganizationContext();
  const id = String(formData.get("id") ?? "");
  if (id) await markNotificationRead(id, user.id, organization.id);
  revalidatePath("/notifications");
}

export async function markAllRead(): Promise<void> {
  const { user, organization } = await requireOrganizationContext();
  await markAllNotificationsRead(user.id, organization.id);
  revalidatePath("/notifications");
}
