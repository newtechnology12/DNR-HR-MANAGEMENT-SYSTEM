/**
 * Payables (IMS M4): payment vouchers and payables reports. Rules: pocketbase/pb_hooks/lib/vouchers.js.
 */
import pocketbase from "@/lib/pocketbase";
import type { Tone } from "@/lib/procurement";

export const VOUCHER_STATUS: Record<string, { label: string; tone: Tone; note?: string }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  returned: { label: "Returned", tone: "violet" },
  approved: { label: "Approved", tone: "success", note: "To be paid" },
  paid: { label: "Completed", tone: "success", note: "Paid" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const VOUCHER_TYPES: Record<string, { label: string; hint: string }> = {
  invoice: { label: "Supplier invoices", hint: "Pays approved invoices of one supplier (after the three-way match)" },
  direct: { label: "Direct expense", hint: "A payment without a purchase order, charged to a budget line" },
};

export const BANK_LABELS: [string, string][] = [
  ["bank_name", "Bank"],
  ["bank_branch", "Branch"],
  ["bank_account_name", "Account name"],
  ["bank_account_number", "Account number"],
  ["swift_code", "SWIFT / BIC"],
];

export interface PayableInvoice {
  id: string;
  number: string;
  supplier_invoice_number: string;
  invoice_date: string;
  due_date: string;
  total: number;
  subtotal: number;
  balance: number;
  held: number;
  open: number;
  budget_line: string;
}

export interface ServerReport {
  key: string;
  title: string;
  columns: { key: string; label: string; type: string }[];
  rows: Record<string, any>[];
  totals: Record<string, number>;
  note: string;
  generated_at: string;
}

const qs = (params: Record<string, unknown>) =>
  new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => [k, String(v)])).toString();

export const payablesApi = {
  payable: (supplier: string, voucher?: string) => pocketbase.send(`/api/ims/vouchers/payable?${qs({ supplier, voucher })}`, {}) as Promise<{ items: PayableInvoice[] }>,
  action: (id: string, action: "submit" | "pay" | "cancel", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/ims/vouchers/${id}/${action}`, { method: "POST", body }) as Promise<{ id?: string; status?: string; approval?: string; payments?: string[] }>,
  report: (key: string, f: Record<string, string>) => pocketbase.send(`/api/ims/payables/reports/${key}?${qs(f)}`, {}) as Promise<ServerReport>,
};

/** Withholding tax codes from the dated tax table (Setup → Tax & statutory rates). */
export async function withholdingRates() {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await pocketbase.collection("tax_rates").getFullList({ filter: `category = "withholding" && active = true`, sort: "code,-effective_from" });
  const seen = new Set<string>();
  return rows
    .filter((r: any) => String(r.effective_from).slice(0, 10) <= today && (!r.effective_to || String(r.effective_to).slice(0, 10) >= today))
    .filter((r: any) => (seen.has(r.code) ? false : (seen.add(r.code), true))) as any[];
}
