/**
 * Reports → Executive dashboard (SG, DAF, management): cash, the year's surplus, budget use, what RALGA owes and
 * what waits for a decision — then revenue and spending month by month, cash at each month end, budget use by
 * department and the lines to watch. Every chart has a table view; colour is never the only way to read a value.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery } from "react-query";
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, BarChart3, FileText, Table2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { budgetApi } from "@/lib/budget";
import { DOCUMENT_TYPE_LABELS } from "@/lib/ims";
import { statementsApi } from "@/lib/statements";
import { chart, color } from "@/design/tokens";
import { Card, CardHeader, KpiBand, Page, PageHeader, Pill, fmtDate, fmtMoneyShort, fmtNumber } from "@/components/ims";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);
const compact = (n: number) => new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);
const STATUS = {
  green: { fill: color.success, word: "On track", tone: "success" as const },
  amber: { fill: color.warning, word: "Watch", tone: "warning" as const },
  red: { fill: color.danger, word: "Near or over", tone: "danger" as const },
};
const AXIS = { fontSize: 12, fill: chart.axis };

/** A chart with its table view (the table carries every value the chart shows). */
function ChartCard({ title, subtitle, className, chart: body, table, loading }: { title: string; subtitle?: string; className?: string; chart: React.ReactNode; table: React.ReactNode; loading?: boolean }) {
  const [view, setView] = React.useState<"chart" | "table">("chart");
  return (
    <Card className={className}>
      <CardHeader
        title={title}
        subtitle={subtitle}
        action={
          <div className="inline-flex rounded-control border border-ims-field p-0.5" role="group" aria-label={`${title}: view`}>
            {(["chart", "table"] as const).map((v) => (
              <button key={v} type="button" aria-pressed={view === v} onClick={() => setView(v)} className={cn("inline-flex h-8 items-center gap-1.5 rounded-[6px] px-2.5 text-[12.5px] font-semibold", view === v ? "bg-ims-subtle text-ims-text" : "text-ims-muted hover:text-ims-text")}>
                {v === "chart" ? <BarChart3 size={14} aria-hidden /> : <Table2 size={14} aria-hidden />} {v === "chart" ? "Chart" : "Table"}
              </button>
            ))}
          </div>
        }
      />
      {loading ? <Skeleton className="h-[260px] w-full" /> : view === "chart" ? body : <div className="max-h-[300px] overflow-auto">{table}</div>}
    </Card>
  );
}

/** Values lead, names follow; a short line key in the series colour. */
function Tip({ active, payload, label, money = true }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-control border border-ims-border bg-ims-card px-3 py-2 shadow-menu">
      <p className="mb-1 text-t-small font-semibold text-ims-muted">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-t-body">
          <span className="inline-block h-[3px] w-3 rounded-full" style={{ background: p.color || p.payload?.fill }} aria-hidden />
          <strong className="tabular-nums text-ims-text">{money ? `RWF ${fmtNumber(p.value)}` : `${p.value}%`}</strong>
          <span className="text-ims-muted">{p.name}</span>
        </p>
      ))}
    </div>
  );
}

function SmallTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="w-full border-collapse text-t-body">
      <thead className="sticky top-0 bg-ims-thead">
        <tr>{head.map((h, i) => <th key={h} className={cn("h-9 border-b border-ims-divider px-3 text-[12.5px] font-semibold text-ims-muted", i ? "text-right" : "text-left")}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} className="border-b border-ims-divider last:border-b-0">
            {r.map((c, j) => <td key={j} className={cn("px-3 py-1.5", j ? "text-right tabular-nums" : "")}>{typeof c === "number" ? fmtNumber(c) : c}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function ExecutiveDashboard() {
  const trend = useQuery(["exec-trend"], () => statementsApi.trend());
  const position = useQuery(["exec-position"], () => statementsApi.position(today()));
  const usage = useQuery(["exec-budget"], () => budgetApi.usage());
  const approvals = useQuery(["exec-approvals"], () => pocketbase.collection("approval_requests").getFullList({ filter: 'status = "pending"', fields: "id,document_type,amount", batch: 500 }));

  const p = position.data;
  const cash = p?.sections[0].groups.find((g) => g.code === "11")?.lines.find((l) => !l.code && l.detail);
  const surplus = p?.sections[2].groups[0].lines.find((l) => !l.code)?.amount ?? 0;
  const u = usage.data;
  const months = trend.data?.months || [];

  // budget use by department (spending lines only)
  const departments = React.useMemo(() => {
    const by: Record<string, { name: string; budget: number; used: number }> = {};
    for (const i of u?.items || []) {
      if ((i as any).kind === "revenue" || !i.budget) continue;
      const k = (i as any).department_name || "Organisation-wide";
      const d = by[k] || (by[k] = { name: k, budget: 0, used: 0 });
      d.budget += i.budget;
      d.used += i.committed + i.actual;
    }
    const amber = u?.thresholds?.amber ?? 75;
    const red = u?.thresholds?.red ?? 90;
    return Object.values(by).map((d) => {
      const pct = d.budget ? Math.round((d.used / d.budget) * 1000) / 10 : 0;
      return { ...d, pct, status: (pct > red ? "red" : pct >= amber ? "amber" : "green") as keyof typeof STATUS };
    }).sort((a, b) => b.pct - a.pct);
  }, [u]);
  const watch = React.useMemo(() => (u?.items || []).filter((i: any) => i.kind !== "revenue" && i.budget && (i.status === "red" || i.status === "amber")).sort((a: any, b: any) => b.used_pct - a.used_pct).slice(0, 6), [u]);
  const waiting = React.useMemo(() => {
    const by: Record<string, { type: string; count: number; amount: number }> = {};
    for (const a of (approvals.data || []) as any[]) {
      const k = a.document_type;
      const x = by[k] || (by[k] = { type: k, count: 0, amount: 0 });
      x.count += 1;
      x.amount += Math.round(a.amount || 0);
    }
    return Object.values(by).sort((a, b) => b.count - a.count);
  }, [approvals.data]);
  const budgetTone = u ? (u.totals.used_pct > (u.thresholds?.red ?? 90) ? "danger" : u.totals.used_pct >= (u.thresholds?.amber ?? 75) ? "warning" : "success") : "default";

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Reports" }, { label: "Executive dashboard" }]}
        title="Executive dashboard"
        subtitle="RALGA's finances at a glance: cash, the year's result, budget use and what waits for a decision."
        meta={p ? `At ${fmtDate(p.as_at)} · fiscal year from ${fmtDate(p.fy_start)}` : undefined}
        secondary={[{ label: "Financial statements", icon: FileText, to: "/dashboard/reports/statements" }]}
      />
      <KpiBand
        loading={position.isLoading || usage.isLoading || approvals.isLoading}
        items={[
          { label: "Cash and bank", value: cash ? fmtMoneyShort(cash.amount) : "—", sub: cash ? `in ${cash.detail?.length || 0} accounts` : undefined, to: "/dashboard/treasury" },
          { label: "Surplus, year to date", value: fmtMoneyShort(surplus), tone: surplus < 0 ? "danger" : "default", sub: "revenue less expenses" },
          { label: "Budget used", value: u ? `${u.totals.used_pct}%` : "—", tone: budgetTone as any, sub: u ? `${fmtMoneyShort(u.totals.committed + u.totals.actual)} of ${fmtMoneyShort(u.totals.budget)}` : undefined, to: "/dashboard/budget" },
          { label: "Owed", value: p ? fmtMoneyShort(p.totals.liabilities) : "—", sub: "payables and deductions" },
          { label: "Waiting for decisions", value: (approvals.data || []).length, tone: (approvals.data || []).length ? "warning" : "default", sub: "documents to approve", to: "/dashboard/approvals" },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Revenue and spending by month"
          subtitle={trend.data ? `Fiscal year from ${fmtDate(trend.data.fy_start)}` : undefined}
          loading={trend.isLoading}
          chart={
            <div className="h-[280px]" role="img" aria-label="Revenue and expenses for each month of the fiscal year; the table view lists the values.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={months} barGap={2} barCategoryGap="28%" margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={chart.grid} strokeWidth={1} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: chart.grid }} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compact} width={48} />
                  <Tooltip content={<Tip />} cursor={{ fill: color.subtle }} />
                  {/* the swatch carries the colour; the words stay in ink */}
                  <Legend iconType="rect" iconSize={10} wrapperStyle={{ fontSize: 12.5, paddingTop: 6 }} formatter={(value) => <span style={{ color: chart.ink }}>{value}</span>} />
                  <Bar dataKey="revenue" name="Revenue" fill={chart.series1} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                  <Bar dataKey="expenses" name="Expenses" fill={chart.series2} radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          }
          table={<SmallTable head={["Month", "Revenue (RWF)", "Expenses (RWF)", "Surplus (RWF)"]} rows={months.map((m) => [m.label, m.revenue, m.expenses, m.surplus])} />}
        />
        <ChartCard
          title="Cash at each month end"
          subtitle="All bank and cash accounts"
          loading={trend.isLoading}
          chart={
            <div className="h-[280px]" role="img" aria-label="Cash at the end of each month; the table view lists the values.">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={months} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={chart.grid} strokeWidth={1} />
                  <XAxis dataKey="label" tick={AXIS} axisLine={{ stroke: chart.grid }} tickLine={false} />
                  <YAxis tick={AXIS} axisLine={false} tickLine={false} tickFormatter={compact} width={48} domain={["auto", "auto"]} />
                  <Tooltip content={<Tip />} cursor={{ stroke: chart.axis, strokeWidth: 1 }} />
                  <Line type="linear" isAnimationActive={false} dataKey="cash" name="Cash" stroke={chart.series1} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" dot={{ r: 4, fill: chart.series1, stroke: color.card, strokeWidth: 2 }} activeDot={{ r: 5, fill: chart.series1, stroke: color.card, strokeWidth: 2 }}>
                    <LabelList dataKey="cash" position="top" content={({ x, y, value, index }: any) => (index === months.length - 1 ? <text x={x} y={y - 10} textAnchor="end" fontSize={12} fontWeight={700} fill={chart.ink}>{compact(Number(value))}</text> : null)} />
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </div>
          }
          table={<SmallTable head={["Month end", "Cash (RWF)"]} rows={months.map((m) => [m.label, m.cash])} />}
        />
      </div>

      <div className="grid items-start gap-4 lg:grid-cols-3">
        <ChartCard
          className="lg:col-span-2"
          title="Budget used by department"
          subtitle={u ? `Committed and spent against the ${u.fiscal_year.name} budget` : undefined}
          loading={usage.isLoading}
          chart={
            <div style={{ height: Math.max(220, departments.length * 34 + 40) }} role="img" aria-label="Share of each department's budget committed or spent; colour and label give the status; the table view lists the values.">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={departments} layout="vertical" margin={{ top: 4, right: 96, left: 8, bottom: 0 }} barCategoryGap="30%">
                  <CartesianGrid horizontal={false} stroke={chart.grid} strokeWidth={1} />
                  <XAxis type="number" domain={[0, (max: number) => Math.max(100, Math.ceil(max / 10) * 10)]} tick={AXIS} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" tick={{ ...AXIS, fill: chart.ink }} axisLine={false} tickLine={false} width={200} />
                  <Tooltip content={<Tip money={false} />} cursor={{ fill: color.subtle }} />
                  <Bar dataKey="pct" name="Used" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                    {departments.map((d) => <Cell key={d.name} fill={STATUS[d.status].fill} />)}
                    <LabelList dataKey="pct" position="right" content={({ x, y, width, height, value, index }: any) => <text x={x + width + 8} y={y + height / 2 + 4} fontSize={12} fill={chart.ink}>{`${value}% · ${STATUS[departments[index].status].word}`}</text>} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          }
          table={<SmallTable head={["Department", "Budget (RWF)", "Used (RWF)", "Used %"]} rows={departments.map((d) => [d.name, d.budget, d.used, `${d.pct}%`])} />}
        />
        <div className="space-y-4">
          <Card>
            <CardHeader title="Waiting for decisions" link={{ label: "Approvals", to: "/dashboard/approvals" }} />
            {approvals.isLoading ? <Skeleton className="h-24 w-full" /> : waiting.length ? (
              <ul className="divide-y divide-ims-divider">
                {waiting.slice(0, 6).map((w) => (
                  <li key={w.type} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-t-body text-ims-text">{DOCUMENT_TYPE_LABELS[w.type] || w.type}</span>
                    <span className="text-right"><strong className="tabular-nums">{w.count}</strong>{w.amount ? <span className="block text-t-small text-ims-muted">{fmtMoneyShort(w.amount)}</span> : null}</span>
                  </li>
                ))}
              </ul>
            ) : <p className="text-t-body text-ims-muted">Nothing is waiting.</p>}
            {waiting.length > 6 && <p className="mt-2 text-t-small text-ims-muted">{waiting.slice(6).reduce((t, w) => t + w.count, 0)} more across {waiting.length - 6} other kinds of document</p>}
          </Card>
          <Card>
            <CardHeader title="Budget lines to watch" link={{ label: "Budget", to: "/dashboard/budget" }} />
            {usage.isLoading ? <Skeleton className="h-24 w-full" /> : watch.length ? (
              <ul className="divide-y divide-ims-divider">
                {watch.map((l: any) => (
                  <li key={l.id} className="py-2">
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-mono text-[12.5px] text-ims-body">{l.code}</span>
                      <Pill tone={STATUS[l.status as keyof typeof STATUS].tone}>{`${l.used_pct}%`}</Pill>
                    </div>
                    <p className="truncate text-t-small text-ims-muted">{l.name} · {fmtMoneyShort(l.available)} left</p>
                  </li>
                ))}
              </ul>
            ) : <p className="text-t-body text-ims-muted">No line is above the warning level.</p>}
          </Card>
          <Link to="/dashboard/reports/donor" className="flex items-center justify-between rounded-card border border-ims-border bg-ims-card px-5 py-4 text-t-body font-semibold text-ims-link hover:bg-ims-hover">
            Donor report <ArrowRight size={16} aria-hidden />
          </Link>
        </div>
      </div>
    </Page>
  );
}
