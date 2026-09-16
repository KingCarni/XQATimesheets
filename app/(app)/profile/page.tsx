import { requireOrganizationContext } from "@/lib/tenant/context";
import { getProfileOverview } from "@/lib/profile/queries";
import { getContractsForProfile } from "@/lib/contracts/queries";
import { getEquipmentForProfile } from "@/lib/equipment/queries";
import { getLeaveBalancesForProfile } from "@/lib/leave/entitlements";
import { getOwnHardwareRequests } from "@/lib/hardware/queries";
import { getOwnPtoRequests, getPtoActivityTypes } from "@/lib/pto/queries";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ProfileWorkspace } from "@/components/profile/profile-workspace";

export default async function ProfilePage() {
  const { user, organization } = await requireOrganizationContext();
  const organizationId = organization.id;

  if (!user.profile) {
    return (
      <div className="mx-auto max-w-xl">
        <Card>
          <CardHeader>
            <CardTitle>No employee profile</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Your account isn&apos;t linked to an employee profile yet. Ask an admin to create one for you.
          </CardContent>
        </Card>
      </div>
    );
  }

  const profileId = user.profile.id;
  const [overview, balances, ptoTypes, ownPto, contracts, equipment, hardware] = await Promise.all([
    getProfileOverview(user, organizationId),
    getLeaveBalancesForProfile(profileId, organizationId),
    getPtoActivityTypes(organizationId),
    getOwnPtoRequests(profileId, organizationId),
    getContractsForProfile(profileId, organizationId),
    getEquipmentForProfile(profileId, organizationId),
    getOwnHardwareRequests(profileId, organizationId),
  ]);

  if (!overview) {
    return null;
  }

  return (
    <ProfileWorkspace
      overview={overview}
      balances={balances}
      ptoTypes={ptoTypes}
      ownPto={ownPto.map((r) => ({
        id: r.id,
        typeName: r.typeName,
        startDate: r.startDate,
        endDate: r.endDate,
        totalHours: r.totalHours,
        status: r.status,
        notes: r.notes,
        approverEmail: r.approverEmail,
      }))}
      contracts={contracts}
      equipment={equipment}
      hardware={hardware}
    />
  );
}
