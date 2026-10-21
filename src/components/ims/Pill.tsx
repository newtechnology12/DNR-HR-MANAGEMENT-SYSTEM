/**
 * StatusPill shows a glossary word (see status.ts) in its one colour; an optional second line
 * carries the detail ("Paid 25 Nov 2026", "With Solange Umutoni"). Priority is a dot + text.
 */
import * as React from "react";
import { cn } from "@/utils";
import { PILL_TONE, PillTone, StatusWord, statusWord, toneOf } from "./status";

export function Pill({ tone = "neutral", children, className, title }: { tone?: PillTone; children: React.ReactNode; className?: string; title?: string }) {
  return (
    <span title={title} className={cn("inline-flex w-fit items-center whitespace-nowrap rounded-pill px-2.5 py-[3px] text-[12.5px] font-semibold leading-none", PILL_TONE[tone], className)}>
      {children}
    </span>
  );
}

/**
 * <StatusPill status="pending_approval" /> → "Pending approval" (warning). Pass `map` when a module
 * stores its own values (e.g. { sent: "In progress" }). Unknown values show neutral so they stand out in review.
 */
export function StatusPill({ status, map, sub, className }: { status?: string | null; map?: Record<string, StatusWord>; sub?: React.ReactNode; className?: string }) {
  const word = statusWord(status, map);
  if (import.meta.env.DEV && status && !word) console.warn(`ims/StatusPill: "${status}" is not in the status glossary`);
  const pill = <Pill tone={toneOf(word)} className={className}>{word || status || "—"}</Pill>;
  if (!sub) return pill;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      {pill}
      <span className="text-t-small text-ims-muted">{sub}</span>
    </span>
  );
}

const PRIORITY = {
  urgent: { label: "Urgent", dot: "bg-ims-priority-urgent", text: "text-ims-text font-semibold" },
  high: { label: "High", dot: "bg-ims-priority-high", text: "text-ims-text" },
  medium: { label: "Medium", dot: "bg-ims-priority-medium", text: "text-ims-body" },
  normal: { label: "Medium", dot: "bg-ims-priority-medium", text: "text-ims-body" },
  low: { label: "Low", dot: "bg-ims-priority-low", text: "text-ims-muted" },
} as const;

/** Urgent (red), High (orange), Medium (grey), Low (light grey). */
export function Priority({ value, small }: { value?: string | null; small?: boolean }) {
  const p = PRIORITY[String(value || "medium").toLowerCase() as keyof typeof PRIORITY] || PRIORITY.medium;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap", small ? "text-t-small" : "text-t-body", p.text)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", p.dot)} aria-hidden />
      {p.label}
    </span>
  );
}
