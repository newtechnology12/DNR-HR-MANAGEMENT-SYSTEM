/**
 * Shared enterprise building blocks: page header, panels, badges, empty/loading states and
 * simple charts. Use these instead of hand-rolled markup so every module looks the same.
 */
import * as React from "react";
import { ArrowRight, LucideIcon } from "lucide-react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import BreadCrumb from "@/components/breadcrumb";
import { cn } from "@/utils";
import type { Tone } from "@/lib/procurement";

// Chart colours: reference data-viz palette slots 1–2 (validated for colour-blind separation).
export const CHART = { series1: "#2a78d6", series2: "#eb6834", grid: "#e5e7eb", axis: "#64748b", ink: "#334155" };

const TONES: Record<Tone, string> = {
  neutral: "bg-slate-100 text-slate-700 ring-slate-200",
  info: "bg-blue-50 text-blue-700 ring-blue-200",
  warning: "bg-amber-50 text-amber-800 ring-amber-200",
  success: "bg-emerald-50 text-emerald-700 ring-emerald-200",
  danger: "bg-red-50 text-red-700 ring-red-200",
  violet: "bg-violet-50 text-violet-700 ring-violet-200",
};

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-medium ring-1 ring-inset",
        TONES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

/** Badge driven by a status map, e.g. DOC_STATUS. Unknown values fall back to a neutral label. */
export function StatusBadge({ status, map }: { status?: string; map?: Record<string, { label: string; tone: Tone }> }) {
  const s = (status || "").toLowerCase();
  const meta = map?.[s];
  const fallback: Tone = s === "approved" || s === "paid" ? "success" : s === "rejected" ? "danger" : s === "pending" ? "warning" : "neutral";
  return <Badge tone={meta?.tone || fallback}>{meta?.label || (status ? status.replace(/_/g, " ") : "—")}</Badge>;
}

export function PageHeader({
  title,
  description,
  breadcrumbs = [],
  actions,
}: {
  title: React.ReactNode;
  description?: React.ReactNode;
  breadcrumbs?: { title: string; link: string }[];
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-1">
        {breadcrumbs.length > 0 && <BreadCrumb items={breadcrumbs} />}
        <h2 className="text-xl font-semibold tracking-tight text-slate-900">{title}</h2>
        {description && <p className="text-[13px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  title,
  subtitle,
  action,
  className,
  bodyClassName,
  children,
}: {
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: { label: string; onClick: () => void } | React.ReactNode;
  className?: string;
  bodyClassName?: string;
  children: React.ReactNode;
}) {
  const isLink = action && typeof action === "object" && "label" in (action as any);
  return (
    <section className={cn("flex flex-col rounded-lg border border-slate-200 bg-white shadow-card", className)}>
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-4 pb-2 pt-3.5">
          <div className="min-w-0">
            {title && <h3 className="text-[14px] font-semibold text-slate-900">{title}</h3>}
            {subtitle && <p className="text-[12px] text-slate-500">{subtitle}</p>}
          </div>
          {isLink ? (
            <button
              type="button"
              onClick={(action as any).onClick}
              className="flex shrink-0 items-center gap-1 text-[12px] font-medium text-primaryDark hover:underline"
            >
              {(action as any).label}
              <ArrowRight size={13} />
            </button>
          ) : (
            (action as React.ReactNode)
          )}
        </header>
      )}
      <div className={cn("flex-1 px-4 pb-4", !title && !action && "pt-4", bodyClassName)}>{children}</div>
    </section>
  );
}

export function EmptyState({
  icon: Icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title?: string;
  text: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[160px] flex-col items-center justify-center gap-2 px-4 py-6 text-center">
      <span className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-400">
        <Icon size={18} />
      </span>
      {title && <p className="text-[14px] font-semibold text-slate-800">{title}</p>}
      <p className="max-w-sm text-[13px] text-slate-500">{text}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 pt-1">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

export function Initials({ name, className }: { name?: string; className?: string }) {
  const initials = (name || "")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join("");
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600",
        className
      )}
    >
      {initials || "?"}
    </span>
  );
}

/** Label/value pairs for detail pages. */
export function KeyValues({ items, columns = 2 }: { items: { label: string; value: React.ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return (
    <dl className={cn("grid gap-x-6 gap-y-3", columns === 3 ? "sm:grid-cols-3" : columns === 2 ? "sm:grid-cols-2" : "")}>
      {items.map((i) => (
        <div key={i.label} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{i.label}</dt>
          <dd className="mt-0.5 break-words text-[13px] text-slate-800">{i.value || <span className="text-slate-400">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function ChartTooltip({ active, payload, label, format }: any) {
  if (!active || !payload?.length) return null;
  const fmt = format || ((v: number) => v);
  const total = payload.length > 1 ? payload.reduce((acc: number, p: any) => acc + (p.value || 0), 0) : null;
  return (
    <div className="rounded-md border border-slate-200 bg-white px-3 py-2 text-[12px] shadow-card-hover">
      <p className="mb-1 font-semibold text-slate-800">{label || payload[0]?.payload?.name}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-600">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}
          <span className="ml-auto pl-4 font-semibold tabular-nums text-slate-900">{fmt(p.value)}</span>
        </p>
      ))}
      {total !== null && (
        <p className="mt-1 flex justify-between border-t border-slate-100 pt-1 text-slate-600">
          Total <span className="font-semibold tabular-nums text-slate-900">{fmt(total)}</span>
        </p>
      )}
    </div>
  );
}

/** Single-series horizontal bar chart with direct value labels (one hue, per the data-viz rules). */
export function HorizontalBars({
  data,
  label,
  format,
  labelWidth = 130,
}: {
  data: { name: string; value: number }[];
  label: string;
  format?: (v: number) => string;
  labelWidth?: number;
}) {
  const height = Math.max(data.length * 30 + 10, 120);
  const fmt = format || ((v: number) => String(v));
  return (
    <div style={{ height }} role="img" aria-label={`${label} bar chart`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 56, left: 0, bottom: 0 }} barCategoryGap={6}>
          <XAxis type="number" hide allowDecimals={false} />
          <YAxis type="category" dataKey="name" width={labelWidth} tickLine={false} axisLine={false} tick={{ fontSize: 12, fill: CHART.ink }} interval={0} />
          <Tooltip content={<ChartTooltip format={fmt} />} cursor={{ fill: "#f1f5f9" }} />
          <Bar isAnimationActive={false} dataKey="value" name={label} fill={CHART.series1} radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList dataKey="value" position="right" formatter={fmt} style={{ fontSize: 12, fill: CHART.ink, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export interface Metric {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "warning" | "danger" | "success";
  onClick?: () => void;
}

const METRIC_TONE = {
  default: "text-slate-900",
  warning: "text-amber-700",
  danger: "text-red-600",
  success: "text-emerald-700",
};

/** Compact KPI panel: a titled group of small metrics separated by thin dividers. */
export function MetricGroup({
  title,
  icon: Icon,
  metrics,
  loading,
  columns = 3,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  metrics: Metric[];
  loading?: boolean;
  columns?: 2 | 3 | 4;
  className?: string;
}) {
  const cols = { 2: "grid-cols-2", 3: "grid-cols-2 sm:grid-cols-3", 4: "grid-cols-2 sm:grid-cols-4" }[columns];
  return (
    <section className={cn("overflow-hidden rounded-lg border border-slate-200 bg-white shadow-card", className)}>
      <header className="flex items-center gap-2 border-b border-slate-100 px-3.5 py-2">
        {Icon && <Icon size={14} className="text-slate-400" />}
        <h3 className="text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">{title}</h3>
      </header>
      <div className={cn("grid gap-px bg-slate-100", cols)}>
        {metrics.map((m) => {
          const Comp = m.onClick ? "button" : "div";
          return (
            <Comp
              key={m.label}
              type={m.onClick ? "button" : undefined}
              onClick={m.onClick}
              className={cn(
                "min-w-0 bg-white px-3.5 py-2.5 text-left",
                m.onClick && "transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/40"
              )}
            >
              <p className="truncate text-[11.5px] text-slate-500">{m.label}</p>
              {loading ? (
                <Skeleton className="mt-1 h-5 w-14" />
              ) : (
                <p className={cn("mt-0.5 truncate text-[17px] font-semibold leading-tight tabular-nums", METRIC_TONE[m.tone || "default"])}>{m.value ?? "—"}</p>
              )}
              {m.sub && !loading && <p className="mt-0.5 truncate text-[11px] text-slate-400">{m.sub}</p>}
            </Comp>
          );
        })}
      </div>
    </section>
  );
}
