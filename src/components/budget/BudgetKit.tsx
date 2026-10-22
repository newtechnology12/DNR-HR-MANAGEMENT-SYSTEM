/**
 * Budget building blocks: budget use level (a coloured dot + "On track" / "Watch" / "Critical"; a health
 * indicator, not a document status), the actual + committed bar, the stacked chart by group, the budget-line
 * picker with live availability, the DAF override dialog, the budget panel shown on requisitions, orders and
 * vouchers, and the ledger drill-down of a line. Colours come from the design tokens.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { AlertOctagon, AlertTriangle, CheckCircle2, Pencil, ShieldAlert, Wallet } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import pocketbase from "@/lib/pocketbase";
import { BudgetLineUsage, LEDGER_TYPE, SOURCE_LINK, STATUS_LABEL, UseStatus, budgetApi } from "@/lib/budget";
import { errorMessage } from "@/lib/procurement";
import { CHART } from "@/components/enterprise/ui";
import { color } from "@/design/tokens";
import { usePermissions } from "@/context/auth.context";
import { cn } from "@/utils";
import { Button, Card, CardHeader, Column, DataTable, DocNo, EmptyState, Field, Modal, Select, Textarea, fmtDate, fmtMoney, fmtNumber } from "@/components/ims";

/** Chart series: actual (series 1), committed (series 2); what is still available is a neutral track. */
export const USE_SERIES = { actual: CHART.series1, committed: CHART.series2, track: color.border };

/** Use levels are a health indicator: green = success, amber = priority-high (orange), red = danger. */
const USE_DOT: Record<UseStatus, string> = { green: "bg-ims-success", amber: "bg-ims-priority-high", red: "bg-ims-danger" };

export function UseDot({ status, className }: { status: UseStatus; className?: string }) {
  return <span className={cn("h-2 w-2 shrink-0 rounded-full", USE_DOT[status], className)} aria-hidden />;
}

/** "● 82.5% Watch": dot in the level's colour, the % used, then the level in words. */
export function UseBadge({ status, pct }: { status: UseStatus; pct?: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-t-small">
      <UseDot status={status} />
      {pct !== undefined && <span className="font-semibold tabular-nums text-ims-text">{pct.toFixed(pct >= 100 ? 0 : 1)}%</span>}
      <span className={status === "red" ? "font-semibold text-ims-danger" : "text-ims-muted"}>{STATUS_LABEL[status]}</span>
    </span>
  );
}

/** The bar alone: actual, then committed, on the track of the budget. */
export function SpendBar({ budget, actual, committed, className }: { budget: number; actual: number; committed: number; className?: string }) {
  const b = Math.max(budget, 1);
  const a = Math.min((actual / b) * 100, 100);
  const c = Math.min((committed / b) * 100, Math.max(100 - a, 0));
  return (
    <div className={cn("flex h-2 flex-1 overflow-hidden rounded-pill", className)} style={{ background: USE_SERIES.track }} title={`Actual ${fmtMoney(actual)} · Committed ${fmtMoney(committed)} · Budget ${fmtMoney(budget)}`}>
      <span style={{ width: `${a}%`, background: USE_SERIES.actual }} />
      {c > 0 && <span style={{ width: `${c}%`, background: USE_SERIES.committed, marginLeft: a > 0 ? 2 : 0 }} />}
    </div>
  );
}

/** Actual + committed against the budget, with the % and use level beside it. */
export function UseBar({ line, compact }: { line: Pick<BudgetLineUsage, "budget" | "actual" | "committed" | "used_pct" | "status">; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2", compact ? "min-w-[190px]" : "min-w-[240px]")}>
      <SpendBar budget={line.budget} actual={line.actual} committed={line.committed} className="min-w-[56px]" />
      <UseBadge status={line.status} pct={line.used_pct} />
    </div>
  );
}

function Swatch({ fill, children }: { fill: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ background: fill }} aria-hidden /> {children}
    </span>
  );
}

export function UseLegend({ thresholds }: { thresholds?: { amber: number; red: number } }) {
  const t = thresholds || { amber: 75, red: 90 };
  const level = (s: UseStatus, range: string) => (
    <span className="inline-flex items-center gap-1.5">
      <UseDot status={s} /> {STATUS_LABEL[s]} <span className="text-ims-faint">{range}</span>
    </span>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-t-small text-ims-body">
      <Swatch fill={USE_SERIES.actual}>Actual</Swatch>
      <Swatch fill={USE_SERIES.committed}>Committed</Swatch>
      <Swatch fill={USE_SERIES.track}>Available</Swatch>
      <span className="hidden h-3 w-px bg-ims-divider sm:inline-block" aria-hidden />
      {level("green", `under ${t.amber}%`)}
      {level("amber", `${t.amber}–${t.red}%`)}
      {level("red", `over ${t.red}%`)}
    </div>
  );
}

function ChartTip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const row = payload[0].payload;
  return (
    <div className="rounded-control border border-ims-border bg-ims-card px-3 py-2 text-t-small shadow-menu">
      <p className="mb-1 font-bold text-ims-text">{label}</p>
      {([["Actual", row.actual, USE_SERIES.actual], ["Committed", row.committed, USE_SERIES.committed], ["Available", row.available, USE_SERIES.track]] as const).map(([n, v, c]) => (
        <p key={n} className="flex items-center gap-2 text-ims-body">
          <span className="h-2 w-2 rounded-full" style={{ background: c }} aria-hidden />
          {n}
          <span className="ml-auto pl-4 font-bold tabular-nums text-ims-text">{fmtMoney(v)}</span>
        </p>
      ))}
      <p className="mt-1 flex justify-between border-t border-ims-divider pt-1 text-ims-body">Budget <span className="font-bold tabular-nums text-ims-text">{fmtMoney(row.budget)}</span></p>
      <p className="mt-1"><UseBadge status={row.status} pct={row.used_pct} /></p>
    </div>
  );
}

/** One stacked bar per group (department, funding source…): actual, committed, available. */
export function UseChart({ rows, labelWidth = 150 }: { rows: { name: string; budget: number; actual: number; committed: number; available: number; used_pct: number; status: UseStatus }[]; labelWidth?: number }) {
  const data = rows.map((r) => ({ ...r, avail: Math.max(r.available, 0) }));
  const fmt = (v: number) => (v >= 1e9 ? `${(v / 1e9).toFixed(1)}B` : v >= 1e6 ? `${Math.round(v / 1e6)}M` : `${Math.round(v / 1e3)}k`);
  return (
    <div style={{ height: Math.max(data.length * 34 + 30, 140) }} role="img" aria-label="Budget use by group: actual, committed and available">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={8}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis type="number" tickFormatter={fmt} tick={{ fontSize: 12, fill: CHART.axis }} axisLine={false} tickLine={false} />
          <YAxis type="category" dataKey="name" width={labelWidth} tick={{ fontSize: 12.5, fill: CHART.ink }} axisLine={false} tickLine={false} interval={0} />
          <Tooltip content={<ChartTip />} cursor={{ fill: CHART.grid }} />
          <Bar dataKey="actual" stackId="u" fill={USE_SERIES.actual} isAnimationActive={false} maxBarSize={16} />
          <Bar dataKey="committed" stackId="u" fill={USE_SERIES.committed} isAnimationActive={false} maxBarSize={16} />
          <Bar dataKey="avail" stackId="u" fill={USE_SERIES.track} radius={[0, 4, 4, 0]} isAnimationActive={false} maxBarSize={16} />
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
  value, onChange, department, amount, disabled, anyDepartment, id, invalid,
}: { value: string; onChange: (id: string) => void; department?: string; amount?: number; disabled?: boolean; anyDepartment?: boolean; id?: string; invalid?: boolean }) {
  const lines = useQuery(["budget-line-options", department, anyDepartment], async () => {
    const fy = await pocketbase.collection("fiscal_years").getFirstListItem("is_current = true").catch(() => null);
    const filter = [`status = "active"`, `kind != "revenue"`, fy ? `fiscal_year = "${fy.id}"` : "", department && !anyDepartment ? `department = "${department}"` : ""].filter(Boolean).join(" && ");
    return pocketbase.collection("budget_lines").getFullList({ filter, sort: "code", expand: "gl_account,funding_source,project", batch: 1000 });
  }, { staleTime: 60_000 });
  const avail = useQuery(["budget-available", value, amount], () => budgetApi.available(value, amount), { enabled: Boolean(value), retry: false });
  const a = avail.data;
  return (
    <div className="space-y-1.5">
      <Select
        id={id}
        invalid={invalid}
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        aria-label="Budget line"
      >
        <option value="">Choose the budget line…</option>
        {(lines.data || []).map((l: any) => (
          <option key={l.id} value={l.id}>
            {l.code} — {l.expand?.gl_account?.name || l.name} · {l.expand?.funding_source?.code || ""}{l.expand?.project ? ` · ${l.expand.project.code}` : ""}
          </option>
        ))}
      </Select>
      {value && a && (
        <p className={cn("flex items-start gap-1.5 text-t-small", a.sufficient ? "text-ims-success" : "text-ims-danger")}>
          {a.sufficient ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" aria-hidden /> : <AlertOctagon size={14} className="mt-0.5 shrink-0" aria-hidden />}
          <span>
            {fmtMoney(a.available)} available
            {amount ? (a.sufficient ? ", enough for this request." : `. ${fmtMoney(amount - a.available)} short: submission is blocked unless the DAF overrides budget control.`) : "."}
          </span>
        </p>
      )}
      {!lines.isLoading && !(lines.data || []).length && <p className="text-t-small text-ims-warning">No active budget line for your department. Ask the Budget Officer to open one.</p>}
    </div>
  );
}

// ------------------------------------------------------------------ override
export function OverrideButton({ documentType, documentId, number, onDone, size = "sm" }: { documentType: string; documentId: string; number: string; onDone?: () => void; size?: "sm" | "default" }) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const tooShort = reason.trim().length < 15;
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
      <Button size={size === "default" ? "md" : "sm"} icon={ShieldAlert} onClick={() => setOpen(true)} className="border-ims-warning/40 text-ims-warning hover:bg-ims-warning-bg">
        Override budget
      </Button>
      <Modal
        open={open}
        onClose={() => (busy ? undefined : setOpen(false))}
        size="sm"
        title={`Override budget control for ${number}?`}
        description="This document may then go above its budget line. Your name and reason are recorded, and the override is flagged in the budget reports for the Internal Auditor."
        footer={
          <>
            <Button onClick={() => setOpen(false)} disabled={busy}>Cancel</Button>
            <Button variant="primary" icon={ShieldAlert} onClick={run} loading={busy} disabled={tooShort}>Record override</Button>
          </>
        }
      >
        <Field label="Reason" required htmlFor="override-reason" hint="At least 15 characters. Say why this spend may exceed the budget and how it will be covered.">
          <Textarea id="override-reason" autoFocus value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Why may this spend exceed the budget, and how will it be covered?" />
        </Field>
      </Modal>
    </>
  );
}

// ------------------------------------------------------------------ document budget panel
/**
 * Budget card on a requisition, purchase order or voucher: the line it is charged to, what is still
 * available against this document, and — when short while still a draft — the DAF override. Optionally
 * lets the preparer choose or change the line.
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
      <Card>
        <CardHeader title="Budget line" subtitle={`The line ${number} is charged to.`} />
        <div className={cn("flex flex-col gap-2", !stacked && "sm:flex-row sm:items-start")}>
          <div className="min-w-0 flex-1"><BudgetLinePicker value={pick} onChange={setPick} department={department} amount={need || undefined} anyDepartment={!department} /></div>
          <div className="flex shrink-0 items-center gap-2">
            <Button variant="primary" onClick={save} disabled={!pick || pick === lineId}>Save line</Button>
            {lineId && <Button variant="ghost" onClick={() => { setChanging(false); setPick(lineId); }}>Cancel</Button>}
          </div>
        </div>
      </Card>
    );
  }
  if (!lineId) {
    return (
      <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>No budget line yet. Choose one before {number} can be submitted.</span>
      </p>
    );
  }
  const figures: [string, React.ReactNode][] = a
    ? [
        ["Available", <span key="a" className={a.available < 0 ? "text-ims-danger" : undefined}>{fmtMoney(a.available)}</span>],
        ...(need > 0 ? [[committed ? "Still to commit" : "This document", fmtMoney(need)] as [string, React.ReactNode]] : []),
        ...(committed > 0 ? [["Committed", fmtMoney(committed)] as [string, React.ReactNode]] : []),
      ]
    : [];
  const verdict =
    a && need > 0 ? (
      a.sufficient ? (
        <span className="flex items-center gap-1.5 text-ims-success"><CheckCircle2 size={15} className="shrink-0" aria-hidden /> Enough budget on this line</span>
      ) : overrideId ? (
        <span className="flex items-start gap-1.5 font-semibold text-ims-warning"><ShieldAlert size={15} className="mt-0.5 shrink-0" aria-hidden /> {fmtMoney(need - a.available)} above the line, allowed by a DAF override</span>
      ) : (
        <span className="flex items-start gap-1.5 font-semibold text-ims-danger"><AlertOctagon size={15} className="mt-0.5 shrink-0" aria-hidden /> {fmtMoney(need - a.available)} short{a.control === "block" ? ". Submission is blocked." : ""}</span>
      )
    ) : null;
  const overrideNote = overrideId && !(short && verdict) ? (
    <span className="flex items-center gap-1.5 font-semibold text-ims-warning" title="The DAF allowed this document past budget control"><ShieldAlert size={15} className="shrink-0" aria-hidden /> DAF override granted</span>
  ) : null;
  const tools = (
    <>
      {editable && <Button size="sm" variant="ghost" icon={Pencil} onClick={() => setChanging(true)}>Change line</Button>}
      {short && allowOverride && !overrideId && can("override_budget") && <OverrideButton documentType={documentType} documentId={documentId} number={number} onDone={onDone} />}
    </>
  );
  const hasTools = Boolean(editable || (short && allowOverride && !overrideId && can("override_budget")));
  return (
    <Card className={cn(short && !overrideId && "border-ims-danger/40")}>
      <CardHeader className="mb-3" title="Budget" subtitle="Charged to this budget line." action={a ? <UseBadge status={a.status} pct={a.used_pct} /> : undefined} />
      <div className={cn("flex flex-col gap-3", !stacked && "lg:flex-row lg:items-start lg:justify-between lg:gap-6")}>
        <p className={cn("min-w-0 text-t-body font-semibold text-ims-text", !stacked && "lg:truncate")}>
          <span className="whitespace-nowrap font-mono text-t-small">{a?.line.code || "…"}</span>
          {a?.line.name ? <span className="font-normal text-ims-body"> · {a.line.name}</span> : null}
        </p>
        {figures.length > 0 && (
          <dl className={cn("space-y-2 text-t-body", stacked ? "border-t border-ims-divider pt-3" : "shrink-0 lg:min-w-[260px]")}>
            {figures.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt className="text-ims-muted">{k}</dt>
                <dd className="text-right font-semibold tabular-nums text-ims-text">{v}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>
      {(verdict || overrideNote || hasTools) && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-t-small">
          <div className="min-w-0 space-y-1">
            {verdict}
            {overrideNote}
          </div>
          {hasTools && <div className="flex flex-wrap items-center gap-2">{tools}</div>}
        </div>
      )}
    </Card>
  );
}

// ------------------------------------------------------------------ ledger drill-down
type LedgerEntry = { id: string; date: string; type: string; amount: number; source_type: string; source_id: string; source_number: string; description: string; override: string };

export function LineLedgerDialog({ line, onClose }: { line: BudgetLineUsage | null; onClose: () => void }) {
  const navigate = useNavigate();
  const q = useQuery(["budget-line-ledger", line?.id], () => budgetApi.ledger(line!.id), { enabled: Boolean(line) });
  const entries: LedgerEntry[] = q.data?.entries || [];
  const isOut = (e: LedgerEntry) => e.type === "commitment_release" || e.type === "actual_reversal";
  const net = entries.reduce((s, e) => s + (isOut(e) ? -e.amount : e.amount), 0);
  const columns: Column<LedgerEntry>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (e) => fmtDate(e.date) },
    {
      key: "type",
      header: "Movement",
      clamp: true,
      cell: (e) => (
        <span className="inline-flex flex-wrap items-center gap-x-2">
          {LEDGER_TYPE[e.type] || e.type}
          {e.override && <span className="inline-flex items-center gap-1 text-t-small font-semibold text-ims-warning"><ShieldAlert size={13} aria-hidden /> Override</span>}
        </span>
      ),
      sub: (e) => e.description,
    },
    { key: "doc", header: "Document", nowrap: true, cell: (e) => <DocNo value={e.source_number} className={SOURCE_LINK[e.source_type] ? "text-ims-link" : undefined} /> },
    {
      key: "amount",
      header: "Amount (RWF)",
      numeric: true,
      cell: (e) => <span className={isOut(e) ? "text-ims-muted" : undefined}>{isOut(e) ? "−" : ""}{fmtNumber(e.amount)}</span>,
      total: <span className="tabular-nums">{net < 0 ? "−" : ""}{fmtNumber(Math.abs(net))}</span>,
    },
  ];
  const open = (e: LedgerEntry) => {
    const link = SOURCE_LINK[e.source_type]?.(e.source_id);
    if (!link) return;
    onClose();
    navigate(link);
  };
  return (
    <Modal
      open={Boolean(line)}
      onClose={onClose}
      size="lg"
      title={line ? `${line.code} · ${line.name}` : ""}
      description={line ? `${line.department_name} · ${line.funding_code}${line.project_code ? ` · ${line.project_code}` : ""} · ${line.account}` : undefined}
      footer={<Button onClick={onClose}>Close</Button>}
    >
      {line && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-t-body text-ims-body">
          {([["Budget", line.budget], ["Committed", line.committed], ["Actual", line.actual], ["Available", line.available]] as const).map(([k, v], i) => (
            <React.Fragment key={k}>
              {i > 0 && <span className="text-ims-faint" aria-hidden>·</span>}
              <span>
                <span className="text-ims-muted">{k} </span>
                <span className={cn("font-bold tabular-nums", k === "Available" && v < 0 ? "text-ims-danger" : "text-ims-text")}>{fmtMoney(v)}</span>
              </span>
            </React.Fragment>
          ))}
          <span className="ml-1"><UseBadge status={line.status} pct={line.used_pct} /></span>
        </p>
      )}
      <div className="overflow-hidden rounded-control border border-ims-border">
        <DataTable
          columns={columns}
          rows={entries}
          rowKey={(e) => e.id}
          loading={q.isLoading}
          error={q.isError ? new Error(errorMessage(q.error)) : undefined}
          onRetry={() => q.refetch()}
          onRowClick={entries.some((e) => SOURCE_LINK[e.source_type]) ? open : undefined}
          totalLabel="Net movements"
          minWidth={600}
          caption="Commitments and actuals of this budget line"
          empty={<EmptyState compact icon={Wallet} text="No commitments or actuals on this line yet." />}
        />
      </div>
    </Modal>
  );
}
