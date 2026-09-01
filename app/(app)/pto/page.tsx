import { requireUser } from "@/lib/auth/session";
import { getOwnPtoRequests, getPtoActivityTypes, getReviewablePtoRequests } from "@/lib/pto/queries";
import { createPtoRequest, cancelPtoRequest, reviewPtoRequest } from "./actions";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";

function statusClass(status: string) {
  if (status === "approved") return "bg-emerald-100 text-emerald-700";
  if (status === "rejected") return "bg-rose-100 text-rose-700";
  if (status === "cancelled") return "bg-slate-100 text-slate-600";
  return "bg-amber-100 text-amber-700";
}

export default async function PtoPage() {
  const user = await requireUser();
  const activityTypes = await getPtoActivityTypes();
  const ownRequests = user.profile ? await getOwnPtoRequests(user.profile.id) : [];
  const reviewable = user.role === "employee" ? [] : await getReviewablePtoRequests(user);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Time Off</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Request time off, track status, and review team requests.
        </p>
      </div>

      {user.profile ? (
        <Card>
          <CardHeader>
            <CardTitle>Request time off</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createPtoRequest} className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              <div className="space-y-2">
                <Label htmlFor="activityTypeId">Type</Label>
                <Select id="activityTypeId" name="activityTypeId" required defaultValue="">
                  <option value="" disabled>Select type</option>
                  {activityTypes.map((type) => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="startDate">Start date</Label>
                <Input id="startDate" name="startDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="endDate">End date</Label>
                <Input id="endDate" name="endDate" type="date" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="hoursPerDay">Hours per day</Label>
                <Input id="hoursPerDay" name="hoursPerDay" type="number" min="0.25" max="24" step="0.25" defaultValue="8" required />
              </div>
              <div className="space-y-2 md:col-span-2 xl:col-span-5">
                <Label htmlFor="notes">Note</Label>
                <Input id="notes" name="notes" placeholder="Optional note" />
              </div>
              <div className="md:col-span-2 xl:col-span-5">
                <Button type="submit">Submit request</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader><CardTitle>My requests</CardTitle></CardHeader>
        <CardContent>
          {ownRequests.length === 0 ? (
            <p className="text-muted-foreground text-sm">No time-off requests yet.</p>
          ) : (
            <div className="space-y-3">
              {ownRequests.map((request) => (
                <div key={request.id} className="flex flex-col gap-3 rounded-xl border p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold">{request.typeName}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(request.status)}`}>{request.status}</span>
                    </div>
                    <p className="text-sm">{request.startDate} → {request.endDate} · {request.totalHours}h total</p>
                    {request.notes ? <p className="text-muted-foreground text-sm">{request.notes}</p> : null}
                    {request.approverEmail ? <p className="text-muted-foreground text-xs">Reviewed by {request.approverEmail}</p> : null}
                  </div>
                  {request.status === "requested" ? (
                    <form action={cancelPtoRequest}>
                      <input type="hidden" name="requestId" value={request.id} />
                      <Button type="submit" variant="outline">Cancel</Button>
                    </form>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {user.role !== "employee" ? (
        <Card>
          <CardHeader><CardTitle>Team requests</CardTitle></CardHeader>
          <CardContent>
            {reviewable.length === 0 ? (
              <p className="text-muted-foreground text-sm">No requests in your review scope.</p>
            ) : (
              <div className="space-y-3">
                {reviewable.map((request) => (
                  <div key={request.id} className="rounded-xl border p-4">
                    <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-semibold">{request.employeeName}</span>
                          <span className="text-muted-foreground text-sm">{request.employeeEmail}</span>
                          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold capitalize ${statusClass(request.status)}`}>{request.status}</span>
                        </div>
                        <p className="text-sm">{request.typeName} · {request.startDate} → {request.endDate} · {request.totalHours}h</p>
                        {request.notes ? <p className="text-muted-foreground text-sm">{request.notes}</p> : null}
                      </div>
                      {request.status === "requested" ? (
                        <form action={reviewPtoRequest} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="requestId" value={request.id} />
                          <Input name="comment" placeholder="Optional review note" className="min-w-52" />
                          <Button type="submit" name="decision" value="approve">Approve</Button>
                          <Button type="submit" name="decision" value="reject" variant="outline">Reject</Button>
                        </form>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}
