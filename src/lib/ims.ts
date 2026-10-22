/**
 * RALGA IMS API client: identity and merged permissions, sign-in security, permission-matrix
 * changes, master data actions and health. Server rules live in pocketbase/pb_hooks/ims.pb.js.
 */
import pocketbase from "@/lib/pocketbase";
import catalog from "@/lib/permission-catalog.json";
import roleFile from "@/lib/ims-roles.json";

export interface PermissionDef {
  name: string;
  title: string;
}
export interface PermissionGroup {
  key: string;
  module: string;
  title: string;
  permissions: PermissionDef[];
}
export const PERMISSION_GROUPS = catalog.groups as PermissionGroup[];
export const PERMISSION_TITLES: Record<string, string> = Object.fromEntries(PERMISSION_GROUPS.flatMap((g) => g.permissions.map((p) => [p.name, p.title])));

export interface RoleDef {
  code: string;
  name: string;
  group: string;
  icon: string;
  sort: number;
  description: string;
  highlights: string[];
}
export const ROLE_DEFS = (roleFile.roles as RoleDef[]).slice().sort((a, b) => a.sort - b.sort);
export const ROLE_GROUPS = roleFile.groups as { key: string; title: string }[];
export const DEMO_ACCOUNTS = roleFile.demo_accounts as { code: string; email: string; name: string; designation: string; dept: string }[];
export const DEMO_PASSWORD = roleFile.demo_password as string;
export const roleDef = (code?: string) => ROLE_DEFS.find((r) => r.code === code);

export interface ImsMe {
  id: string;
  roles: { id: string; name: string; code: string }[];
  permissions: string[];
  scope: "own" | "department" | "all";
  security: {
    totp_enabled: boolean;
    two_factor_required: boolean;
    must_enroll_2fa: boolean;
    last_login_at: string;
    recovery_codes_left: number;
  };
  session_timeout_minutes: number;
  password_min_length: number;
}

export const DOCUMENT_TYPE_LABELS: Record<string, string> = {
  purchase_requisition: "Purchase requisition",
  purchase_order: "Purchase order",
  supplier_invoice: "Supplier invoice",
  supplier: "Supplier registration",
  purchase_return: "Purchase return",
  contract: "Contract",
  procurement_plan: "Procurement plan",
  payroll: "Payroll",
  budget: "Budget",
  budget_revision: "Budget revision",
  supplier_bank_change: "Supplier bank details change",
  payment_voucher: "Payment voucher",
  journal_entry: "Journal entry",
  period_reopen: "Re-opening a closed month",
  staff_expense: "Staff expense or advance",
  asset_disposal: "Asset disposal",
  asset_transfer: "Asset transfer",
  depreciation_run: "Monthly depreciation",
  bank_reconciliation: "Bank reconciliation",
  cash_receipt: "Receipt",
  bank_transfer: "Inter-account transfer",
};

/** Where an approval's document opens, by document type. */
export const DOCUMENT_LINKS: Record<string, (id: string) => string> = {
  purchase_requisition: (id) => `/dashboard/procurement/requisitions/${id}`,
  purchase_order: (id) => `/dashboard/procurement/purchase-orders/${id}`,
  supplier_invoice: (id) => `/dashboard/finance/invoices/${id}`,
  supplier: (id) => `/dashboard/procurement/suppliers/${id}`,
  purchase_return: (id) => `/dashboard/procurement/returns/${id}`,
  contract: (id) => `/dashboard/procurement/contracts/${id}`,
  procurement_plan: (id) => `/dashboard/procurement/plans/${id}`,
  payroll: (id) => `/dashboard/hr/payroll/${id}`,
  budget: (id) => `/dashboard/budget/budgets/${id}`,
  budget_revision: (id) => `/dashboard/budget/revisions/${id}`,
  supplier_bank_change: (id) => `/dashboard/procurement/bank-changes/${id}`,
  payment_voucher: (id) => `/dashboard/finance/vouchers/${id}`,
  cash_receipt: (id) => `/dashboard/treasury/receipts/${id}`,
  bank_transfer: (id) => `/dashboard/treasury/transfers/${id}`,
  bank_reconciliation: (id) => `/dashboard/treasury/reconciliations/${id}`,
  asset_transfer: (id) => `/dashboard/assets/transfers?open=${id}`,
  asset_disposal: (id) => `/dashboard/assets/disposals/${id}`,
  depreciation_run: (id) => `/dashboard/assets/depreciation/${id}`,
  asset: (id) => `/dashboard/assets/register/${id}`,
  journal_entry: (id) => `/dashboard/finance/journals/${id}`,
  period_reopen: () => "/dashboard/finance/periods",
  staff_expense: (id) => `/dashboard/finance/staff-expenses/${id}`,
};

const qs = (params: Record<string, unknown>) =>
  new URLSearchParams(
    Object.entries(params)
      .filter(([, v]) => v !== undefined && v !== null && v !== "")
      .map(([k, v]) => [k, String(v)])
  ).toString();

export const imsApi = {
  me: () => pocketbase.send("/api/ims/me", {}) as Promise<ImsMe>,

  // two-factor authentication (self-service)
  setup2fa: () => pocketbase.send("/api/ims/security/2fa/setup", { method: "POST" }) as Promise<{ secret: string; otpauth: string }>,
  enable2fa: (code: string) => pocketbase.send("/api/ims/security/2fa/enable", { method: "POST", body: { code } }) as Promise<{ recovery_codes: string[] }>,
  disable2fa: (code: string) => pocketbase.send("/api/ims/security/2fa/disable", { method: "POST", body: { code } }),

  // account administration
  securityUsers: () => pocketbase.send("/api/ims/security/users", {}) as Promise<{ items: AccountSecurity[] }>,
  accountAction: (userId: string, action: "unlock" | "reset-2fa", reason: string) =>
    pocketbase.send(`/api/ims/security/users/${userId}/${action}`, { method: "POST", body: { reason } }),

  // permission matrix (maker–checker)
  proposeChanges: (body: { changes: { role: string; permission: string; access: boolean }[]; scope_changes?: { role: string; field: string; value: string }[]; reason: string }) =>
    pocketbase.send("/api/ims/roles/changes", { method: "POST", body }) as Promise<{ id: string; status: string; changes: number }>,
  decideChange: (id: string, decision: "approve" | "reject", comment: string) =>
    pocketbase.send(`/api/ims/roles/changes/${id}/decide`, { method: "POST", body: { decision, comment } }),
  withdrawChange: (id: string) => pocketbase.send(`/api/ims/roles/changes/${id}/cancel`, { method: "POST" }),

  // master data
  createFiscalYear: (start_year: number, make_current: boolean) => pocketbase.send("/api/ims/fiscal-years", { method: "POST", body: { start_year, make_current } }),
  setCurrentFiscalYear: (id: string) => pocketbase.send(`/api/ims/fiscal-years/${id}/current`, { method: "POST" }),
  currentPeriod: () =>
    pocketbase.send("/api/ims/periods/current", {}) as Promise<{
      period: { id: string; name: string; code: string; status: string; fiscal_year: string } | null;
      fiscal_year: { id: string; name: string; code: string; start_date: string; end_date: string; status: string } | null;
    }>,
  confirmRate: (collection: "tax_rates" | "paye_bands" | "statutory_contributions", id: string, source: string) =>
    pocketbase.send(`/api/ims/tax-rates/${id}/confirm`, { method: "POST", body: { collection, source } }),

  health: () => pocketbase.send("/api/ims/health", {}) as Promise<SystemHealth>,

  audit: (params: { collection?: string; record?: string; q?: string; actor?: string; action?: string; from?: string; to?: string; page?: number; perPage?: number }) =>
    pocketbase.send(`/api/dnr/audit?${qs(params)}`, {}) as Promise<{ page: number; hasMore: boolean; items: AuditEntry[] }>,
  /** Records that someone exported data (who, what, format, filters) — exports are part of the audit trail. */
  logExport: (body: { what: string; format: string; rows: number; filters?: string }) =>
    pocketbase.send("/api/ims/audit/export", { method: "POST", body }).catch(() => null),
};

export interface AccountSecurity {
  id: string;
  name: string;
  email: string;
  status: string;
  roles: string[];
  totp_enabled: boolean;
  locked_until: string;
  failed_logins: number;
  last_login_at: string;
  last_login_ip: string;
}

export interface AuditEntry {
  id: string;
  created: string;
  actor: string;
  actor_name: string;
  action: string;
  collection_name: string;
  record_id: string;
  record_label: string;
  changes: Record<string, { old: unknown; new: unknown }>;
  comment: string;
  ip: string;
}

export interface SystemHealth {
  status: string;
  time: string;
  db_ms: number;
  details?: {
    users_active: number;
    pending_approvals: number;
    emails_failed_7d: number;
    backups: { cron: string; keep: number; s3: boolean };
    smtp_enabled: boolean;
    locked_accounts: number;
  };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/**
 * A boundary date (period end 23:59:59Z, start 00:00:00Z) shown as the calendar day it stands for,
 * without converting to local time (which would turn "30 Jun 23:59 UTC" into 1 July in Kigali).
 */
export const showDay = (v?: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v || ""));
  return m ? `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}` : "—";
};

/** Whole RWF, grouped: 1,250,000. */
// Non-breaking space: an amount never wraps between the currency and the number.
export const rwf = (n: number | undefined | null) => `RWF ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;
/** Change amounts: "RWF +1,000,000" / "RWF −1,000,000". */
export const rwfSigned = (n: number | undefined | null) => {
  const v = Math.round(Number(n) || 0);
  return `RWF ${v > 0 ? "+" : v < 0 ? "−" : ""}${Math.abs(v).toLocaleString("en-US")}`;
};
