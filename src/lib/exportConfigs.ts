/**
 * Excel / PDF / CSV exports of the older list pages (see components/enterprise/TableTools.tsx). Rows come
 * from the API, so each person exports only what their role may see (staff: their own records).
 */
import pocketbase from "@/lib/pocketbase";
import type { TableExport } from "@/components/enterprise/TableTools";

const name = (r: any, k: string) => r.expand?.[k]?.name || r.expand?.[k]?.names || "";
const time = (v: string) => (v ? new Date(String(v).replace(" ", "T")).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : "");
const cap = (s: string) => String(s || "").replace(/[_-]/g, " ").replace(/^\w/, (c) => c.toUpperCase());
const inRange = (from?: Date | null, to?: Date | null) => (r: any) => {
  const d = new Date(String(r.created).replace(" ", "T"));
  return (!from || d >= from) && (!to || d <= new Date(to.getTime() + 864e5 - 1));
};

export const EXPORTS = {
  leaves: (): TableExport => ({
    title: "Leave requests", fileName: "leave-requests", what: "leaves", orientation: "landscape", permission: ["view_leaves", "access_employee_portal"],
    rows: () => pocketbase.collection("leaves").getFullList({ sort: "-start", expand: "employee,approved_by,rejected_by" }),
    totals: ["Days"],
    columns: [
      { header: "Employee", value: (r: any) => name(r, "employee"), width: 24 },
      { header: "Type", value: (r: any) => cap(r.type === "other" && r.other_type ? r.other_type : r.type) },
      { header: "From", value: (r: any) => r.start, format: "date" },
      { header: "To", value: (r: any) => r.end, format: "date" },
      { header: "Days", value: (r: any) => Number(r.Leaveduration || r.days) || 0, format: "number" },
      { header: "Status", value: (r: any) => cap(r.status) },
      { header: "Approved by", value: (r: any) => name(r, "approved_by") },
      { header: "Reason", value: (r: any) => r.reason || r.rejected_reason || "", width: 34 },
    ],
  }),

  attendance: (): TableExport => ({
    title: "Attendance", fileName: "attendance", what: "attendance", orientation: "landscape", permission: ["view_attendance_logs", "access_employee_portal"],
    rows: () => pocketbase.collection("attendance").getFullList({ sort: "-date", expand: "employee,branch" }),
    columns: [
      { header: "Date", value: (r: any) => r.date, format: "date" },
      { header: "Employee", value: (r: any) => name(r, "employee"), width: 24 },
      { header: "Office", value: (r: any) => name(r, "branch") },
      { header: "Type", value: (r: any) => cap(r.type) },
      { header: "Clock in", value: (r: any) => time(r.clockin_time) },
      { header: "Clock out", value: (r: any) => time(r.clockout_time) },
      { header: "Hours", value: (r: any) => (r.clockin_time && r.clockout_time ? Math.round(((new Date(String(r.clockout_time).replace(" ", "T")).getTime() - new Date(String(r.clockin_time).replace(" ", "T")).getTime()) / 36e5) * 10) / 10 : ""), format: "number" },
      { header: "Behaviour", value: (r: any) => cap(r.behaviour) },
      { header: "Notes", value: (r: any) => r.notes || "", width: 30 },
    ],
  }),

  pettyCash: (from?: Date | null, to?: Date | null): TableExport => ({
    title: "Petty cash requests", fileName: "petty-cash-requests", what: "petty_cash_requests",
    subtitle: from || to ? `${from ? from.toLocaleDateString("en-GB") : "…"} – ${to ? to.toLocaleDateString("en-GB") : "…"}` : undefined,
    rows: async () => (await pocketbase.collection("petty_cash_requests").getFullList({ sort: "-created", expand: "employee,account,approved_by" })).filter(inRange(from, to)),
    totals: ["Amount (RWF)"],
    columns: [
      { header: "Date", value: (r: any) => r.created, format: "date" },
      { header: "Employee", value: (r: any) => name(r, "employee"), width: 24 },
      { header: "Account", value: (r: any) => name(r, "account") },
      { header: "Amount (RWF)", value: (r: any) => Number(r.amount) || 0, format: "money" },
      { header: "Status", value: (r: any) => cap(r.status) },
      { header: "Approved by", value: (r: any) => name(r, "approved_by") },
      { header: "Notes", value: (r: any) => r.notes || r.rejected_reason || "", width: 34 },
    ],
  }),

  expenses: (): TableExport => ({
    title: "Staff expense requests", fileName: "staff-expenses", what: "prepayments", orientation: "landscape",
    rows: () => pocketbase.collection("prepayments").getFullList({ sort: "-date", expand: "employee,expenseCategory,account,approved_by" }),
    totals: ["Amount (RWF)"],
    columns: [
      { header: "Date", value: (r: any) => r.date || r.created, format: "date" },
      { header: "Employee", value: (r: any) => name(r, "employee"), width: 24 },
      { header: "Category", value: (r: any) => name(r, "expenseCategory") },
      { header: "Account", value: (r: any) => name(r, "account") },
      { header: "Amount (RWF)", value: (r: any) => Number(r.amount) || 0, format: "money" },
      { header: "Description", value: (r: any) => r.description || "", width: 34 },
      { header: "Mobile money", value: (r: any) => [r.momoNumber, r.momoName].filter(Boolean).join(" · ") },
      { header: "Status", value: (r: any) => cap(r.status) },
      { header: "Approved by", value: (r: any) => name(r, "approved_by") },
    ],
  }),

  vehicleRequests: (): TableExport => ({
    title: "Vehicle requests", fileName: "vehicle-requests", what: "CarRequests", orientation: "landscape",
    rows: () => pocketbase.collection("CarRequests").getFullList({ sort: "-start", expand: "employee,car,approved_by" }),
    totals: ["Km", "Expenses (RWF)"],
    columns: [
      { header: "From", value: (r: any) => r.start || r.startTime, format: "date" },
      { header: "To", value: (r: any) => r.end || r.endTime, format: "date" },
      { header: "Requested by", value: (r: any) => name(r, "employee"), width: 22 },
      { header: "Vehicle", value: (r: any) => (r.expand?.car ? `${r.expand.car.carName} ${r.expand.car.plateNumber || ""}` : "") },
      { header: "Route", value: (r: any) => [r.fromLocation, r.toLocation].filter(Boolean).join(" → "), width: 26 },
      { header: "Purpose", value: (r: any) => r.purpose || "", width: 28 },
      { header: "Passengers", value: (r: any) => r.passengerCount || "", format: "number" },
      { header: "Km", value: (r: any) => Number(r.totalKm) || 0, format: "number" },
      { header: "Expenses (RWF)", value: (r: any) => Number(r.totalExpenses || r.expense_amount) || 0, format: "money" },
      { header: "Status", value: (r: any) => cap(r.status) },
    ],
  }),

  assetRequests: (): TableExport => ({
    title: "Equipment requests", fileName: "equipment-requests", what: "assets_requests",
    rows: () => pocketbase.collection("assets_requests").getFullList({ sort: "-created", expand: "asset,requested_by,approved_by" }),
    columns: [
      { header: "Date", value: (r: any) => r.created, format: "date" },
      { header: "Requested by", value: (r: any) => name(r, "requested_by"), width: 24 },
      { header: "Equipment", value: (r: any) => (r.expand?.asset ? `${r.expand.asset.code || ""} ${r.expand.asset.name}` : ""), width: 28 },
      { header: "Status", value: (r: any) => cap(r.status) },
      { header: "Approved by", value: (r: any) => name(r, "approved_by") },
      { header: "Notes", value: (r: any) => r.notes || r.rejected_reason || "", width: 30 },
    ],
  }),

  assetAllocations: (): TableExport => ({
    title: "Equipment allocations", fileName: "equipment-allocations", what: "assets_allocations",
    rows: () => pocketbase.collection("assets_allocations").getFullList({ sort: "-assigned_at", expand: "assigned_to" }),
    columns: [
      { header: "Code", value: (r: any) => r.code || "" },
      { header: "Equipment", value: (r: any) => r.name || "", width: 26 },
      { header: "Serial number", value: (r: any) => r.serial_number || "" },
      { header: "Type", value: (r: any) => r.type || "" },
      { header: "Assigned to", value: (r: any) => name(r, "assigned_to"), width: 22 },
      { header: "Assigned on", value: (r: any) => r.assigned_at, format: "date" },
      { header: "Status", value: (r: any) => cap(r.status) },
    ],
  }),

  pettyAccounts: (): TableExport => ({
    title: "Petty cash accounts", fileName: "petty-cash-accounts", what: "accounts", permission: ["view_petty_cash_accounts", "manage_bank_accounts"],
    rows: () => pocketbase.collection("accounts").getFullList({ sort: "name" }),
    totals: ["Balance (RWF)"],
    columns: [
      { header: "Account", value: (r: any) => r.name, width: 28 },
      { header: "Description", value: (r: any) => r.description || "", width: 34 },
      { header: "Balance (RWF)", value: (r: any) => Number(r.currentBalance) || 0, format: "money" },
      { header: "Status", value: (r: any) => cap(r.status) },
    ],
  }),

  actionPlans: (): TableExport => ({
    title: "Action plans", fileName: "action-plans", what: "actionPlans", orientation: "landscape",
    rows: () => pocketbase.collection("actionPlans").getFullList({ sort: "-start_date", expand: "department_id,staff_id" }),
    columns: [
      { header: "Title", value: (r: any) => r.title || "", width: 32 },
      { header: "Scope", value: (r: any) => cap(r.scope) },
      { header: "Department", value: (r: any) => name(r, "department_id"), width: 24 },
      { header: "Staff", value: (r: any) => name(r, "staff_id") },
      { header: "Start", value: (r: any) => r.start_date, format: "date" },
      { header: "End", value: (r: any) => r.end_date, format: "date" },
      { header: "Priority", value: (r: any) => cap(r.priority) },
      { header: "Status", value: (r: any) => cap(r.status) },
      { header: "Progress %", value: (r: any) => Number(r.progress) || 0, format: "percent" },
    ],
  }),

  weeklyPlans: (): TableExport => ({
    title: "Weekly plans", fileName: "weekly-plans", what: "weeklyPlans", orientation: "landscape",
    rows: () => pocketbase.collection("weeklyPlans").getFullList({ sort: "-created", expand: "department,branch" }),
    columns: [
      { header: "Reference", value: (r: any) => r.reference_number || "" },
      { header: "Partner", value: (r: any) => r.client_name || "", width: 24 },
      { header: "Engagement", value: (r: any) => r.engagement_title || "", width: 30 },
      { header: "Status", value: (r: any) => cap(r.engagement_status) },
      { header: "Manager", value: (r: any) => r.manager || "" },
      { header: "Team leader", value: (r: any) => r.team_leader || "" },
      { header: "Deadline", value: (r: any) => r.engagement_contractual_deadline || r.firm_deadline, format: "date" },
      { header: "Department", value: (r: any) => name(r, "department") },
    ],
  }),

  appraisals: (): TableExport => ({
    title: "Performance evaluations", fileName: "performance-evaluations", what: "perfomance_evaluations",
    rows: () => pocketbase.collection("perfomance_evaluations").getFullList({ sort: "-created", expand: "employee,created_by" }),
    columns: [
      { header: "Employee", value: (r: any) => name(r, "employee"), width: 24 },
      { header: "Month", value: (r: any) => r.period_month || "" },
      { header: "Year", value: (r: any) => r.period_year || "" },
      { header: "Score", value: (r: any) => Number(r.score) || 0, format: "number" },
      { header: "Evaluated by", value: (r: any) => name(r, "created_by") },
      { header: "Comment", value: (r: any) => r.comment || "", width: 40 },
    ],
  }),
};
