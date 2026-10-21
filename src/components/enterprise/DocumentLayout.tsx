/**
 * ERP-style document page (purchase orders, invoices, …):
 *   control bar (actions + status pipeline) → smart buttons → paper "sheet" with title,
 *   two-column field grid and notebook tabs → chatter (activity / audit) on the side.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { format, formatDistanceToNow } from "date-fns";
import { ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/utils";
import { Initials } from "./ui";

export function DocumentPage({ children, chatter }: { children: React.ReactNode; chatter?: React.ReactNode }) {
  return (
    <div className="px-4 py-4 sm:px-6">
      <div className={cn("grid gap-4", chatter && "min-[1760px]:grid-cols-[minmax(0,1fr)_340px]")}>
        <div className="min-w-0 space-y-3">{children}</div>
        {chatter && <aside className="min-w-0">{chatter}</aside>}
      </div>
    </div>
  );
}

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
  const idx = steps ? Math.max(steps.findIndex((s) => s.key === current), 0) : -1;
  return (
    <div className="space-y-2">
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-1 text-[13px]">
        {breadcrumbs.map((b, i) => (
          <React.Fragment key={b.title}>
            {i > 0 && <ChevronRight size={13} className="text-slate-400" />}
            {b.link && i < breadcrumbs.length - 1 ? (
              <Link to={b.link} className="text-primaryDark hover:underline">{b.title}</Link>
            ) : (
              <span className={cn(i === breadcrumbs.length - 1 ? "text-[17px] font-semibold text-slate-900" : "text-slate-500")}>{b.title}</span>
            )}
          </React.Fragment>
        ))}
      </nav>
      <div className="flex flex-col gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 shadow-card lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">{actions}</div>
        {steps && (
          <ol className="flex overflow-x-auto" aria-label="Document status">
            {steps.map((s, i) => {
              const active = i === idx;
              const done = i < idx;
              return (
                <li
                  key={s.key}
                  aria-current={active ? "step" : undefined}
                  className={cn(
                    "relative -ml-2 flex h-8 items-center whitespace-nowrap pl-5 pr-3 text-[12px] font-medium first:ml-0 first:pl-3",
                    "[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%,10px_50%)] first:[clip-path:polygon(0_0,calc(100%-10px)_0,100%_50%,calc(100%-10px)_100%,0_100%)]",
                    active ? "bg-primary text-white" : done ? "bg-primary/10 text-primaryDark" : "bg-slate-100 text-slate-500"
                  )}
                >
                  {s.label}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}

export function SmartButtons({ items }: { items: { icon: LucideIcon; label: string; value: React.ReactNode; onClick?: () => void; tone?: "default" | "warning" | "danger" }[] }) {
  if (!items.length) return null;
  return (
    <div className="flex flex-wrap justify-end gap-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card sm:ml-auto sm:w-fit">
      {items.map((it) => {
        const Comp = it.onClick ? "button" : "div";
        return (
          <Comp
            key={it.label}
            type={it.onClick ? "button" : undefined}
            onClick={it.onClick}
            className={cn("flex min-w-[140px] items-center gap-2.5 border-r border-slate-100 px-4 py-2 text-left last:border-r-0", it.onClick && "hover:bg-slate-50")}
          >
            <it.icon size={20} className={cn(it.tone === "danger" ? "text-red-500" : it.tone === "warning" ? "text-amber-500" : "text-primaryDark")} />
            <span className="leading-tight">
              <span className="block text-[15px] font-semibold tabular-nums text-slate-900">{it.value}</span>
              <span className="block text-[12px] text-slate-500">{it.label}</span>
            </span>
          </Comp>
        );
      })}
    </div>
  );
}

export function Sheet({ children, ribbon }: { children: React.ReactNode; ribbon?: { label: string; tone: "success" | "danger" | "warning" | "neutral" } }) {
  const ribbonTone = { success: "bg-emerald-600", danger: "bg-red-600", warning: "bg-amber-500", neutral: "bg-slate-500" };
  return (
    <section className="relative overflow-hidden rounded-lg border border-slate-200 bg-white px-5 py-6 shadow-card sm:px-8 sm:py-7">
      {ribbon && (
        <div className="pointer-events-none absolute right-0 top-0 h-28 w-28 overflow-hidden" aria-label={ribbon.label}>
          <span className={cn("absolute right-[-38px] top-[22px] w-[150px] rotate-45 py-1 text-center text-[11px] font-bold uppercase tracking-wider text-white shadow", ribbonTone[ribbon.tone])}>
            {ribbon.label}
          </span>
        </div>
      )}
      {children}
    </section>
  );
}

export function SheetTitle({ kicker, title, badges }: { kicker: string; title: React.ReactNode; badges?: React.ReactNode }) {
  return (
    <div className="mb-6 pr-16">
      <p className="text-[12.5px] font-medium text-slate-500">{kicker}</p>
      <h1 className="mt-0.5 flex flex-wrap items-center gap-2 text-[26px] font-semibold leading-tight tracking-tight text-slate-900">
        {title}
        {badges}
      </h1>
    </div>
  );
}

export type DocField = { label: string; value: React.ReactNode; hint?: string };

/** Two columns of label → value rows, the classic ERP header layout. */
export function FieldGrid({ left, right }: { left: DocField[]; right: DocField[] }) {
  const col = (fields: DocField[]) => (
    <dl className="space-y-0">
      {fields.map((f) => (
        <div key={f.label} className="grid grid-cols-[150px_minmax(0,1fr)] items-baseline gap-3 border-b border-dashed border-slate-100 py-2 last:border-b-0 sm:grid-cols-[170px_minmax(0,1fr)]">
          <dt className="text-[13px] font-semibold text-slate-700">{f.label}</dt>
          <dd className="min-w-0 break-words text-[13.5px] text-slate-900">
            {f.value === null || f.value === undefined || f.value === "" ? <span className="text-slate-400">—</span> : f.value}
            {f.hint && <span className="block text-[12px] text-slate-500">{f.hint}</span>}
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
  return (
    <div className="mt-8 flex gap-0 overflow-x-auto border-b border-slate-200" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.key}
          type="button"
          role="tab"
          aria-selected={active === t.key}
          onClick={() => onChange(t.key)}
          className={cn(
            "-mb-px whitespace-nowrap border px-4 py-2 text-[13px] font-medium",
            active === t.key ? "rounded-t-md border-slate-200 border-b-white bg-white text-slate-900" : "border-transparent text-slate-500 hover:text-slate-800"
          )}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 text-[11px] text-slate-600">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

/** Totals block aligned right under a lines table. */
export function Totals({ rows, total }: { rows: [string, React.ReactNode][]; total: [string, React.ReactNode] }) {
  return (
    <dl className="ml-auto mt-4 w-full max-w-sm space-y-1 text-[13.5px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-6 text-slate-600">
          <dt>{k}</dt>
          <dd className="tabular-nums">{v}</dd>
        </div>
      ))}
      <div className="flex justify-between gap-6 border-t-2 border-slate-900 pt-1.5 text-[16px] font-bold text-slate-900">
        <dt>{total[0]}</dt>
        <dd className="tabular-nums">{total[1]}</dd>
      </div>
    </dl>
  );
}

export type ChatterItem = { id: string; at: string; who?: string; text: React.ReactNode; comment?: string; tone?: "default" | "success" | "danger" | "warning" };

export function Chatter({ items, title = "Activity", composer }: { items: ChatterItem[]; title?: string; composer?: React.ReactNode }) {
  const dot = { default: "bg-slate-300", success: "bg-emerald-500", danger: "bg-red-500", warning: "bg-amber-500" };
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-card min-[1760px]:sticky min-[1760px]:top-4">
      <header className="border-b border-slate-100 px-4 py-3">
        <h3 className="text-[13px] font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      </header>
      {composer && <div className="border-b border-slate-100 px-4 py-3">{composer}</div>}
      <ol className="max-h-[70vh] space-y-4 overflow-y-auto px-4 py-4">
        {!items.length && <li className="text-[13px] text-slate-500">No activity yet.</li>}
        {items.map((e) => (
          <li key={e.id} className="flex gap-3">
            <div className="relative">
              <Initials name={e.who} />
              <span className={cn("absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-white", dot[e.tone || "default"])} />
            </div>
            <div className="min-w-0 flex-1 text-[13px]">
              <p className="text-slate-800">
                <span className="font-semibold">{e.who || "System"}</span>{" "}
                <span className="text-[11.5px] text-slate-400" title={format(new Date(e.at), "d MMM yyyy, HH:mm:ss")}>
                  {formatDistanceToNow(new Date(e.at), { addSuffix: true })}
                </span>
              </p>
              <div className="text-slate-600">{e.text}</div>
              {e.comment && <p className="mt-1 rounded-md bg-slate-50 px-2.5 py-1.5 text-slate-700">“{e.comment}”</p>}
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
};

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
      // Approval decisions already come from the workflow actions above.
      .filter((e) => !e.action.startsWith("approval_") && !(e.action === "submitted" && actions.some((a) => a.action === "submit")) && (e.action !== "updated" || Object.keys(e.changes || {}).length))
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
                    <span className="text-slate-500">{k.replace(/_/g, " ")}:</span> <span className="line-through decoration-slate-400">{String(v?.old ?? "—") || "—"}</span> → <span className="font-medium text-slate-800">{String(v?.new ?? "—") || "—"}</span>
                  </li>
                ))}
                {!changes.length && <li>edited lines</li>}
              </ul>
            ) : (
              AUDIT_TEXT[e.action] || e.action.replace(/_/g, " ")
            ),
          comment: e.comment,
          tone: (e.action === "payment_recorded" ? "success" : ["exception_resolved", "over_budget_warning"].includes(e.action) ? "warning" : "default") as ChatterItem["tone"],
        };
      }),
  ].sort((a, b) => b.at.localeCompare(a.at));
}
