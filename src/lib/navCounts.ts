/**
 * Small counts shown beside menu entries: my pending leave, my open requests, approvals waiting for me and
 * plans waiting for me (as supervisor) or returned to me. Own records only; refreshed every minute.
 */
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";

const count = (collection: string, filter: string) =>
  pocketbase.collection(collection).getList(1, 1, { filter, fields: "id", skipTotal: false }).then((r) => r.totalItems).catch(() => 0);

export async function navCounts(uid: string) {
  const mine = (owner: string) => `${owner} = "${uid}" && status = "pending"`;
  const [leave, expenses, petty, equipment, requisitions, approvals, plansToReview, plansReturned] = await Promise.all([
    count("leaves", mine("employee")),
    count("prepayments", mine("employee")),
    count("petty_cash_requests", mine("requested_by")),
    count("assets_requests", mine("requested_by")),
    count("purchase_requisitions", `requester = "${uid}" && status = "pending_approval"`),
    count("approval_requests", `status = "pending" && pending_approvers ~ "${uid}"`),
    count("work_plans", `supervisor = "${uid}" && (status = "submitted" || status = "reported")`),
    count("work_plans", `staff = "${uid}" && status = "returned"`),
  ]);
  return { myLeave: leave, myRequests: leave + expenses + petty + equipment + requisitions, approvals, myPlans: plansToReview + plansReturned };
}

export function useNavCounts(uid?: string) {
  return useQuery(["nav-counts", uid], () => navCounts(uid!), { enabled: Boolean(uid), refetchInterval: 60_000, staleTime: 30_000 });
}

/** Which counts ask for action (amber) rather than just inform (grey). */
export const ATTENTION = new Set(["myLeave", "approvals", "myPlans"]);
