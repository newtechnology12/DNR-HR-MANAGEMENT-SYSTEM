/**
 * Top of every detail page: "← Back to [list]", document number · type · status, the title, the key
 * facts on one line (requester, department, date, amount), and the actions on the right (primary =
 * the next step, e.g. "Approve"). Below it pages put a KpiBand (if useful) and the tabs
 * Details · Items · Approvals · Documents · Activity.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/utils";
import { StatusPill } from "./Pill";
import type { StatusWord } from "./status";

export type Fact = React.ReactNode | { label: string; value: React.ReactNode };

export type DetailItem = { label: string; value: React.ReactNode; hint?: React.ReactNode; wide?: boolean };

/** Label / value pairs for the Details tab: label 12.5px muted above a 14px value. */
export function Details({ items, columns = 2, className }: { items: DetailItem[]; columns?: 1 | 2 | 3; className?: string }) {
  const cols = { 1: "", 2: "sm:grid-cols-2", 3: "sm:grid-cols-2 lg:grid-cols-3" }[columns];
  return (
    <dl className={cn("grid gap-x-8 gap-y-4", cols, className)}>
      {items.map((it) => (
        <div key={it.label} className={cn("min-w-0", it.wide && "sm:col-span-full")}>
          <dt className="text-t-small text-ims-muted">{it.label}</dt>
          <dd className="mt-0.5 break-words text-t-body text-ims-text">
            {it.value === null || it.value === undefined || it.value === "" ? <span className="text-ims-faint">—</span> : it.value}
            {it.hint && <span className="mt-0.5 block text-t-small text-ims-muted">{it.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function DetailHeader({
  back,
  number,
  type,
  status,
  statusMap,
  statusNote,
  title,
  facts = [],
  actions,
  className,
}: {
  back: { label: string; to: string };
  number?: string | null;
  type?: string;
  status?: string | null;
  statusMap?: Record<string, StatusWord>;
  /** Detail next to the pill: "With the DAF", "Overdue · 2 days". */
  statusNote?: React.ReactNode;
  title: React.ReactNode;
  facts?: Fact[];
  actions?: React.ReactNode;
  className?: string;
}) {
  const shown = facts.filter((f) => f !== null && f !== undefined && f !== false && f !== "");
  return (
    <header className={cn("flex flex-col gap-3", className)}>
      <Link to={back.to} className="inline-flex w-fit items-center gap-1.5 text-t-crumb font-semibold text-ims-link hover:underline">
        <ArrowLeft size={15} aria-hidden /> {back.label}
      </Link>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-t-small text-ims-muted">
            {number && <span className="whitespace-nowrap font-mono text-[12.5px] text-ims-body">{number}</span>}
            {number && type && <span aria-hidden>·</span>}
            {type && <span>{type}</span>}
            {status && <StatusPill status={status} map={statusMap} />}
            {statusNote && <span className="text-t-small text-ims-muted">{statusNote}</span>}
          </p>
          <h1 className="mt-1.5 text-t-title text-ims-text">{title}</h1>
          {shown.length > 0 && (
            <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-t-body text-ims-body">
              {shown.map((f, i) => (
                <React.Fragment key={i}>
                  {i > 0 && <span className="text-ims-faint" aria-hidden>·</span>}
                  {f && typeof f === "object" && "label" in (f as object) ? (
                    <span>
                      <span className="text-ims-muted">{(f as { label: string }).label} </span>
                      <span className="font-semibold text-ims-text">{(f as { value: React.ReactNode }).value}</span>
                    </span>
                  ) : (
                    <span>{f as React.ReactNode}</span>
                  )}
                </React.Fragment>
              ))}
            </p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
      </div>
    </header>
  );
}
