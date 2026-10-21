/**
 * General ledger client: journal statuses and types, where a journal came from, and the posting accounts
 * (which GL account each automatic posting uses). Server rules live in pocketbase/pb_hooks/lib/ledger.js.
 */
import pocketbase from "@/lib/pocketbase";
import type { Tone } from "@/lib/procurement";
import { DOCUMENT_LINKS } from "@/lib/ims";

export const JOURNAL_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Waiting for approval", tone: "warning" },
  returned: { label: "Returned", tone: "warning" },
  posted: { label: "Posted", tone: "success" },
  reversed: { label: "Reversed", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
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
  payment_voucher: "Payment voucher",
  cash_receipt: "Receipt",
  bank_transfer: "Transfer",
  bank_charge: "Bank charge",
  depreciation_run: "Depreciation",
  asset_disposal: "Asset disposal",
  asset: "Asset capitalisation",
  asset_opening: "Opening asset register",
  manual: "Manual journal",
};

const LINKS: Record<string, (id: string) => string> = { ...DOCUMENT_LINKS, payroll_payment: (id) => `/dashboard/hr/payroll/${id}` };
export const sourceLink = (type?: string, id?: string) => (type && id && LINKS[type] ? LINKS[type](id) : "");

export interface PostingAccount {
  key: string;
  label: string;
  module: string;
  default_code: string;
  sort: number;
  configured: boolean;
  account: { id: string; code: string; name: string } | null;
}

export const ledgerApi = {
  postingAccounts: () => (pocketbase.send("/api/ims/ledger/posting-accounts", {}) as Promise<{ items: PostingAccount[] }>).then((r) => r.items),
};
