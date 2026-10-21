/**
 * Budget building blocks: utilisation status (icon + label + reserved status colour), utilisation bar,
 * stacked department chart, budget-line picker with live availability, override dialog and the ledger
 * drill-down of a line.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertOctagon, AlertTriangle, CheckCircle2, Pencil, ShieldAlert, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import pocketbase from "@/lib/pocketbase";
import { BudgetLineUsage, LEDGER_TYPE, SERIES, SOURCE_LINK, STATUS_COLOR, STATUS_LABEL, UseStatus, budgetApi } from "@/lib/budget";
import { rwf, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ListSkeleton } from "@/components/enterprise/ui";
import { usePermissions } from "@/context/auth.context";
import { cn } from "@/utils";

const STATUS_ICON = { green: CheckCircle2, amber: AlertTriangle, red: AlertOctagon };

export function UseBadge({ status, pct }: { status: UseStatus; pct?: number }) {
  const Icon = STATUS_ICON[status];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-medium text-slate-700">
      <Icon size={13} style={{ color: STATUS_COLOR[status] }} aria-hidden />
      {pct !== undefined && <span className="tabular-nums">{pct.toFixed(pct >= 100 ? 0 : 1)}%</span>}
      <span className="text-slate-500">{STATUS_LABEL[status]}</span>
    </span>
  );
}

/** Actual + committed against the budget, with the % and status beside it. */
export function UseBar({ line, compact }: { line: Pick<BudgetLineUsage, "budget" | "actual" | "committed" | "used_pct" | "status">; compact?: boolean }) {
  const b = Math.max(line.budget, 1);
  const a = Math.min((line.actual / b) * 100, 100);
  const c = Math.min((line.committed / b) * 100, Math.max(100 - a, 0));
  return (
    <div className={cn("flex items-center gap-2", compact ? "min-w-[150px]" : "min-w-[200px]")}>
      <div className="flex h-2 flex-1 overflow-hidden rounded-full" style={{ background: SERIES.track }} title={`Actual ${rwf(line.actual)} · Committed ${rwf(line.committed)} · Budget ${rwf(line.budget)}`}>
        <span style={{ width: `${a}%`, background: SERIES.actual }} />
        {c > 0 && <span style={{ width: `${c}%`, background: SERIES.committed, marginLeft: a > 0 ? 2 : 0 }} />}
      </div>
      <UseBadge status={line.status} pct={line.used_pct} />
    </div>
  );
}

export function UseLegend({ thresholds }: { thresholds?: { amber: number; red: number } }) {
  const t = thresholds || { amber: 75, red: 90 };
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-slate-600">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.actual }} /> Actual</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.committed }} /> Committed</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES.track }} /> Available</span>
      <span className="mx-1 hidden h-3 w-px bg-slate-200 sm:inline-block" />
      <UseBadge status="green" /> <span className="-ml-3 text-slate-400">&lt; {t.amber}%</span>
      <UseBadge status="amber" /> <span className="-ml-3 text-slate-400">{t.amber}–{t.red}%</span>
      <UseBadge status="red" /> <span className="-ml-3 text-slate-400">&gt; {t.red}%</span>
    </div>
  );
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-card-hover">
      <p className="mb-1 font-semibold text-slate-900">{label}</p>
      {[["Actual", row.actual, SERIES.actual], ["Committed", row.committed, SERIES.committed], ["Available", row.available, SERIES.track]].map(([n, v, c]) => (
        <p key={n as string} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ background: c as string }} />
          {n}
          <span className="ml-auto pl-4 font-semibold tabular-nums text-slate-900">{rwf(v as number)}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-slate-600">Budget <span className="font-semibold tabular-nums text-slate-900">{rwf(row.budget)}</span></p>
      <p className="mt-1"><UseBadge status={row.status} pct={row.used_pct} /></p>
    </div>
  );
}

/** One stacked bar per group (department, funding source…): actual, committed, available. */
export function UseChart({ rows, labelWidth = 150 }: { rows: { name: string; budget: number; actual: number; committed: number; available: number; used_pct: number; status: UseStatus }[]; labelWidth?: number }) {
  const data = rows.map((r) => ({ ...r, avail: Math.max(r.available, 0) }));
  const fmt = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${Math.round(v / 1e6)}M` : `${Math.round(v / 1e3)}k`);
  return (
    <div style={{ height: Math.max(data.length * 34 + 30, 140) }} role="img" aria-label="Budget utilisation chart">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke="#eef0f2" />
          <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 11, fill: "#64748b" }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={labelWidth} tick={{ fontSize: 12, fill: "#334155" }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip content={<ChartTip />} cursor={{ fill: "#f1f5f9" }} />
          <Bar dataKey="actual" stackId="u" fill={SERIES.actual} isAnimationActive={false} maxBarSize={16} />
          <Bar dataKey="committed" stackId="u" fill={SERIES.committed} isAnimationActive={false} maxBarSize={16} />
          <Bar dataKey="avail" stackId="u" fill={SERIES.track} radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={16} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Group usage lines by a key into chart rows with status. */
export function groupUsage(items: BudgetLineUsage[], key: (i: BudgetLineUsage) => string, thresholds: { amber: number; red: number }) {
  const g: Record<string, { name: string; budget: number; actual: number; committed: number; available: number }> = {};
  for (const i of items) {
    if (i.kind === "revenue") continue;
    const k = key(i) || "—";
    g[k] = g[k] || { name: k, budget: 0, actual: 0, committed: 0, available: 0 };
    g[k].budget += i.budget;
    g[k].actual += i.actual;
    g[k].committed += i.committed;
    g[k].available += i.available;
  }
  return Object.values(g)
    .map((r) => {
      const used_pct = r.budget ? Math.round(((r.actual + r.committed) / r.budget) * 1000) / 10 : 0;
      const status: UseStatus = used_pct > thresholds.red ? "red" : used_pct >= thresholds.amber ? "amber" : "green";
      return { ...r, used_pct, status };
    })
    .sort((a, b) => b.used_pct - a.used_pct);
}

// ------------------------------------------------------------------ line picker (requisitions, POs, vouchers)
export function BudgetLinePicker({
  value, onChange, department, amount, disabled, anyDepartment,
}: { value: string; onChange: (id: string) => void; department?: string; amount?: number; disabled?: boolean; anyDepartment?: boolean }) {
  const lines = useQuery(["budget-line-options", department, anyDepartment], async () => {
    const fy = await pocketbase.collection("fiscal_years").getFirstListItem("is_current = true").catch(() => null);
    const filter = [`status = "active"`, `kind != "revenue"`, fy ? `fiscal_year = "${fy.id}"` : "", department && !anyDepartment ? `department = "${department}"` : ""].filter(Boolean).join(" && ");
    return pocketbase.collection("budget_lines").getFullList({ filter, sort: "code", expand: "gl_account,funding_source,project", batch: 1000 });
  }, { staleTime: 60_000 });
  const avail = useQuery(["budget-available", value, amount], () => budgetApi.available(value, amount), { enabled: Boolean(value), retry: false });
  const a = avail.data;
  return (
    <div className="space-y-1.5">
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className="block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] text-slate-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50 sm:h-10 sm:text-[13.5px]"
        aria-label="Budget line"
      >
        <option value="">Choose the budget line…</option>
        {(lines.data || []).map((l: any) => (
          <option key={l.id} value={l.id}>
            {l.code} — {l.expand?.gl_account?.name || l.name} · {l.expand?.funding_source?.code || ""}{l.expand?.project ? ` · ${l.expand.project.code}` : ""}
          </option>
        ))}
      </select>
      {value && a && (
        <p className={cn("flex items-center gap-1.5 text-[12.5px]", a.sufficient ? "text-emerald-700" : "text-red-700")}>
          {a.sufficient ? <CheckCircle2 size={13} /> : <AlertOctagon size={13} />}
          {rwf(a.available)} available{amount ? (a.sufficient ? " — enough for this request" : ` — ${rwf(amount - a.available)} short; submission will be blocked unless the DAF overrides`) : ""}
        </p>
      )}
      {!lines.isLoading && !(lines.data || []).length && <p className="text-[12.5px] text-amber-700">No active budget line for your department. Ask the Budget Officer.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ override
export function OverrideButton({ documentType, documentId, number, onDone, size = "sm" }: { documentType: string; documentId: string; number: string; onDone?: () => void; size?: "sm" | "default" }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await budgetApi.override(documentType, documentId, reason.trim());
      toast.success(`Budget override recorded for ${number}. It is flagged in the budget reports.`);
      setOpen(false);
      setReason("");
      onDone?.();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Button size={size} variant="outline" onClick={() => setOpen(true)} className="border-amber-300 text-amber-800 hover:bg-amber-50">
        <ShieldAlert size={14} /> Override budget
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Override budget control · {number}</DialogTitle>
            <DialogDescription>Allows this document to exceed its budget line. Your name and reason are recorded and the override is flagged in the budget reports for the Internal Auditor.</DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-slate-700">Reason <span className="text-red-600">*</span></span>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why may this spend exceed the budget, and how will it be covered?" className="h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={run} disabled={busy || reason.trim().length < 15}><ShieldAlert size={14} /> Record override</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ------------------------------------------------------------------ document budget panel
/**
 * Budget strip on a requisition or purchase order: the line it is charged to, what is still available
 * against this document, and — when short while still a draft — the DAF override. Optionally lets the
 * preparer choose or change the line.
 */
export function BudgetPanel({
  documentType, documentId, number, lineId, amount, department, committed = 0, overrideId, editable, allowOverride, onChangeLine, onDone, stacked,
}: {
  documentType: string; documentId: string; number: string; lineId?: string; amount: number; department?: string; committed?: number;
  overrideId?: string; editable?: boolean; allowOverride?: boolean; onChangeLine?: (id: string) => Promise<unknown>; onDone?: () => void;
  /** Narrow side column: figures under the line instead of beside it. */
  stacked?: boolean;
}) {
  const { can } = usePermissions();
  const [changing, setChanging] = React.useState(false);
  const [pick, setPick] = React.useState(lineId || "");
  const need = Math.max(amount - committed, 0);
  const q = useQuery(["budget-available", lineId, need], () => budgetApi.available(lineId!, need || undefined), { enabled: Boolean(lineId), retry: false });
  const a = q.data;
  const short = a && need > 0 && !a.sufficient;
  const save = async () => {
    try {
      await onChangeLine?.(pick);
      toast.success(`Budget line set on ${number}`);
      setChanging(false);
      onDone?.();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };
  if (changing || (!lineId && editable)) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card">
        <p className="mb-2 flex items-center gap-2 text-[13px] font-semibold text-slate-800"><Wallet size={15} className="text-slate-400" /> Budget line</p>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
          <div className="min-w-0 flex-1"><BudgetLinePicker value={pick} onChange={setPick} department={department} amount={need || undefined} anyDepartment={!department} /></div>
          <Button size="sm" onClick={save} disabled={!pick || pick === lineId}>Save line</Button>
          {lineId && <Button size="sm" variant="ghost" onClick={() => { setChanging(false); setPick(lineId); }}>Cancel</Button>}
        </div>
      </div>
    );
  }
  if (!lineId) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-[13px] text-amber-900">
        <AlertTriangle size={15} /> No budget line yet — it must be chosen before {number} can be submitted.
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col gap-2 rounded-lg border bg-white px-4 py-3 shadow-card", !stacked && "lg:flex-row lg:items-center lg:justify-between", short && !overrideId ? "border-red-200" : "border-slate-200")}>
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-slate-100 text-slate-500"><Wallet size={16} /></span>
        <div className="min-w-0">
          <p className="text-[12px] text-slate-500">Charged to budget line</p>
          <p className={cn("text-[13.5px] font-semibold text-slate-900", !stacked && "truncate")}><span className="font-mono">{a?.line.code || "…"}</span>{a?.line.name ? <span className="font-normal text-slate-600"> — {a.line.name}</span> : null}</p>
        </div>
        {a && <span className="mt-1 hidden sm:block"><UseBadge status={a.status} pct={a.used_pct} /></span>}
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[12.5px]">
        {a && (
          <>
            <span><span className="text-slate-500">Available </span><strong className={cn("tabular-nums", a.available < 0 ? "text-red-700" : "text-slate-900")}>{rwf(a.available)}</strong></span>
            {need > 0 && <span><span className="text-slate-500">{committed ? "Still to commit " : "This document "}</span><strong className="tabular-nums text-slate-900">{rwf(need)}</strong></span>}
            {committed > 0 && <span><span className="text-slate-500">Committed </span><strong className="tabular-nums text-slate-900">{rwf(committed)}</strong></span>}
            {need > 0 && (a.sufficient
              ? <span className="flex items-center gap-1 text-emerald-700"><CheckCircle2 size={13} /> Enough budget</span>
              : overrideId
                ? <span className="flex items-center gap-1 font-medium text-amber-800"><ShieldAlert size={13} /> {rwf(need - a.available)} above the line — allowed by DAF override</span>
                : <span className="flex items-center gap-1 font-medium text-red-700"><AlertOctagon size={13} /> {rwf(need - a.available)} short{a.control === "block" ? " — submission is blocked" : ""}</span>)}
          </>
        )}
        {overrideId && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-semibold text-amber-800" title="The DAF allowed this document past budget control">OVERRIDE GRANTED</span>}
        {editable && <Button size="sm" variant="ghost" onClick={() => setChanging(true)}><Pencil size={13} /> Change</Button>}
        {short && allowOverride && !overrideId && can("override_budget") && <OverrideButton documentType={documentType} documentId={documentId} number={number} onDone={onDone} />}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ ledger drill-down
export function LineLedgerDialog({ line, onClose }: { line: BudgetLineUsage | null; onClose: () => void }) {
  const q = useQuery(["budget-line-ledger", line?.id], () => budgetApi.ledger(line!.id), { enabled: Boolean(line) });
  return (
    <Dialog open={Boolean(line)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col bg-white">
        <DialogHeader>
          <DialogTitle>{line?.code} — {line?.name}</DialogTitle>
          <DialogDescription>{line?.department_name} · {line?.funding_code}{line?.project_code ? ` · ${line.project_code}` : ""} · {line?.account}</DialogDescription>
        </DialogHeader>
        {line && (
          <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg bg-slate-100 sm:grid-cols-4">
            {[["Budget", line.budget], ["Committed", line.committed], ["Actual", line.actual], ["Available", line.available]].map(([k, v]) => (
              <div key={k as string} className="bg-white px-3 py-2">
                <p className="text-[11.5px] text-slate-500">{k}</p>
                <p className={cn("text-[15px] font-semibold tabular-nums", k === "Available" && (v as number) < 0 ? "text-red-600" : "text-slate-900")}>{rwf(v as number)}</p>
              </div>
            ))}
          </div>
        )}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {q.isLoading ? (
            <ListSkeleton rows={4} />
          ) : !q.data?.entries.length ? (
            <p className="py-6 text-center text-[13px] text-slate-500">No commitments or actuals yet.</p>
          ) : (
            <table className="dnr-grid w-full text-[12.5px]">
              <thead><tr><th>Date</th><th>Movement</th><th>Document</th><th className="text-right">Amount</th></tr></thead>
              <tbody>
                {q.data.entries.map((e) => {
                  const link = SOURCE_LINK[e.source_type]?.(e.source_id);
                  const negative = e.type === "commitment_release" || e.type === "actual_reversal";
                  return (
                    <tr key={e.id}>
                      <td className="whitespace-nowrap text-slate-600">{showDay(e.date)}</td>
                      <td>
                        {LEDGER_TYPE[e.type] || e.type}
                        {e.override && <span className="ml-1.5 rounded bg-amber-100 px-1 text-[10.5px] font-semibold text-amber-800">OVERRIDE</span>}
                        <span className="block text-[11.5px] text-slate-500">{e.description}</span>
                      </td>
                      <td>{link ? <Link to={link} className="font-mono text-primaryDark hover:underline" onClick={onClose}>{e.source_number}</Link> : <span className="font-mono">{e.source_number}</span>}</td>
                      <td className={cn("text-right tabular-nums", negative ? "text-slate-500" : "text-slate-900")}>{negative ? "−" : ""}{rwf(e.amount)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
