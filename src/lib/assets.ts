/**
 * Fixed assets client (M7): statuses, labels and the API. Server rules live in pocketbase/pb_hooks/lib/assets.js.
 */
import pocketbase from "@/lib/pocketbase";
import type { Tone } from "@/lib/procurement";
import type { ServerReportResult } from "@/components/enterprise/ServerReportPage";

export const ASSET_STATUS: Record<string, { label: string; tone: Tone }> = {
  in_use: { label: "In use", tone: "success" },
  in_stock: { label: "In store", tone: "info" },
  under_maintenance: { label: "Under maintenance", tone: "warning" },
  damaged: { label: "Damaged", tone: "danger" },
  lost: { label: "Lost", tone: "danger" },
  disposed: { label: "Disposed", tone: "neutral" },
};
export const CONDITIONS: Record<string, string> = { new: "New", good: "Good", fair: "Fair", poor: "Poor", damaged: "Damaged" };
export const DEPRECIATION_METHODS: Record<string, string> = { straight_line: "Straight line", reducing_balance: "Reducing balance", none: "Not depreciated" };
export const DISPOSAL_METHODS: Record<string, string> = {
  sale: "Sale", auction: "Public auction", donation: "Donation", scrap: "Scrapping", write_off: "Write-off", theft_loss: "Theft or loss", transfer_out: "Transfer to another institution",
};
export const DOC_STATUS: Record<string, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  pending_approval: { label: "Waiting for approval", tone: "warning" },
  returned: { label: "Returned", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
};
export const RUN_STATUS: Record<string, { label: string; tone: Tone }> = { ...DOC_STATUS, approved: { label: "Posted", tone: "success" } };
export const MAINTENANCE_KINDS: Record<string, string> = { service: "Service", repair: "Repair", inspection: "Inspection", upgrade: "Upgrade", insurance: "Insurance", other: "Other" };
export const COUNT_RESULTS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Not counted", tone: "neutral" },
  found: { label: "Found", tone: "success" },
  found_elsewhere: { label: "Found elsewhere", tone: "info" },
  damaged: { label: "Damaged", tone: "warning" },
  missing: { label: "Missing", tone: "danger" },
};
export const MOVEMENT_KINDS: Record<string, string> = { transfer: "Transfer", assignment: "Custodian / location", status_change: "Status change", verification: "Count result" };
export const ACQUISITION: Record<string, string> = { purchase: "Purchase", donation: "Donation", opening_balance: "Opening register", transfer_in: "Transferred in" };

/** The permissions that open the fixed asset pages. */
export const ASSET_VIEW = ["view_fixed_assets", "manage_fixed_assets", "approve_fixed_assets", "approve_asset_disposals", "run_depreciation", "approve_depreciation", "view_asset_reports", "export_assets", "view_assets"];

export interface AssetOverview {
  totals: { count: number; cost: number; accumulated: number };
  by_category: { category: string; name: string; count: number; cost: number; accumulated: number }[];
  status: Record<string, number>;
  to_capitalise: number;
  transfers_waiting: number;
  disposals_waiting: number;
  disposals_draft: number;
  depreciation: {
    last_posted: { id: string; number: string; period: string; total: number } | null;
    open: { id: string; number: string; period: string; status: string; total: number } | null;
    next: string;
  };
  maintenance_due: { asset: string; code: string; name: string; next_due: string; overdue: boolean; kind: string }[];
  last_count: { id: string; number: string; title: string; as_of: string; summary: Record<string, number> } | null;
}

const send = <T = any>(path: string, body?: Record<string, unknown>) => pocketbase.send(path, { method: "POST", body: body || {} }) as Promise<T>;
const qs = (f: Record<string, string>) => new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();

export const assetsApi = {
  overview: () => pocketbase.send("/api/ims/assets/overview", {}) as Promise<AssetOverview>,
  schedule: (id: string) => pocketbase.send(`/api/ims/assets/${id}/schedule`, {}) as Promise<{ rows: { period: string; label: string; charge: number; accumulated: number; net_book_value: number }[]; method?: string; life?: number; note?: string }>,
  report: (key: string, f: Record<string, string>) => pocketbase.send(`/api/ims/asset-reports/${key}?${qs(f)}`, {}) as Promise<ServerReportResult>,
  register: (body: Record<string, unknown>) => send<{ id: string; code: string }>("/api/ims/assets", body),
  act: (id: string, action: "capitalise" | "assign" | "status" | "transfer" | "maintenance" | "dispose", body: Record<string, unknown>) => send<{ id: string; number?: string; status?: string }>(`/api/ims/assets/${id}/${action}`, body),
  cancelTransfer: (id: string, reason: string) => send(`/api/ims/asset-transfers/${id}/cancel`, { reason }),
  disposal: (id: string, action: "update" | "submit" | "cancel", body?: Record<string, unknown>) => send<{ id: string; status: string }>(`/api/ims/asset-disposals/${id}/${action}`, body),
  computeRun: (year: number, month: number) => send<{ id: string; number: string; total: number; asset_count: number }>("/api/ims/depreciation-runs", { year, month }),
  run: (id: string, action: "recalculate" | "submit" | "cancel", body?: Record<string, unknown>) => send<{ id: string; status: string; total: number; asset_count: number }>(`/api/ims/depreciation-runs/${id}/${action}`, body),
  startCount: (body: Record<string, unknown>) => send<{ id: string; number: string }>("/api/ims/asset-verifications", body),
  count: (id: string, action: "complete" | "cancel", body?: Record<string, unknown>) => send(`/api/ims/asset-verifications/${id}/${action}`, body),
  countLine: (lineId: string, body: Record<string, unknown>) => send(`/api/ims/asset-verification-lines/${lineId}`, body),
  decideRequest: (id: string, body: Record<string, unknown>) => send(`/api/ims/asset-requests/${id}/decide`, body),
};

export const money = (n: number | undefined | null) => Math.round(Number(n) || 0).toLocaleString("en-US");
