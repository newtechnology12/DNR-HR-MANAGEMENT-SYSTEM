/**
 * One KPI: label (12.5px muted), value (22px/800), one short line. Pages that show several should use
 * KpiBand from "@/components/ims" (one card split by dividers); this card keeps the same look for the
 * pages that still lay out separate cards. No icons in circles (the icon prop is kept for compatibility).
 */
import * as React from "react";
import { LucideIcon, TrendingDown, TrendingUp } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";

const VALUE_TONE = {
  default: "text-ims-text",
  info: "text-ims-text",
  success: "text-ims-text",
  warning: "text-ims-warning",
  danger: "text-ims-danger",
  neutral: "text-ims-text",
} as const;

export interface StatCardProps {
  title: string;
  value?: React.ReactNode;
  description?: React.ReactNode;
  icon?: LucideIcon;
  tone?: keyof typeof VALUE_TONE;
  loading?: boolean;
  className?: string;
  /** Only pass a trend that is computed from real data. */
  trend?: { value: number; isUp: boolean; label?: string };
  onClick?: () => void;
}

export default function StatCard({ title, value, description, tone = "default", loading = false, className, trend, onClick }: StatCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex h-full w-full flex-col rounded-card border border-ims-border bg-ims-card px-5 py-4 text-left",
        onClick && "transition-colors hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
        className
      )}
    >
      <span className="truncate text-t-small text-ims-muted">{title}</span>
      {loading ? (
        <Skeleton className="mt-1.5 h-7 w-20" />
      ) : (
        <span className="mt-1 flex flex-wrap items-baseline gap-2">
          <span className={cn("break-words text-t-kpi tabular-nums", VALUE_TONE[tone])}>{value ?? 0}</span>
          {trend && (
            <span className={cn("flex items-center gap-0.5 text-t-small font-semibold", trend.isUp ? "text-ims-success" : "text-ims-danger")}>
              {trend.isUp ? <TrendingUp size={13} aria-hidden /> : <TrendingDown size={13} aria-hidden />}
              {trend.value}%{trend.label ? ` ${trend.label}` : ""}
            </span>
          )}
        </span>
      )}
      {description && <span className="mt-0.5 truncate text-t-small text-ims-muted">{description}</span>}
    </Comp>
  );
}
