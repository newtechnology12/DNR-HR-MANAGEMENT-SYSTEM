import pocketbase from "@/lib/pocketbase";

export type Tone = "neutral" | "info" | "warning" | "success" | "danger" | "violet";
/**
 * A stored status shown in the system glossary: `label` is the glossary word (Draft, Pending approval,
 * Approved, In progress, Converted to PO, Completed, Closed, Returned, Rejected, Cancelled, Active,
 * Inactive) and `note` the detail shown under it ("Sent to supplier").
 */
export type StatusMeta = { label: string; tone: Tone; note?: string };

/** One status vocabulary for every workflow document (see AUDIT.md §34). */
export const DOC_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  pending: { label: "Pending approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  returned: { label: "Returned", tone: "violet" },
  cancelled: { label: "Cancelled", tone: "danger" },
  converted_to_rfq: { label: "In progress", tone: "info", note: "Sent for quotation" },
  converted_to_po: { label: "Converted to PO", tone: "info" },
  completed: { label: "Completed", tone: "success" },
};

export const PRIORITY: Record<string, { label: string; tone: Tone }> = {
  low: { label: "Low", tone: "neutral" },
  medium: { label: "Medium", tone: "info" },
  high: { label: "High", tone: "warning" },
  urgent: { label: "Urgent", tone: "danger" },
};

export const REQUEST_TYPES = [
  { value: "goods", label: "Goods" },
  { value: "services", label: "Services" },
  { value: "assets", label: "Assets" },
  { value: "subscriptions", label: "Subscriptions" },
  { value: "maintenance", label: "Maintenance" },
  { value: "consultancy", label: "Consultancy" },
  { value: "construction", label: "Construction" },
  { value: "other", label: "Other" },
];

export const APPROVER_TYPES = [
  { value: "department_head", label: "Department head of the requester" },
  { value: "role", label: "Anyone with a role" },
  { value: "user", label: "A specific person" },
];

export const ACTION_LABELS: Record<string, string> = {
  submit: "submitted for approval",
  approve: "approved",
  reject: "rejected",
  return: "returned for changes",
  delegate: "delegated",
  escalate: "escalated",
  comment: "commented",
  cancel: "cancelled",
};

export interface RequisitionItem {
  line?: number;
  description: string;
  specification?: string;
  quantity: number;
  unit: string;
  unit_cost: number;
  tax_rate: number;
  net?: number;
  tax?: number;
  total?: number;
}

export interface ApprovalStep {
  name: string;
  approver_type: "department_head" | "role" | "user";
  role?: string;
  user?: string;
  same_department?: boolean;
  fallback_role?: string;
  rule?: string;
  /** Step conditions (optional): the step only applies when they hold. */
  min_amount?: number;
  max_amount?: number;
  /** Role id: the step applies only above that role's approval limit (approval_limits). */
  above_limit_of?: string;
  /** Skip the step when everyone who may decide it already approved at an earlier step. */
  skip_if_already_approved?: boolean;
  condition?: string;
}

export const money = (n: number | undefined, currency = "RWF") =>
  `${currency} ${Math.round(Number(n) || 0).toLocaleString("en-US")}`;

export const compactMoney = (n: number | undefined, currency = "RWF") =>
  `${currency} ${new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(Number(n) || 0)}`;

/** Totals exactly as the server computes them (the server result is authoritative). */
export function lineTotals(items: RequisitionItem[]) {
  let subtotal = 0;
  let tax = 0;
  for (const it of items) {
    const net = Math.round((Number(it.quantity) || 0) * (Number(it.unit_cost) || 0) * 100) / 100;
    subtotal += net;
    tax += Math.round(((net * (Number(it.tax_rate) || 0)) / 100) * 100) / 100;
  }
  return { subtotal, tax, total: subtotal + tax };
}

/** Escape a user-typed value for a PocketBase filter string. */
export const pbQuote = (v: string) => `"${String(v).replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;

export const procurementApi = {
  submit: (id: string) => pocketbase.send(`/api/dnr/requisitions/${id}/submit`, { method: "POST" }),
  cancel: (id: string, reason: string) =>
    pocketbase.send(`/api/dnr/requisitions/${id}/cancel`, { method: "POST", body: { reason } }),
  act: (approvalId: string, body: { action: string; comment?: string; user?: string }) =>
    pocketbase.send(`/api/dnr/approvals/${approvalId}/act`, { method: "POST", body }),
  preview: (body: { document_type?: string; amount: number; department?: string; category?: string; branch?: string; funding_source?: string }) =>
    pocketbase.send(`/api/dnr/approvals/preview`, { method: "POST", body }) as Promise<{
      workflow: { id: string; name: string } | null;
      steps: { name: string; rule: string; approvers: string[]; condition?: string; applies?: boolean }[];
    }>,
  audit: (params: { collection?: string; record?: string; q?: string; page?: number; perPage?: number }) => {
    const qs = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== "")
        .map(([k, v]) => [k, String(v)])
    );
    return pocketbase.send(`/api/dnr/audit?${qs}`, {}) as Promise<{
      page: number;
      hasMore: boolean;
      items: {
        id: string;
        created: string;
        actor_name: string;
        action: string;
        collection_name: string;
        record_id: string;
        record_label: string;
        changes: Record<string, { old: unknown; new: unknown }>;
        comment: string;
        ip: string;
      }[];
    }>;
  },
};

/** Human-readable message from a PocketBase error (server messages are written for end users). */
export function errorMessage(e: any, fallback = "The request could not be completed.") {
  const fieldErrors = e?.response?.data && typeof e.response.data === "object" ? Object.entries(e.response.data) : [];
  if (fieldErrors.length) {
    const label = (k: string) => (k === "tin" ? "TIN" : k.replace(/_/g, " "));
    return fieldErrors
      .map(([k, v]: any) =>
        v?.code === "validation_not_unique"
          ? `Another record already uses this ${label(k)}. Search for it instead of creating a duplicate.`
          : `${label(k)}: ${v?.message || v}`
      )
      .join("; ");
  }
  return e?.response?.message || e?.message || fallback;
}

// ------------------------------------------------------------------ sourcing (Phase 2)
export const RFQ_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "In progress", tone: "info", note: "Open for quotes" },
  closed: { label: "In progress", tone: "info", note: "Evaluating quotes" },
  awarded: { label: "Completed", tone: "success", note: "Awarded" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const INVITE_STATUS: Record<string, StatusMeta> = {
  invited: { label: "Draft", tone: "neutral", note: "Not sent yet" },
  sent: { label: "In progress", tone: "info", note: "Sent" },
  viewed: { label: "In progress", tone: "info", note: "Viewed" },
  quoted: { label: "Completed", tone: "success", note: "Quoted" },
  late: { label: "Completed", tone: "success", note: "Quoted late" },
  declined: { label: "Rejected", tone: "danger", note: "Declined" },
};

export const QUOTE_STATUS: Record<string, StatusMeta> = {
  received: { label: "In progress", tone: "info", note: "Being evaluated" },
  accepted: { label: "Approved", tone: "success", note: "Selected" },
  rejected: { label: "Rejected", tone: "danger", note: "Not selected" },
};

export const SUPPLIER_STATUS: Record<string, StatusMeta> = {
  active: { label: "Active", tone: "success" },
  inactive: { label: "Inactive", tone: "neutral" },
  blacklisted: { label: "Inactive", tone: "neutral", note: "Blacklisted" },
  draft: { label: "Draft", tone: "neutral", note: "Not submitted" },
  under_review: { label: "Pending approval", tone: "warning", note: "Under review" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const SUPPLIER_TYPES = [
  { value: "company", label: "Company" },
  { value: "individual", label: "Individual" },
  { value: "government", label: "Government entity" },
  { value: "ngo", label: "NGO" },
  { value: "other", label: "Other" },
];

export const SUPPLIER_DOC_TYPES: Record<string, string> = {
  registration_certificate: "Registration certificate",
  tax_certificate: "Tax clearance certificate",
  vat_certificate: "VAT certificate",
  bank_confirmation: "Bank confirmation",
  contract: "Contract",
  insurance: "Insurance",
  compliance: "Compliance document",
  other: "Other",
};

export const COMPLIANCE: Record<string, { label: string; tone: Tone }> = {
  compliant: { label: "Compliant", tone: "success" },
  partial: { label: "Partially compliant", tone: "warning" },
  non_compliant: { label: "Non-compliant", tone: "danger" },
};

export const EVALUATION_CRITERIA = [
  { key: "price", label: "Price" },
  { key: "quality", label: "Quality" },
  { key: "delivery", label: "Delivery time" },
  { key: "warranty", label: "Warranty" },
  { key: "payment", label: "Payment terms" },
  { key: "compliance", label: "Compliance" },
] as const;

/** Document validity from its expiry date: valid, expiring within `days`, or expired. */
export function expiryState(expiry?: string, days = 30): { label: string; tone: Tone; daysLeft: number | null } {
  if (!expiry) return { label: "No expiry", tone: "neutral", daysLeft: null };
  const left = Math.ceil((new Date(expiry).getTime() - Date.now()) / 864e5);
  if (left < 0) return { label: `Expired ${-left} d ago`, tone: "danger", daysLeft: left };
  if (left <= days) return { label: `Expires in ${left} d`, tone: "warning", daysLeft: left };
  return { label: "Valid", tone: "success", daysLeft: left };
}

export const sourcingApi = {
  createRfq: (requisitionId: string, body: { closing_date?: string; suppliers?: string[] } = {}) =>
    pocketbase.send(`/api/dnr/requisitions/${requisitionId}/create-rfq`, { method: "POST", body }) as Promise<{ id: string; number: string }>,
  rfqAction: (rfqId: string, action: "send" | "close" | "cancel" | "award", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/dnr/rfqs/${rfqId}/${action}`, { method: "POST", body }),
};

// ------------------------------------------------------------------ purchase orders & inventory (Phase 3)
export const PO_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  returned: { label: "Returned", tone: "violet" },
  rejected: { label: "Rejected", tone: "danger" },
  approved: { label: "Approved", tone: "success", note: "Not sent yet" },
  sent: { label: "In progress", tone: "info", note: "Sent to supplier" },
  acknowledged: { label: "In progress", tone: "info", note: "Acknowledged by supplier" },
  partially_received: { label: "In progress", tone: "info", note: "Partly received" },
  fully_received: { label: "In progress", tone: "info", note: "Received, to bill" },
  partially_invoiced: { label: "In progress", tone: "info", note: "Partly billed" },
  fully_invoiced: { label: "In progress", tone: "info", note: "Billed" },
  completed: { label: "Completed", tone: "success" },
  cancelled: { label: "Cancelled", tone: "danger" },
  closed: { label: "Closed", tone: "neutral" },
};

export const LINE_TYPES: Record<string, { label: string; tone: Tone; hint: string }> = {
  goods: { label: "Stock", tone: "info", hint: "Received into a warehouse" },
  asset: { label: "Asset", tone: "violet", hint: "One asset record per unit" },
  service: { label: "Service", tone: "neutral", hint: "Confirmed, no stock" },
};

export const MOVEMENT_TYPES: Record<string, { label: string; tone: Tone }> = {
  receipt: { label: "Receipt", tone: "success" },
  issue: { label: "Issue", tone: "warning" },
  adjustment_in: { label: "Adjustment +", tone: "info" },
  adjustment_out: { label: "Adjustment −", tone: "danger" },
  return_to_supplier: { label: "Return to supplier", tone: "danger" },
};

/** Orders whose goods have not all arrived yet. */
export const OPEN_PO_STATUSES = ["approved", "sent", "acknowledged", "partially_received"];

export const purchasingApi = {
  fromRfq: (rfqId: string) =>
    pocketbase.send(`/api/dnr/purchase-orders/from-rfq/${rfqId}`, { method: "POST" }) as Promise<{ id: string; number: string }>,
  direct: (requisitionId: string, body: { supplier: string; justification: string }) =>
    pocketbase.send(`/api/dnr/purchase-orders/direct/${requisitionId}`, { method: "POST", body }) as Promise<{ id: string; number: string }>,
  action: (poId: string, action: "submit" | "send" | "acknowledge" | "close" | "cancel" | "amend", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/dnr/purchase-orders/${poId}/${action}`, { method: "POST", body }),
  receive: (poId: string, body: Record<string, unknown>) =>
    pocketbase.send(`/api/dnr/purchase-orders/${poId}/receive`, { method: "POST", body }) as Promise<{ id: string; number: string; assets: string[] }>,
  adjust: (body: { item: string; warehouse: string; type: string; quantity: number; reason: string; reference?: string }) =>
    pocketbase.send(`/api/dnr/inventory/adjust`, { method: "POST", body }),
};

// ------------------------------------------------------------------ finance (Phase 4)
export const INVOICE_STATUS: Record<string, StatusMeta> = {
  received: { label: "In progress", tone: "info", note: "Received, to match" },
  exception: { label: "Returned", tone: "violet", note: "Match exception" },
  matched: { label: "In progress", tone: "info", note: "Matched" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  approved: { label: "Approved", tone: "success", note: "To pay" },
  returned: { label: "Returned", tone: "violet" },
  rejected: { label: "Rejected", tone: "danger" },
  partially_paid: { label: "In progress", tone: "info", note: "Partly paid" },
  paid: { label: "Completed", tone: "success", note: "Paid" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export const PAYMENT_METHODS: Record<string, string> = {
  bank_transfer: "Bank transfer",
  cheque: "Cheque",
  mobile_money: "Mobile money",
  cash: "Cash",
};

export interface BudgetUsage {
  id: string;
  name: string;
  department: string;
  department_name: string;
  category: string;
  category_name: string;
  fiscal_year: number;
  status: string;
  cost_center: string;
  notes: string;
  amount: number;
  committed: number;
  invoiced: number;
  paid: number;
  remaining: number;
}

export const financeApi = {
  budgetUsage: (year: number) =>
    pocketbase.send(`/api/dnr/budgets/usage?year=${year}`, {}) as Promise<{ year: number; control: "none" | "warn" | "block"; items: BudgetUsage[] }>,
  invoiceAction: (id: string, action: "resolve" | "submit" | "cancel", body: Record<string, unknown> = {}) =>
    pocketbase.send(`/api/dnr/invoices/${id}/${action}`, { method: "POST", body }) as Promise<{ id: string; status: string }>,
  pay: (id: string, body: { amount: number; method: string; payment_date?: string; reference?: string; notes?: string }) =>
    pocketbase.send(`/api/dnr/invoices/${id}/pay`, { method: "POST", body }) as Promise<{ id: string; number: string }>,
};

// ------------------------------------------------------------------ phase 5: returns, contracts, plans, onboarding, reports
export const RETURN_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  returned_for_changes: { label: "Returned", tone: "violet" },
  rejected: { label: "Rejected", tone: "danger" },
  approved: { label: "Approved", tone: "success", note: "To dispatch" },
  dispatched: { label: "In progress", tone: "info", note: "Sent back to supplier" },
  credited: { label: "Completed", tone: "success", note: "Credited" },
  cancelled: { label: "Cancelled", tone: "danger" },
};
export const CONTRACT_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  returned: { label: "Returned", tone: "violet" },
  rejected: { label: "Rejected", tone: "danger" },
  active: { label: "Active", tone: "success", note: "In force" },
  expired: { label: "Closed", tone: "neutral", note: "Expired" },
  terminated: { label: "Closed", tone: "neutral", note: "Terminated" },
  cancelled: { label: "Cancelled", tone: "danger" },
};
export const CONTRACT_TYPES: Record<string, string> = {
  framework: "Framework agreement",
  fixed_price: "Fixed price",
  service: "Service contract",
  supply: "Supply contract",
  lease: "Lease",
  consultancy: "Consultancy",
  other: "Other",
};
export const PLAN_STATUS: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Pending approval", tone: "warning" },
  returned: { label: "Returned", tone: "violet" },
  rejected: { label: "Rejected", tone: "danger" },
  approved: { label: "Approved", tone: "success" },
  closed: { label: "Closed", tone: "neutral" },
  cancelled: { label: "Cancelled", tone: "danger" },
};
export const PLAN_METHODS: Record<string, string> = { rfq: "Request for quotation", direct: "Direct purchase", open_tender: "Open tender", framework: "Framework / call-off" };
export const SUPPLIER_ONBOARDING: Record<string, StatusMeta> = {
  draft: { label: "Draft", tone: "neutral", note: "Not submitted" },
  under_review: { label: "Pending approval", tone: "warning", note: "Under review" },
  rejected: { label: "Rejected", tone: "danger" },
};

export const phase5Api = {
  submitSupplier: (id: string) => pocketbase.send(`/api/dnr/suppliers/${id}/submit`, { method: "POST" }),
  supplierReadiness: (id: string) => pocketbase.send(`/api/dnr/suppliers/${id}/readiness`, {}) as Promise<{ missing: string[] }>,
  supplierPerformance: (supplier?: string) => pocketbase.send(`/api/dnr/suppliers/performance${supplier ? `?supplier=${supplier}` : ""}`, {}) as Promise<{ items: any[] }>,
  createReturn: (body: Record<string, unknown>) => pocketbase.send("/api/dnr/returns", { method: "POST", body }) as Promise<{ id: string; number: string }>,
  returnAction: (id: string, action: "submit" | "dispatch" | "credit" | "cancel", body: Record<string, unknown> = {}) => pocketbase.send(`/api/dnr/returns/${id}/${action}`, { method: "POST", body }),
  contractAction: (id: string, action: "submit" | "terminate" | "cancel", body: Record<string, unknown> = {}) => pocketbase.send(`/api/dnr/contracts/${id}/${action}`, { method: "POST", body }),
  contractAlerts: () => pocketbase.send("/api/dnr/contracts/alerts", {}) as Promise<{ items: { contract: string; number: string; title: string; key: string; level: string; text: string }[] }>,
  contractUse: (id: string) => pocketbase.send(`/api/dnr/contracts/${id}/utilisation`, {}) as Promise<{ value: number; used: number; orders: number; remaining: number }>,
  planAction: (id: string, action: "submit" | "close", body: Record<string, unknown> = {}) => pocketbase.send(`/api/dnr/plans/${id}/${action}`, { method: "POST", body }),
  planProgress: (id: string) =>
    pocketbase.send(`/api/dnr/plans/${id}/progress`, {}) as Promise<{
      lines: Record<string, { requested: number; ordered: number; received: number; requisitions: any[] }>;
      budget: any;
      /** Planned total per budget line against what the line holds. */
      coverage?: { id: string; code: string; name: string; budget: number; available: number; planned: number; over: number }[];
    }>,
  report: (key: string, f: Record<string, string>) =>
    pocketbase.send(`/api/dnr/procurement/reports/${key}?${new URLSearchParams(Object.fromEntries(Object.entries(f).filter(([, v]) => v)))}`, {}) as Promise<{ key: string; title: string; columns: { key: string; label: string; type: string }[]; rows: any[]; totals: Record<string, number>; note: string; generated_at: string }>,
};
