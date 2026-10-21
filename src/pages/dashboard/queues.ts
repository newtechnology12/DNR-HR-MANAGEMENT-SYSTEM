/**
 * "Needs your action" queues on the dashboards. A queue is shown to people who may decide on
 * those requests (not merely see them); the counts only include records the API lets them read,
 * so a department head counts their department and a store officer the whole organisation.
 */
import { CarFront, FileCheck2, Laptop, LucideIcon, Palmtree, Receipt, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { APPROVER_PERMISSIONS } from "@/lib/navigation";

export type Queue = { key: string; label: string; icon: LucideIcon; link: string; perms: string[]; count: (uid: string) => Promise<number> };

const total = (collection: string, filter: string) =>
  pocketbase.collection(collection).getList(1, 1, { filter, fields: "id" }).then((r) => r.totalItems).catch(() => 0);

export const QUEUES: Queue[] = [
  {
    key: "approvals", label: "Documents to approve", icon: FileCheck2, link: "/dashboard/approvals", perms: APPROVER_PERMISSIONS,
    count: (uid) => total("approval_requests", `status = "pending" && pending_approvers ~ "${uid}"`),
  },
  { key: "leaves", label: "Leave requests", icon: Palmtree, link: "/dashboard/hr/leaves", perms: ["update_leave", "view_leaves"], count: (uid) => total("leaves", `status = "pending" && employee != "${uid}"`) },
  { key: "expenses", label: "Expense requests", icon: Receipt, link: "/dashboard/hr/prepayments", perms: ["approve_or_reject_expense"], count: (uid) => total("prepayments", `status = "pending" && employee != "${uid}"`) },
  { key: "petty", label: "Petty cash requests", icon: Wallet, link: "/dashboard/finance/petty-cash-requests", perms: ["approve_or_reject_request"], count: (uid) => total("petty_cash_requests", `status = "pending" && requested_by != "${uid}"`) },
  { key: "assets", label: "Equipment requests", icon: Laptop, link: "/dashboard/assets/requests", perms: ["reject_or_approve_assets_requests"], count: (uid) => total("assets_requests", `status = "pending" && requested_by != "${uid}"`) },
  { key: "cars", label: "Vehicle requests", icon: CarFront, link: "/dashboard/finance/carmanagement", perms: ["approve_or_reject_request"], count: (uid) => total("CarRequests", `status = "pending" && employee != "${uid}"`) },
];

export const queuesFor = (can: (p: string) => boolean) => QUEUES.filter((q) => q.perms.some(can));

export async function queueCounts(queues: Queue[], uid: string) {
  const counts = await Promise.all(queues.map((q) => q.count(uid)));
  return Object.fromEntries(queues.map((q, i) => [q.key, counts[i]])) as Record<string, number>;
}
