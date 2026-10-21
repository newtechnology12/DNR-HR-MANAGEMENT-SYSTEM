/**
 * Shared enterprise building blocks, now thin wrappers over the ims kit (src/components/ims) so every
 * page that uses them follows the design tokens: page header, panels, badges, empty/loading states,
 * key/value lists, KPI groups and simple charts. New pages import from "@/components/ims" directly.
 */
import * as React from "react";
import { LucideIcon } from "lucide-react";
import { Bar, BarChart, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Skeleton } from "@/components/ui/skeleton";
import { chart } from "@/design/tokens";
import {
  Card, CardHeader, Details, EmptyState as ImsEmptyState, Pill, PageHeader as ImsPageHeader, PillTone, StatusPill, statusWord,
} from "@/components/ims";
import { cn } from "@/utils";
import type { Tone } from "@/lib/procurement";

// Chart colours come from the design tokens (series 1 blue, series 2 orange: colour-blind safe pair).
export const CHART = { series1: chart.series1, series2: chart.series2, grid: chart.grid, axis: chart.axis, ink: chart.ink };

const TONE: Record<Tone, PillTone> = { neutral: "neutral", info: "info", warning: "warning", success: "success", danger: "danger", violet: "orange" };

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <Pill tone={TONE[tone] || "neutral"} className={className}>{children}</Pill>;
}

/**
 * Status in the system glossary (Draft, Pending approval, Approved, In progress, Converted to PO,
 * Completed, Closed, Returned, Rejected, Cancelled, Active, Inactive). The module's map gives the
 * glossary word (label) and the detail (note, shown under the pill); without a map the stored
 * value is looked up in the glossary. Values that are types rather than statuses keep their label.
 */
export function StatusBadge({ status, map, hideNote }: { status?: string; map?: Record<string, { label: string; tone: Tone; note?: string }>; hideNote?: boolean }) {
  const s = (status || "").toLowerCase();
  const meta = map?.[s];
  const word = statusWord(meta?.label) || (!meta ? statusWord(s) : null);
  if (word) return <StatusPill status={word} sub={hideNote ? undefined : meta?.note} />;
  return <Badge tone={meta?.tone || "neutral"}>{meta?.label || (status ? status.replace(/_/g, " ") : "—")}</Badge>;
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
    <ImsPageHeader
      breadcrumbs={breadcrumbs.length ? breadcrumbs.map((b) => ({ label: b.title, to: b.link })) : undefined}
      title={title}
      subtitle={description}
      actions={actions}
    />
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
  const isLink = action && typeof action === "object" && "label" in (action as object) && "onClick" in (action as object);
  return (
    <Card className={cn("flex flex-col", className)}>
      {(title || action) && (
        <CardHeader
          title={title || ""}
          subtitle={subtitle}
          link={isLink ? { label: (action as { label: string }).label, onClick: (action as { onClick: () => void }).onClick } : undefined}
          action={!isLink ? (action as React.ReactNode) : undefined}
        />
      )}
      <div className={cn("min-w-0 flex-1", bodyClassName)}>{children}</div>
    </Card>
  );
}

export function EmptyState({
  icon,
  title,
  text,
  action,
}: {
  icon: LucideIcon;
  title?: string;
  text: string;
  action?: React.ReactNode;
}) {
  // One line on what is missing: the explanation when there is one, otherwise the title.
  return <ImsEmptyState icon={icon} text={text || title} action={action} compact />;
}

export function ListSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-3 pt-1" aria-busy="true" aria-label="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} className="h-9 w-full rounded-control" />
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
    <span className={cn("flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ims-subtle text-[11px] font-bold text-ims-body", className)} aria-hidden>
      {initials || "?"}
    </span>
  );
}

/** Label/value pairs for detail pages. */
export function KeyValues({ items, columns = 2 }: { items: { label: string; value: React.ReactNode }[]; columns?: 1 | 2 | 3 }) {
  return <Details items={items} columns={columns} />;
}

export function ChartTooltip({ active, payload, label, format }: any) {
  if (!active || !payload?.length) return null;
  const fmt = format || ((v: number) => v);
  const total = payload.length > 1 ? payload.reduce((acc: number, p: any) => acc + (p.value || 0), 0) : null;
  return (
    <div className="rounded-control border border-ims-border bg-ims-card px-3 py-2 text-t-small shadow-menu">
      <p className="mb-1 font-bold text-ims-text">{label || payload[0]?.payload?.name}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-ims-body">
          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.color }} />
          {p.name}
          <span className="ml-auto pl-4 font-bold tabular-nums text-ims-text">{fmt(p.value)}</span>
        </p>
      ))}
      {total !== null && (
        <p className="mt-1 flex justify-between border-t border-ims-divider pt-1 text-ims-body">
          Total <span className="font-bold tabular-nums text-ims-text">{fmt(total)}</span>
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
          <YAxis type="category" dataKey="name" width={labelWidth} tickLine={false} axisLine={false} tick={{ fontSize: 12.5, fill: CHART.ink }} interval={0} />
          <Tooltip content={<ChartTooltip format={fmt} />} cursor={{ fill: CHART.grid }} />
          <Bar isAnimationActive={false} dataKey="value" name={label} fill={CHART.series1} radius={[0, 4, 4, 0]} maxBarSize={18}>
            <LabelList dataKey="value" position="right" formatter={fmt} style={{ fontSize: 12.5, fill: CHART.ink, fontWeight: 700 }} />
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
  default: "text-ims-text",
  warning: "text-ims-warning",
  danger: "text-ims-danger",
  success: "text-ims-success",
};

/** A titled group of small metrics in the KPI-band style (thin dividers, no icons in circles). */
export function MetricGroup({
  title,
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
    <section className={cn("overflow-hidden rounded-card border border-ims-border bg-ims-card", className)}>
      <header className="border-b border-ims-divider px-4 py-2.5">
        <h3 className="text-t-label text-ims-text">{title}</h3>
      </header>
      <div className={cn("-ml-px -mt-px grid", cols)}>
        {metrics.map((m) => {
          const Comp = m.onClick ? "button" : "div";
          return (
            <Comp
              key={m.label}
              type={m.onClick ? "button" : undefined}
              onClick={m.onClick}
              className={cn(
                "min-w-0 border-l border-t border-ims-divider bg-ims-card px-4 py-3 text-left",
                m.onClick && "transition-colors hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus"
              )}
            >
              <p className="truncate text-t-small text-ims-muted">{m.label}</p>
              {loading ? (
                <Skeleton className="mt-1 h-6 w-14" />
              ) : (
                <p className={cn("mt-0.5 break-words text-[19px] font-extrabold leading-tight tabular-nums", METRIC_TONE[m.tone || "default"])}>{m.value ?? "—"}</p>
              )}
              {m.sub && !loading && <p className="mt-0.5 truncate text-t-small text-ims-muted">{m.sub}</p>}
            </Comp>
          );
        })}
      </div>
    </section>
  );
}
