/**
 * Financial statements and management figures from the general ledger (server: pocketbase/pb_hooks/lib/statements.js):
 * financial position, financial performance, cash flow (direct method), donor report and the month-by-month trend.
 */
import pocketbase from "@/lib/pocketbase";

export interface StatementLine {
  account: string;
  code: string;
  name: string;
  amount: number;
  compare: number;
  detail?: StatementLine[];
}
export interface StatementGroup {
  code: string;
  name: string;
  lines: StatementLine[];
  total: number;
  compare: number;
}
export interface FinancialPosition {
  as_at: string;
  compare_at: string;
  fy_start: string;
  sections: { key: string; label: string; groups: StatementGroup[]; total: number; compare: number }[];
  totals: { assets: number; liabilities: number; net_assets: number; compare_assets: number; compare_liabilities: number; compare_net_assets: number };
  balanced: boolean;
  generated_at: string;
}
export interface FinancialPerformance {
  from: string;
  to: string;
  fy_start: string;
  revenue: StatementGroup[];
  expenses: StatementGroup[];
  totals: { revenue: number; revenue_ytd: number; expenses: number; expenses_ytd: number; surplus: number; surplus_ytd: number };
  generated_at: string;
}
export interface FlowLine {
  key: string;
  label: string;
  amount: number;
}
export interface CashFlow {
  from: string;
  to: string;
  fy_start: string;
  receipts: FlowLine[];
  payments: FlowLine[];
  operating: number;
  investing: FlowLine[];
  investing_total: number;
  financing: FlowLine[];
  financing_total: number;
  net: number;
  opening: number;
  closing: number;
  reconciles: boolean;
  generated_at: string;
}
export interface DonorReport {
  funding_source: { id: string; code: string; name: string; type: string; donor: string; agreement: string; restricted: boolean; start: string; end: string };
  from: string;
  to: string;
  fy_start: string;
  opening: number;
  /** Unspent funds brought in at go-live (part of the opening). */
  brought_in: number;
  received: number;
  /** Grants the fund expects this fiscal year (its revenue budget lines). */
  expected: number;
  spent: number;
  closing: number;
  receipts: { code: string; name: string; amount: number }[];
  lines: { line: string; code: string; name: string; account: string; spent: number; budget?: number; committed?: number; actual_ytd?: number; available?: number; used_pct?: number; status?: "green" | "amber" | "red"; unbudgeted?: boolean; depreciation?: boolean }[];
  projects: { project: string; code: string; name: string; spent: number }[];
  accounts: { code: string; name: string; balance: number }[];
  cash: number;
  generated_at: string;
}
export interface Trend {
  to: string;
  fy_start: string;
  months: { month: string; label: string; revenue: number; expenses: number; surplus: number; cash: number }[];
}

const qs = (f: Record<string, string>) => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
const get = <T>(name: string, f: Record<string, string>) => pocketbase.send(`/api/ims/statements/${name}?${qs(f)}`, {}) as Promise<T>;

export const statementsApi = {
  position: (asAt: string) => get<FinancialPosition>("financial-position", { as_at: asAt }),
  performance: (f: Record<string, string>) => get<FinancialPerformance>("financial-performance", f),
  cashFlow: (f: Record<string, string>) => get<CashFlow>("cash-flow", f),
  donor: (f: Record<string, string>) => get<DonorReport>("donor", f),
  trend: (to = "") => get<Trend>("trend", { to }),
};

/** Who may open the statements (summary figures; the ledger detail stays with the finance team). */
export const STATEMENT_VIEW = ["view_financial_reports", "view_journals", "approve_journals", "close_periods", "export_ledger"];
