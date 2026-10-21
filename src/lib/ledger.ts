/**
 * General ledger client: journal statuses and types, where a journal came from, the posting accounts, manual and
 * recurring journals, the trial balance, the account ledger and the period close. Server rules live in
 * pocketbase/pb_hooks/lib/{ledger,gl,glpost}.js.
 */
import pocketbase from "@/lib/pocketbase";
import type { Tone } from "@/lib/procurement";
import type { StatusWord } from "@/components/ims";
import { DOCUMENT_LINKS } from "@/lib/ims";

export const JOURNAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Waiting for approval", tone: "warning" },
  returned: { label: "Returned", tone: "warning" },
  posted: { label: "Posted", tone: "success" },
  reversed: { label: "Reversed", tone: "danger" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

/** Journal statuses in the IMS status glossary (the detail — "Posted", "Reversed by …" — goes under the pill). */
export const JOURNAL_WORD: Record<string, StatusWord> = {
  draft: "Draft", pending_approval: "Pending approval", returned: "Returned", posted: "Approved", reversed: "Cancelled", rejected: "Rejected", cancelled: "Cancelled",
};

export const JOURNAL_TYPES: Record<string, string> = {
  automatic: "Automatic",
  manual: "Manual",
  recurring: "Recurring",
  reversal: "Reversal",
  opening: "Opening balances",
};

/** What posted the journal (source_type). */
export const JOURNAL_SOURCES: Record<string, string> = {
  payroll: "Payroll",
  payroll_payment: "Salary payment",
  supplier_invoice: "Supplier invoice",
  payment_voucher: "Payment voucher",
  cash_receipt: "Receipt",
  bank_transfer: "Transfer",
  statement_line: "Bank statement line",
  bank_opening: "Bank opening balance",
  depreciation_run: "Depreciation",
  asset_disposal: "Asset disposal",
  asset: "Asset capitalisation",
  asset_opening: "Opening asset register",
  manual: "Manual journal",
};

const LINKS: Record<string, (id: string) => string> = {
  ...DOCUMENT_LINKS,
  payroll_payment: (id) => `/dashboard/hr/payroll/${id}`,
  bank_opening: (id) => `/dashboard/treasury/accounts/${id}`,
};
export const sourceLink = (type?: string, id?: string) => (type && id && LINKS[type] ? LINKS[type](id) : "");

export const ACCOUNT_TYPES: Record<string, string> = { asset: "Assets", liability: "Liabilities", net_assets: "Net assets", revenue: "Revenue", expense: "Expenses" };
export const TYPE_ORDER = ["asset", "liability", "net_assets", "revenue", "expense"];

export interface PostingAccount {
  key: string;
  label: string;
  module: string;
  default_code: string;
  sort: number;
  configured: boolean;
  account: { id: string; code: string; name: string } | null;
}

export interface JournalLineInput {
  account: string;
  debit: number | "";
  credit: number | "";
  description: string;
  department: string;
  funding_source: string;
  project: string;
}

export interface TrialBalanceRow {
  account: string;
  code: string;
  name: string;
  type: string;
  section: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  opening_dr: number;
  opening_cr: number;
  closing_dr: number;
  closing_cr: number;
}
export interface TrialBalance {
  from: string;
  to: string;
  fy_start: string;
  rows: TrialBalanceRow[];
  totals: { opening_dr: number; opening_cr: number; debit: number; credit: number; closing_dr: number; closing_cr: number };
  balanced: boolean;
  generated_at: string;
}
export interface AccountLedger {
  account: { id: string; code: string; name: string; type: string };
  from: string;
  to: string;
  opening: number;
  debit: number;
  credit: number;
  closing: number;
  truncated: boolean;
  rows: { id: string; date: string; journal: string; number: string; journal_type: string; source_type: string; source_id: string; source_number: string; description: string; department: string; funding: string; project: string; debit: number; credit: number; balance: number }[];
}
export interface CheckItem {
  key: string;
  label: string;
  state: "ok" | "fail" | "warn";
  detail: string;
  link: string;
  blocking: boolean;
}
export interface PeriodInfo {
  id: string;
  name: string;
  code: string;
  number: number;
  start: string;
  end: string;
  status: "open" | "closed";
  fiscal_year: string;
  fiscal_year_name: string;
  closed_by: string;
  closed_at: string;
  close_note: string;
  reopened_by: string;
  reopened_at: string;
  reopen_reason: string;
  checklist: CheckItem[] | null;
  blocking: number | null;
  warnings: number | null;
  close_checklist: CheckItem[] | null;
}
export interface ReopenRequest {
  id: string;
  number: string;
  period: string;
  period_name: string;
  reason: string;
  status: string;
  requested_by: string;
  created: string;
  approval: string;
}

const qs = (f: Record<string, string>) => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
const send = <T = any>(path: string, body?: Record<string, unknown>) => pocketbase.send(path, { method: "POST", body: body || {} }) as Promise<T>;

export const ledgerApi = {
  postingAccounts: () => (pocketbase.send("/api/ims/ledger/posting-accounts", {}) as Promise<{ items: PostingAccount[] }>).then((r) => r.items),
  createJournal: (body: Record<string, unknown>) => send<{ id: string; number: string; status: string }>("/api/ims/journals", body),
  journal: (id: string, action: "update" | "submit" | "cancel" | "reverse", body?: Record<string, unknown>) => send<{ id: string; number: string; status: string }>(`/api/ims/journals/${id}/${action}`, body),
  createRecurring: (body: Record<string, unknown>) => send<{ id: string }>("/api/ims/recurring-journals", body),
  updateRecurring: (id: string, body: Record<string, unknown>) => send<{ id: string }>(`/api/ims/recurring-journals/${id}/update`, body),
  generate: (id?: string) => send<{ created: { id: string; number: string; date: string; template: string }[]; problems: string[] }>(id ? `/api/ims/recurring-journals/${id}/generate` : "/api/ims/recurring-journals/generate"),
  trialBalance: (f: Record<string, string>) => pocketbase.send(`/api/ims/ledger/trial-balance?${qs(f)}`, {}) as Promise<TrialBalance>,
  account: (id: string, f: Record<string, string>) => pocketbase.send(`/api/ims/ledger/account/${id}?${qs(f)}`, {}) as Promise<AccountLedger>,
  periods: () => pocketbase.send("/api/ims/ledger/periods", {}) as Promise<{ periods: PeriodInfo[]; reopen_requests: ReopenRequest[]; today: string }>,
  period: (id: string) => pocketbase.send(`/api/ims/ledger/periods/${id}`, {}) as Promise<PeriodInfo>,
  closePeriod: (id: string, note: string) => send(`/api/ims/ledger/periods/${id}/close`, { note }),
  reopenPeriod: (id: string, reason: string) => send<{ number: string }>(`/api/ims/ledger/periods/${id}/reopen`, { reason }),
  cancelReopen: (id: string, reason: string) => send(`/api/ims/period-reopen/${id}/cancel`, { reason }),
  backfill: () => send<{ bank_openings: number; invoices: number; vouchers: number; cash_documents: number; reversals: number; linked: number; problems: string[] }>("/api/ims/ledger/backfill"),
};

/** Who may open the ledger pages. */
export const LEDGER_VIEW = ["view_journals", "manage_journals", "approve_journals", "export_ledger", "close_periods", "reopen_periods"];
