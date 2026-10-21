/**
 * Budget API client (IMS M2) and shared vocabulary. Rules: pocketbase/pb_hooks/lib/budget.js.
 */
import pocketbase from "@/lib/pocketbase";

export type UseStatus = "green" | "amber" | "red";

export interface BudgetLineUsage {
  id: string;
  code: string;
  name: string;
  kind: "expense" | "capital" | "revenue";
  status: UseStatus;
  account: string;
  gl_account: string;
  department: string;
  department_name: string;
  funding_source: string;
  funding_code: string;
  project: string;
  project_code: string;
  original: number;
  phasing: number[];
  overrides: number;
  budget: number;
  committed: number;
  actual: number;
  available: number;
  used_pct: number;
}

export interface BudgetUsage {
  fiscal_year: { id: string; name: string; code: string };
  thresholds: { amber: number; red: number };
  control: "block" | "warn" | "none";
  scope: string;
  items: BudgetLineUsage[];
  totals: { budget: number; committed: number; actual: number; available: number; used_pct: number };
}

export interface BvaRow {
  key: string;
  label: string;
  kind: string;
  annual_budget: number;
  budget: number;
  actual: number;
  committed: number;
  overrides: number;
  variance: number;
  variance_pct: number;
  execution_pct: number;
}

const qs = (params: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();

export const budgetApi = {
  usage: (params: Record<string, string> = {}) => pocketbase.send(`/api/ims/budget/usage?${qs(params)}`, {}) as Promise<BudgetUsage>,
  bva: (params: Record<string, string | number>) =>
    pocketbase.send(`/api/ims/budget/bva?${qs(params)}`, {}) as Promise<{ fiscal_year: BudgetUsage["fiscal_year"]; from_period: number; to_period: number; period_label: string; group_by: string; rows: BvaRow[]; totals: Omit<BvaRow, "key" | "label" | "kind" | "overrides" | "variance_pct" | "execution_pct"> }>,
  available: (line: string, amount?: number) =>
    pocketbase.send(`/api/ims/budget/available?${qs({ line, amount })}`, {}) as Promise<{ line: { id: string; code: string; name: string }; available: number; sufficient: boolean; status: UseStatus; control: string; budget?: number; committed?: number; actual?: number; used_pct?: number }>,
  ledger: (lineId: string) =>
    pocketbase.send(`/api/ims/budget/lines/${lineId}/ledger`, {}) as Promise<{ figures: Pick<BudgetLineUsage, "budget" | "committed" | "actual" | "available" | "used_pct" | "status">; entries: { id: string; date: string; type: string; amount: number; source_type: string; source_id: string; source_number: string; description: string; override: string }[] }>,
  budgetAction: (id: string, action: "submit" | "cancel", reason?: string) => pocketbase.send(`/api/ims/budgets/${id}/${action}`, { method: "POST", body: { reason } }),
  saveLines: (id: string, lines: Record<string, unknown>[], replace = false) => pocketbase.send(`/api/ims/budgets/${id}/lines`, { method: "POST", body: { lines, replace } }) as Promise<{ saved: number }>,
  revisionAction: (id: string, action: "submit" | "cancel", reason?: string) => pocketbase.send(`/api/ims/budget-revisions/${id}/${action}`, { method: "POST", body: { reason } }),
  override: (document_type: string, document_id: string, reason: string) => pocketbase.send("/api/ims/budget/overrides", { method: "POST", body: { document_type, document_id, reason } }),
};

export const KIND_LABEL: Record<string, string> = { expense: "Expense", capital: "Capital", revenue: "Revenue" };
export const REVISION_TYPES: Record<string, { label: string; hint: string }> = {
  supplementary: { label: "Supplementary budget", hint: "Increases one or more lines (new money)" },
  reduction: { label: "Reduction", hint: "Decreases lines (never below what is committed or spent)" },
  virement: { label: "Virement", hint: "Moves money between lines — increases equal decreases" },
  rephasing: { label: "Re-phasing", hint: "Changes the monthly spread, not the annual amount" },
};
export const LEDGER_TYPE: Record<string, string> = {
  commitment: "Commitment",
  commitment_release: "Commitment released",
  actual: "Actual",
  actual_reversal: "Actual reversed",
};
export const SOURCE_LINK: Record<string, (id: string) => string> = {
  purchase_order: (id) => `/dashboard/procurement/purchase-orders/${id}`,
  supplier_invoice: (id) => `/dashboard/finance/invoices/${id}`,
  purchase_requisition: (id) => `/dashboard/procurement/requisitions/${id}`,
  payment_voucher: (id) => `/dashboard/finance/vouchers/${id}`,
};
export const MONTHS_FY = ["Jul", "Aug", "Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun"];

/** Reserved status palette (data-viz reference): never used for series; always shown with an icon and a label. */
export const STATUS_COLOR: Record<UseStatus, string> = { green: "#0ca30c", amber: "#fab219", red: "#d03b3b" };
export const STATUS_LABEL: Record<UseStatus, string> = { green: "On track", amber: "Watch", red: "Critical" };
/** Categorical slots 1–2 for actual / committed; available is a neutral track. */
export const SERIES = { actual: "#2a78d6", committed: "#eb6834", track: "#e7e5e4" };
