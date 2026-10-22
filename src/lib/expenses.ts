/**
 * Staff expenses and salary advances (collection `prepayments`): what staff ask for, how it is approved (head of
 * department → DAF) and how the Cashier pays it from a cash book. Server rules in pocketbase/pb_hooks/lib/expenses.js.
 */
import pocketbase from "@/lib/pocketbase";
import type { Tone } from "@/lib/procurement";
import type { StatusWord } from "@/components/ims";

/** Status → glossary word, with the detail shown under the pill. */
export const EXPENSE_STATUS: Record<string, { label: StatusWord; tone: Tone; note?: string }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  returned: { label: "Returned", tone: "warning" },
  approved: { label: "Approved", tone: "info", note: "To be paid" },
  paid: { label: "Completed", tone: "success", note: "Paid" },
  recovered: { label: "Completed", tone: "success", note: "Recovered through payroll" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
export const EXPENSE_WORD: Record<string, StatusWord> = Object.fromEntries(Object.entries(EXPENSE_STATUS).map(([k, v]) => [k, v.label]));

export const EXPENSE_KIND: Record<string, string> = { claim: "Expense claim", advance: "Salary advance" };
export const PAY_BY: Record<string, string> = { mobile_money: "Mobile money", cash: "Cash", bank_transfer: "Bank transfer" };
export const MOMO_RE = /^(\+?250|0)?7[2389]\d{7}$/;

export interface ExpenseCategory {
  id: string;
  name: string;
  description: string;
  kind: "claim" | "advance";
  gl_account: string;
  max_amount: number;
  active: boolean;
}

export interface ExpenseInput {
  category: string;
  amount: number;
  date: string;
  description: string;
  pay_by: string;
  momoNumber?: string;
  momoName?: string;
}

const send = <T = any>(path: string, body?: Record<string, unknown>) => pocketbase.send(path, { method: "POST", body: body || {} }) as Promise<T>;
type Result = { id: string; number: string; status: string };

export const expensesApi = {
  create: (body: ExpenseInput) => send<Result>("/api/ims/staff-expenses", body as unknown as Record<string, unknown>),
  update: (id: string, body: ExpenseInput) => send<Result>(`/api/ims/staff-expenses/${id}/update`, body as unknown as Record<string, unknown>),
  cancel: (id: string, reason: string) => send<Result>(`/api/ims/staff-expenses/${id}/cancel`, { reason }),
  pay: (id: string, body: { account: string; method: string; date: string; reference: string }) => send<Result>(`/api/ims/staff-expenses/${id}/pay`, body),
  attach: (id: string, files: File[]) => {
    const fd = new FormData();
    for (const f of files) fd.append("files", f);
    return pocketbase.send(`/api/ims/attachments/prepayments/${id}`, { method: "POST", body: fd }) as Promise<{ files: string[] }>;
  },
  categories: () => pocketbase.collection("expenses_categories").getFullList<ExpenseCategory>({ filter: "active = true", sort: "kind,name" }),
};

/** Who follows every request (the finance list); heads of department reach theirs through the approvals. */
export const EXPENSE_FINANCE = ["view_expenses", "view_employee_prepayments", "record_payments", "approve_or_reject_expense"];
