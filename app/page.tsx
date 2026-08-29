import { redirect } from "next/navigation";

import { getCurrentUser } from "@/lib/auth/session";
import { DEFAULT_AUTHED_PATH, LOGIN_PATH } from "@/lib/permissions/routes";

export default async function RootPage() {
  const user = await getCurrentUser();
  redirect(user ? DEFAULT_AUTHED_PATH : LOGIN_PATH);
}
