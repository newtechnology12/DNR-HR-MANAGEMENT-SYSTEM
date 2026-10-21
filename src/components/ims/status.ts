/**
 * The one status vocabulary of RALGA IMS. Every module maps its stored statuses to these words;
 * pages never invent others ("Done", "Finished", "OK"). Detail that a word cannot carry
 * ("Paid 25 Nov", "With the DAF") goes on a second line under the pill.
 */
export type PillTone = "neutral" | "warning" | "success" | "success-outline" | "info" | "orange" | "danger";

export const GLOSSARY = {
  Draft: "neutral",
  "Pending approval": "warning",
  Approved: "success",
  "In progress": "info",
  "Converted to PO": "info",
  Completed: "success-outline",
  Closed: "success-outline",
  Returned: "orange",
  Rejected: "danger",
  Cancelled: "danger",
  // Record states (people, suppliers, accounts, settings) — not document workflow.
  Active: "success",
  Inactive: "neutral",
} as const satisfies Record<string, PillTone>;

export type StatusWord = keyof typeof GLOSSARY;

/** Stored values seen across the modules, mapped to the glossary. Modules may pass their own map. */
const RAW: Record<string, StatusWord> = {
  draft: "Draft", new: "Draft", not_submitted: "Draft",
  pending: "Pending approval", pending_approval: "Pending approval", submitted: "Pending approval", in_approval: "Pending approval",
  awaiting_approval: "Pending approval", waiting: "Pending approval", reported: "Pending approval", review: "Pending approval",
  approved: "Approved", awarded: "Approved", accepted: "Approved", confirmed: "Approved",
  in_progress: "In progress", ongoing: "In progress", open: "In progress", sent: "In progress", issued: "In progress",
  acknowledged: "In progress", partially_received: "In progress", partial: "In progress", partially_paid: "In progress",
  evaluation: "In progress", sourcing: "In progress", processing: "In progress", posted_partial: "In progress",
  converted: "Converted to PO", converted_to_po: "Converted to PO", ordered: "Converted to PO",
  completed: "Completed", complete: "Completed", done: "Completed", received: "Completed", paid: "Completed",
  assessed: "Completed", reconciled: "Completed", posted: "Completed", executed: "Completed", finalized: "Completed",
  closed: "Closed", archived: "Closed", expired: "Closed",
  returned: "Returned", sent_back: "Returned", changes_requested: "Returned",
  rejected: "Rejected", declined: "Rejected",
  cancelled: "Cancelled", canceled: "Cancelled", void: "Cancelled", voided: "Cancelled", reversed: "Cancelled", withdrawn: "Cancelled",
  active: "Active", enabled: "Active", inactive: "Inactive", disabled: "Inactive", suspended: "Inactive", blocked: "Inactive",
};

const isWord = (s: string): s is StatusWord => Object.prototype.hasOwnProperty.call(GLOSSARY, s);

/** Glossary word for any stored or displayed status; unknown values come back as null. */
export function statusWord(raw?: string | null, map?: Record<string, StatusWord>): StatusWord | null {
  if (!raw) return null;
  if (isWord(raw)) return raw;
  const key = String(raw).trim().toLowerCase().replace(/[\s-]+/g, "_");
  const w = map?.[key] || map?.[raw] || RAW[key];
  if (w) return w;
  const asTitle = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, " ");
  return isWord(asTitle) ? asTitle : null;
}

export const toneOf = (word?: string | null): PillTone => (word && isWord(word) ? GLOSSARY[word] : "neutral");

/** Styles per tone: text on tinted background; "Completed / Closed" are outlined. */
export const PILL_TONE: Record<PillTone, string> = {
  neutral: "bg-ims-neutral-bg text-ims-neutral",
  warning: "bg-ims-warning-bg text-ims-warning",
  success: "bg-ims-success-bg text-ims-success",
  "success-outline": "bg-ims-card text-ims-success ring-1 ring-inset ring-ims-success/60",
  info: "bg-ims-info-bg text-ims-info",
  orange: "bg-ims-orange-bg text-ims-orange",
  danger: "bg-ims-danger-bg text-ims-danger",
};
