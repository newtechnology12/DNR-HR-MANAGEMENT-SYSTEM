/**
 * "Needs your action" queues on the dashboards. A queue is shown to people who may decide on
 * those requests (not merely see them); the counts only include records the API lets them read,
 * so a department head counts their department and a store officer the whole organisation.
 */
import { CarFront, ClipboardCheck, FileCheck2, Laptop, LucideIcon, Palmtree, Target, Wallet } from "lucide-react";
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
  // staff expenses are approved through "Documents to approve"; the Cashier then pays them
  { key: "expenses", label: "Staff expenses to pay", icon: Wallet, link: "/dashboard/finance/staff-expenses?view=pay", perms: ["record_payments"], count: (uid) => total("prepayments", `status = "approved" && employee != "${uid}"`) },
  { key: "assets", label: "Equipment requests", icon: Laptop, link: "/dashboard/assets/requests", perms: ["reject_or_approve_assets_requests"], count: (uid) => total("assets_requests", `status = "pending" && requested_by != "${uid}"`) },
  { key: "plans", label: "Work plans and reports to review", icon: Target, link: "/dashboard/my/plans?tab=team", perms: ["evaluate_staff", ...APPROVER_PERMISSIONS], count: (uid) => total("work_plans", `supervisor = "${uid}" && (status = "submitted" || status = "reported")`) },
  { key: "corrections", label: "Attendance corrections", icon: ClipboardCheck, link: "/dashboard/hr/attendance-corrections", perms: ["update_attendance"], count: () => total("attendance_corrections", "status = \"pending\"") },
  { key: "cars", label: "Vehicle requests", icon: CarFront, link: "/dashboard/finance/carmanagement", perms: ["approve_or_reject_request"], count: (uid) => total("CarRequests", `status = "pending" && employee != "${uid}"`) },
];

export const queuesFor = (can: (p: string) => boolean) => QUEUES.filter((q) => q.perms.some(can));

export async function queueCounts(queues: Queue[], uid: string) {
  const counts = await Promise.all(queues.map((q) => q.count(uid)));
  return Object.fromEntries(queues.map((q, i) => [q.key, counts[i]])) as Record<string, number>;
}
