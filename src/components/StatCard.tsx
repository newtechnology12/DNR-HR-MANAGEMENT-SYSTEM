import * as React from "react";
import { LucideIcon, TrendingUp, TrendingDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";

const toneStyles = {
  default: "bg-primary/10 text-primaryDark",
  info: "bg-blue-50 text-blue-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-700",
  danger: "bg-red-50 text-red-600",
  neutral: "bg-slate-100 text-slate-600",
} as const;

export interface StatCardProps {
  title: string;
  value?: React.ReactNode;
  description?: React.ReactNode;
  icon: LucideIcon;
  tone?: keyof typeof toneStyles;
  loading?: boolean;
  className?: string;
  /** Only pass a trend that is computed from real data. */
  trend?: { value: number; isUp: boolean; label?: string };
  onClick?: () => void;
}

export default function StatCard({
  title,
  value,
  description,
  icon: Icon,
  tone = "default",
  loading = false,
  className,
  trend,
  onClick,
}: StatCardProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn(
        "flex h-full w-full flex-col rounded-lg border border-slate-200 bg-white px-4 py-3.5 text-left shadow-card",
        onClick &&
          "transition-colors hover:border-slate-300 hover:bg-slate-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
        className
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <span className="truncate text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </span>
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-md",
            toneStyles[tone]
          )}
        >
          <Icon size={15} strokeWidth={2.25} />
        </span>
      </div>
      {loading ? (
        <Skeleton className="mt-2 h-7 w-20" />
      ) : (
        <div className="mt-1.5 flex items-baseline gap-2">
          <span className="text-[22px] font-semibold leading-tight tracking-tight tabular-nums text-slate-900">
            {value ?? 0}
          </span>
          {trend && (
            <span
              className={cn(
                "flex items-center gap-0.5 text-[11px] font-medium",
                trend.isUp ? "text-emerald-600" : "text-red-600"
              )}
            >
              {trend.isUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              {trend.value}%{trend.label ? ` ${trend.label}` : ""}
            </span>
          )}
        </div>
      )}
      {description && (
        <p className="mt-1 truncate text-[12px] text-slate-500">{description}</p>
      )}
    </Comp>
  );
}
