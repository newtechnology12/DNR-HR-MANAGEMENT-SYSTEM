/**
 * Bank and cash management (IMS M5): accounts and cash books, receipts, transfers, statement import and
 * matching, bank reconciliation, treasury reports. Rules: pocketbase/pb_hooks/lib/treasury.js.
 */
import pocketbase from "@/lib/pocketbase";
import type { Tone } from "@/lib/procurement";
import type { ServerReport } from "@/lib/payables";

export const TREASURY_DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Waiting for the DAF", tone: "warning" },
  returned: { label: "Returned", tone: "warning" },
  approved: { label: "Posted", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
  reversed: { label: "Reversed", tone: "danger" },
};

export const REC_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Being prepared", tone: "neutral" },
  pending_approval: { label: "Waiting for the DAF", tone: "warning" },
  returned: { label: "Returned", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};

export const STATEMENT_STATUS: Record<string, { label: string; tone: Tone }> = {
  imported: { label: "Imported", tone: "info" },
  reconciled: { label: "Reconciled", tone: "success" },
};

export const METHOD_LABELS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  mobile_money: "Mobile money",
  cash: "Cash",
  direct_deposit: "Direct deposit",
  direct_debit: "Direct debit",
  cash_withdrawal: "Cash withdrawal",
  cash_deposit: "Cash deposit",
  other: "Other",
};
export const RECEIPT_METHODS = ["bank_transfer", "cheque", "mobile_money", "direct_deposit", "cash"];

export const PAYER_TYPES: Record<string, string> = {
  member: "Member (district / City of Kigali)",
  government: "Government",
  donor: "Development partner",
  client: "Client (fees for services)",
  staff: "Staff (refund, advance)",
  other: "Other",
};

export const ENTRY_TYPES: Record<string, string> = {
  receipt: "Receipt",
  payment: "Payment",
  transfer_in: "Transfer in",
  transfer_out: "Transfer out",
  bank_charge: "Bank charge",
  interest: "Interest",
  other: "Other",
};

export const FOLLOW_UP: Record<string, { label: string; tone: Tone; hint: string }> = {
  timing: { label: "Timing difference", tone: "info", hint: "Clears on the next statement (cheque not yet presented, deposit in transit)" },
  record: { label: "To record", tone: "warning", hint: "Missing in the cash book: the Cashier or Accountant records it" },
  investigate: { label: "To investigate", tone: "warning", hint: "Unknown item: being checked with the bank or the payer" },
  correct: { label: "Error to correct", tone: "danger", hint: "A bank or book error that will be corrected" },
  resolved: { label: "Resolved", tone: "success", hint: "Explained; no further action" },
};

/** Methods allowed between two kinds of account (bank → cash is a withdrawal, cash → bank a deposit). */
export const TRANSFER_METHODS: Record<string, string[]> = {
  "bank>bank": ["bank_transfer", "cheque"],
  "bank>cash": ["cash_withdrawal", "cheque"],
  "cash>bank": ["cash_deposit"],
};

export interface TreasuryAccount {
  id: string;
  code: string;
  name: string;
  kind: "bank" | "cash";
  bank_name: string;
  branch: string;
  account_number: string;
  account_name: string;
  status: string;
  is_default: boolean;
  funding_source: string;
  funding_name: string;
  gl_account: string;
  gl_code: string;
  opening_balance: number;
  opening_date: string;
  book_balance: number;
  statement_balance: number;
  statement_date: string;
  reconciled_to: string;
  reconciled_balance: number;
  unmatched_book: number;
  unmatched_bank: number;
  custodian: string;
  custodian_name: string;
  cash_limit: number;
  last_entry_date: string;
  statement_mapping?: Record<string, any> | null;
}

export interface Position {
  generated_at: string;
  today: string;
  accounts: TreasuryAccount[];
  totals: { total: number; bank: number; cash: number; restricted: number; unrestricted: number };
  months: { month: string; label: string; end: string; total: number; accounts: Record<string, number> }[];
  this_month: { receipts: number; payments: number; charges: number; interest: number; transfers: number };
  pending: { receipts: number; transfers: number; reconciliations: number; drafts: number; to_pay: number };
  due: { id: string; code: string; name: string; kind: string; reconciled_to: string; due: string }[];
}

export interface WorkItem {
  id: string;
  kind: "entry" | "line";
  date: string;
  direction: "in" | "out";
  amount: number;
  reference: string;
  description: string;
  counterparty?: string;
  type?: string;
  method?: string;
  source_type?: string;
  source_id?: string;
  source_number?: string;
  statement?: string;
  line_no?: number;
  reversed?: boolean;
  reversal_of?: string;
  match_group: string;
  match_method: string;
  reconciliation: string;
  follow_up: string;
  follow_up_note: string;
}

export interface RecItem {
  side: "book" | "bank";
  id: string;
  date: string;
  direction: "in" | "out";
  amount: number;
  description: string;
  counterparty: string;
  reference: string;
  type: string;
  method: string;
  source_type: string;
  source_id: string;
  source_number: string;
  matched_later: boolean;
  follow_up: string;
  follow_up_note: string;
  age: number;
  stale: boolean;
}

export interface RecFigures {
  kind: "bank" | "cash";
  as_of: string;
  book_balance: number;
  statement_balance: number;
  statement_balance_computed: number;
  covered: boolean;
  has_statement: boolean;
  statement_through?: string;
  outstanding_receipts: number;
  outstanding_payments: number;
  unrecorded_receipts: number;
  unrecorded_payments: number;
  adjusted_bank_balance: number;
  adjusted_book_balance: number;
  difference: number;
  items: RecItem[];
  warnings: string[];
  last_reconciled?: { id: string; number: string; as_of: string } | null;
}

export interface Workspace {
  account: TreasuryAccount;
  as_of: string;
  entries: WorkItem[];
  lines: WorkItem[];
  matches: { group: string; method: string; matched_at: string; matched_by: string; entries: WorkItem[]; lines: WorkItem[] }[];
  statements: { id: string; number: string; from: string; to: string; opening_balance: number; closing_balance: number; line_count: number; matched_count: number; status: string }[];
  reconciliation: RecFigures;
  open_reconciliation: { id: string; number: string; as_of: string; status: string } | null;
  match_days: number;
}

export interface ImportRow {
  date: string;
  value_date?: string;
  description: string;
  reference: string;
  amount_in: number;
  amount_out: number;
  balance?: number | null;
}

const qs = (params: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();

export const treasuryApi = {
  position: () => pocketbase.send("/api/ims/treasury/position", {}) as Promise<Position>,
  workspace: (account: string, asOf?: string) => pocketbase.send(`/api/ims/treasury/workspace?${qs({ account, as_of: asOf })}`, {}) as Promise<Workspace>,
  preview: (account: string, asOf: string, statementBalance?: number | "") =>
    pocketbase.send(`/api/ims/treasury/reconciliation-preview?${qs({ account, as_of: asOf, statement_balance: statementBalance })}`, {}) as Promise<RecFigures>,
  doc: (kind: "receipts" | "transfers", id: string, action: "submit" | "cancel" | "reverse", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/ims/treasury/${kind}/${id}/${action}`, { method: "POST", body }) as Promise<{ approval?: string; id?: string; status?: string }>,
  rec: (id: string, action: "refresh" | "submit" | "cancel", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/ims/treasury/reconciliations/${id}/${action}`, { method: "POST", body }) as Promise<{ approval?: string; id?: string; status?: string; difference?: number }>,
  importStatement: (body: Record<string, unknown>) =>
    pocketbase.send("/api/ims/treasury/statements/import", { method: "POST", body }) as Promise<{ id: string; number: string; lines: number; matched: number; ambiguous: number; opening: number; closing: number; total_in: number; total_out: number; warnings: string[] }>,
  deleteStatement: (id: string) => pocketbase.send(`/api/ims/treasury/statements/${id}`, { method: "DELETE" }) as Promise<{ number: string; lines: number }>,
  match: (account: string, entries: string[], lines: string[]) => pocketbase.send("/api/ims/treasury/match", { method: "POST", body: { account, entries, lines } }) as Promise<{ group: string }>,
  unmatch: (group: string) => pocketbase.send("/api/ims/treasury/unmatch", { method: "POST", body: { group } }),
  autoMatch: (account: string) => pocketbase.send("/api/ims/treasury/auto-match", { method: "POST", body: { account } }) as Promise<{ matched: number; ambiguous: number }>,
  recordLine: (lineId: string, body: { type: string; gl_account?: string; budget_line?: string; description?: string }) =>
    pocketbase.send(`/api/ims/treasury/statement-lines/${lineId}/record`, { method: "POST", body }) as Promise<{ entry: string }>,
  followUp: (items: { kind: "entry" | "line"; id: string }[], follow_up: string, note = "") =>
    pocketbase.send("/api/ims/treasury/follow-up", { method: "POST", body: { items, follow_up, note } }) as Promise<{ updated: number }>,
  report: (key: string, f: Record<string, string>) => pocketbase.send(`/api/ims/treasury/reports/${key}?${qs(f)}`, {}) as Promise<ServerReport>,
};

/** Active accounts for pickers, with the live book balance. */
export async function activeAccounts(kind?: "bank" | "cash") {
  const rows = await pocketbase.collection("bank_accounts").getFullList({ filter: kind ? `status = "active" && kind = "${kind}"` : `status = "active"`, sort: "kind,code", expand: "funding_source" });
  return rows as any[];
}

export const accountLabel = (a?: { code?: string; name?: string } | null) => (a ? `${a.code} · ${a.name}` : "—");
export const maskNumber = (n?: string) => (n ? n.replace(/\d(?=[\d -]{4})/g, "•") : "");
export const signed = (direction: string, amount: number) => (direction === "in" ? amount : -amount);

export const PERMS = {
  view: ["view_treasury", "manage_treasury", "manage_bank_accounts", "approve_treasury", "record_payments", "prepare_bank_reconciliation", "approve_bank_reconciliation", "export_treasury", "view_audit_logs"],
  export: ["export_treasury", "approve_treasury", "prepare_bank_reconciliation", "approve_bank_reconciliation"],
};
