import { redirect } from "next/navigation";

/**
 * Time Off moved: employees submit and track their own requests under
 * My Profile → Time Off, and managers/admins review under Approvals → Time Off.
 * This route is kept as a redirect so old links/bookmarks still resolve.
 */
export default function PtoRedirectPage() {
  redirect("/profile");
}
