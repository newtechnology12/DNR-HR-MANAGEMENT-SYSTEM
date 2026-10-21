/**
 * Document page building blocks (purchase orders, invoices, vouchers…) in the ims design:
 *   ControlBar ("← Back to list", status stepper, actions) → SmartButtons (KPI band) → Sheet (card)
 *   with SheetTitle (number · type · status, title), FieldGrid (label / value), Notebook (tabs),
 *   Totals → Chatter (activity) on the side on wide screens.
 * New detail pages use DetailHeader / Details / Tabs from "@/components/ims" directly.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Check, LucideIcon } from "lucide-react";
import { cn } from "@/utils";
import { Card, StatusPill, Tabs, fmtDateTime, fmtWhen, statusWord } from "@/components/ims";
import { Initials } from "./ui";

export function DocumentPage({ children, chatter }: { children: React.ReactNode; chatter?: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-[1480px] px-4 pb-10 pt-4 text-ims-text sm:px-[28px] sm:pt-6">
      <div className={cn("grid gap-4", chatter && "min-[1600px]:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0 space-y-4">{children}</div>
        {chatter && <aside className="min-w-0">{chatter}</aside>}
      </div>
    </div>
  );
}

/** Back link to the list the document belongs to, the status stepper and the actions. */
export function ControlBar({
  breadcrumbs,
  actions,
  steps,
  current,
}: {
  breadcrumbs: { title: string; link?: string }[];
  actions?: React.ReactNode;
  steps?: { key: string; label: string }[];
  current?: string;
}) {
  const parent = [...breadcrumbs.slice(0, -1)].reverse().find((b) => b.link);
  const idx = steps ? Math.max(steps.findIndex((s) => s.key === current), 0) : -1;
  return (
    <div className="flex flex-col gap-3">
      {parent && (
        <Link to={parent.link!} className="inline-flex w-fit items-center gap-1.5 text-t-crumb font-semibold text-ims-link hover:underline">
          <ArrowLeft size={15} aria-hidden /> Back to {parent.title.charAt(0).toLowerCase() + parent.title.slice(1)}
        </Link>
      )}
      {(steps || actions) && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          {steps ? (
            <ol className="flex flex-wrap items-center gap-x-1 gap-y-2" aria-label="Document status">
              {steps.map((s, i) => {
                const active = i === idx;
                const done = i < idx;
                return (
                  <li key={s.key} aria-current={active ? "step" : undefined} className="flex items-center gap-1">
                    {i > 0 && <span className={cn("h-px w-5 sm:w-8", done || active ? "bg-ims-link" : "bg-ims-border")} aria-hidden />}
                    <span className={cn("flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold", done ? "bg-ims-link text-white" : active ? "bg-ims-primary text-white" : "border border-ims-border bg-ims-card text-ims-faint")} aria-hidden>
                      {done ? <Check size={12} /> : i + 1}
                    </span>
                    <span className={cn("whitespace-nowrap text-t-small", active ? "font-bold text-ims-text" : done ? "text-ims-body" : "text-ims-muted")}>{s.label}</span>
                  </li>
                );
              })}
            </ol>
          ) : (
            <span />
          )}
          {actions && <div className="flex flex-wrap items-center gap-2 lg:justify-end">{actions}</div>}
        </div>
      )}
    </div>
  );
}

/** Key figures of the document, in the KPI-band style. */
export function SmartButtons({ items }: { items: { icon?: LucideIcon; label: string; value: React.ReactNode; onClick?: () => void; tone?: "default" | "warning" | "danger" }[] }) {
  if (!items.length) return null;
  return (
    <div className="overflow-hidden rounded-card border border-ims-border bg-ims-card">
      <div className="-ml-px -mt-px flex flex-wrap">
        {items.map((it) => {
          const Comp = it.onClick ? "button" : "div";
          return (
            <Comp
              key={it.label}
              type={it.onClick ? "button" : undefined}
              onClick={it.onClick}
              className={cn("min-w-[150px] flex-1 border-l border-t border-ims-divider px-5 py-3 text-left", it.onClick && "hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus")}
            >
              <span className="block text-t-small text-ims-muted">{it.label}</span>
              <span className={cn("block text-[19px] font-extrabold tabular-nums", it.tone === "danger" ? "text-ims-danger" : it.tone === "warning" ? "text-ims-warning" : "text-ims-text")}>{it.value}</span>
            </Comp>
          );
        })}
      </div>
    </div>
  );
}

export function Sheet({ children, ribbon }: { children: React.ReactNode; ribbon?: { label: string; tone: "success" | "danger" | "warning" | "neutral" } }) {
  return (
    <Card className="relative sm:px-7 sm:py-6">
      {ribbon && (
        <div className="absolute right-5 top-5 sm:right-7 sm:top-6">
          <StatusPill status={statusWord(ribbon.label) || ribbon.label} />
        </div>
      )}
      {children}
    </Card>
  );
}

export function SheetTitle({ kicker, title, badges }: { kicker: string; title: React.ReactNode; badges?: React.ReactNode }) {
  return (
    <div className="mb-6 pr-28">
      <p className="flex flex-wrap items-center gap-2 text-t-small text-ims-muted">
        <span>{kicker}</span>
        {badges}
      </p>
      <h1 className="mt-1 text-t-title text-ims-text">{title}</h1>
    </div>
  );
}

export type DocField = { label: string; value: React.ReactNode; hint?: string };

/** Two columns of label → value rows. */
export function FieldGrid({ left, right }: { left: DocField[]; right: DocField[] }) {
  const col = (fields: DocField[]) => (
    <dl>
      {fields.map((f) => (
        <div key={f.label} className="grid grid-cols-[140px_minmax(0,1fr)] items-baseline gap-3 border-b border-ims-divider py-2.5 last:border-b-0 sm:grid-cols-[170px_minmax(0,1fr)]">
          <dt className="text-t-small text-ims-muted">{f.label}</dt>
          <dd className="min-w-0 break-words text-t-body text-ims-text">
            {f.value === null || f.value === undefined || f.value === "" ? <span className="text-ims-faint">—</span> : f.value}
            {f.hint && <span className="mt-0.5 block text-t-small text-ims-muted">{f.hint}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
  return (
    <div className="grid grid-cols-1 gap-x-12 lg:grid-cols-2">
      {col(left)}
      {col(right)}
    </div>
  );
}

export function Notebook({ tabs, active, onChange }: { tabs: { key: string; label: string; count?: number }[]; active: string; onChange: (k: string) => void }) {
  return <Tabs className="mt-8" tabs={tabs} active={active} onChange={onChange} />;
}

/** Totals block aligned right under a lines table. */
export function Totals({ rows, total }: { rows: [string, React.ReactNode][]; total: [string, React.ReactNode] }) {
  return (
    <dl className="ml-auto mt-4 w-full max-w-sm space-y-1.5 text-t-body">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6 text-ims-body">
          <dt>{k}</dt>
          <dd className="tabular-nums">{v}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-6 border-t-2 border-ims-text pt-2 text-[16px] font-extrabold text-ims-text">
        <dt>{total[0]}</dt>
        <dd className="tabular-nums">{total[1]}</dd>
      </div>
    </dl>
  );
}

export type ChatterItem = { id: string; at: string; who?: string; text: React.ReactNode; comment?: string; tone?: "default" | "success" | "danger" | "warning" };

export function Chatter({ items, title = "Activity", composer }: { items: ChatterItem[]; title?: string; composer?: React.ReactNode }) {
  const dot = { default: "bg-ims-faint", success: "bg-ims-success", danger: "bg-ims-danger", warning: "bg-ims-warning" };
  return (
    <section className="rounded-card border border-ims-border bg-ims-card min-[1600px]:sticky min-[1600px]:top-4">
      <header className="border-b border-ims-divider px-5 py-4">
        <h2 className="text-t-section text-ims-text">{title}</h2>
      </header>
      {composer && <div className="border-b border-ims-divider px-5 py-3">{composer}</div>}
      <ol className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
        {!items.length && <li className="text-t-body text-ims-muted">No activity yet.</li>}
        {items.map((e) => (
          <li key={e.id} className="flex gap-3">
            <div className="relative">
              <Initials name={e.who} />
              <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", dot[e.tone || "default"])} aria-hidden />
            </div>
            <div className="min-w-0 flex-1 text-t-body">
              <p className="text-ims-text">
                <span className="font-bold">{e.who || "System"}</span>{" "}
                <span className="text-t-small text-ims-muted" title={fmtDateTime(e.at)}>{fmtWhen(e.at)}</span>
              </p>
              <div className="text-ims-body">{e.text}</div>
              {e.comment && <p className="mt-1 rounded-control bg-ims-subtle px-3 py-2 text-ims-text">“{e.comment}”</p>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

const ACTION_TEXT: Record<string, string> = {
  submit: "submitted for approval",
  approve: "approved",
  reject: "rejected",
  return: "sent back for changes",
  delegate: "delegated",
  escalate: "escalated",
  comment: "commented",
  cancel: "cancelled",
};
const AUDIT_TEXT: Record<string, string> = {
  created: "created the document",
  deleted: "deleted the document",
  invoice_recorded: "recorded the bill",
  exception_resolved: "resolved the match exception",
  payment_recorded: "recorded a payment",
  po_created: "created the purchase order",
  submitted: "submitted the document",
  sent: "sent the order to the supplier",
  "sent to supplier": "sent the order to the supplier",
  acknowledge: "recorded the supplier's acknowledgement",
  acknowledged: "recorded the supplier's acknowledgement",
  "goods received": "received goods",
  goods_received: "received goods",
  closed: "closed the order",
  cancelled: "cancelled the document",
  over_budget_warning: "flagged: over budget",
  // documents decided outside the approval engine (work plans, attendance corrections)
  approval_approve: "approved",
  approval_return: "returned it for changes",
  approval_reject: "rejected",
  progress_updated: "updated the progress",
  reported: "wrote the report",
  assessed: "assessed the report",
};
const AUDIT_TONE: Record<string, ChatterItem["tone"]> = { approval_approve: "success", assessed: "success", payment_recorded: "success", approval_return: "warning", exception_resolved: "warning", over_budget_warning: "warning", approval_reject: "danger" };

/** Merge approval decisions and audit-trail entries into one newest-first chatter feed. */
export function toChatter(actions: any[], audit: any[]): ChatterItem[] {
  return [
    ...actions.map((a) => ({
      id: `w-${a.id}`,
      at: a.created,
      who: a.expand?.actor?.name,
      text: `${ACTION_TEXT[a.action] || a.action}${a.step_name && !["submit", "cancel", "comment"].includes(a.action) ? ` at “${a.step_name}”` : ""}${a.expand?.target_user ? ` → ${a.expand.target_user.name}` : ""}`,
      comment: a.comment,
      tone: (a.action === "approve" ? "success" : a.action === "reject" ? "danger" : a.action === "return" ? "warning" : "default") as ChatterItem["tone"],
    })),
    ...audit
      // Approval decisions already come from the workflow actions above (when the document has a workflow).
      .filter((e) => !(e.action.startsWith("approval_") && actions.length) && !(e.action === "submitted" && actions.some((a) => a.action === "submit")) && (e.action !== "updated" || Object.keys(e.changes || {}).length))
      .map((e) => {
        const changes = Object.entries(e.changes || {}).filter(([k]) => !["items", "attachments", "match_result"].includes(k));
        return {
          id: `a-${e.id}`,
          at: e.created,
          who: e.actor_name,
          text:
            e.action === "updated" || e.action === "status_changed" ? (
              <ul className="mt-0.5 space-y-0.5">
                {changes.slice(0, 5).map(([k, v]: any) => (
                  <li key={k}>
                    <span className="text-ims-muted">{k.replace(/_/g, " ")}:</span> <span className="line-through decoration-ims-faint">{String(v?.old ?? "—") || "—"}</span> → <span className="font-semibold text-ims-text">{String(v?.new ?? "—") || "—"}</span>
                  </li>
                ))}
                {!changes.length && <li>edited lines</li>}
              </ul>
            ) : (
              AUDIT_TEXT[e.action] || e.action.replace(/_/g, " ")
            ),
          comment: e.comment,
          tone: AUDIT_TONE[e.action] || "default",
        };
      }),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
