/**
 * Page frame: Page (padding 28px, 16px on phones; 16px between cards), Breadcrumb, PageHeader
 * (title = a noun, one-line subtitle, at most one primary and two secondary actions), Card and
 * CardHeader, and KpiBand (one card of 4–6 small numbers split by thin dividers).
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { Button, ButtonLink, ButtonVariant } from "./Button";

// ------------------------------------------------------------------ page
export function Page({ children, className, narrow }: { children: React.ReactNode; className?: string; narrow?: boolean }) {
  return (
    <div className={cn("mx-auto flex w-full flex-col gap-4 px-4 pb-10 pt-4 text-ims-text sm:px-[28px] sm:pt-6", narrow ? "max-w-[1100px]" : "max-w-[1480px]", className)}>
      {children}
    </div>
  );
}

// ------------------------------------------------------------------ breadcrumb
export type Crumb = { label: string; to?: string };

/** "Dashboard › Module › Page" — the last item is the current page, not a link. */
export function Breadcrumb({ items, className }: { items: Crumb[]; className?: string }) {
  const all = items[0]?.label === "Dashboard" ? items : [{ label: "Dashboard", to: "/dashboard" }, ...items];
  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex flex-wrap items-center gap-1 text-t-crumb text-ims-muted">
        {all.map((c, i) => {
          const last = i === all.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight size={13} className="shrink-0 text-ims-faint" aria-hidden />}
              {c.to && !last ? (
                <Link to={c.to} className="truncate hover:text-ims-link hover:underline">{c.label}</Link>
              ) : (
                <span className="truncate" aria-current={last ? "page" : undefined}>{c.label}</span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

// ------------------------------------------------------------------ page header
export type HeaderAction = {
  label: string;
  icon?: LucideIcon;
  onClick?: () => void;
  to?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: ButtonVariant;
};

function ActionButton({ a, variant }: { a: HeaderAction; variant: ButtonVariant }) {
  const v = a.variant || variant;
  if (a.to && !a.disabled) return <ButtonLink to={a.to} variant={v} icon={a.icon}>{a.label}</ButtonLink>;
  return <Button variant={v} icon={a.icon} onClick={a.onClick} disabled={a.disabled} loading={a.loading}>{a.label}</Button>;
}

export function PageHeader({
  breadcrumbs,
  title,
  subtitle,
  primary,
  secondary = [],
  actions,
  meta,
}: {
  breadcrumbs?: Crumb[];
  title: React.ReactNode;
  /** One short line on what the page is for (never about permissions). */
  subtitle?: React.ReactNode;
  /** At most one primary action… */
  primary?: HeaderAction;
  /** …and up to two secondary ones. */
  secondary?: HeaderAction[];
  /** Free-form actions for pages that need a custom control (e.g. a period switch). */
  actions?: React.ReactNode;
  /** Small line under the subtitle (e.g. "Updated 2 min ago"). */
  meta?: React.ReactNode;
}) {
  if (import.meta.env.DEV && secondary.length > 2) console.warn("ims/PageHeader: at most two secondary actions");
  const hasActions = Boolean(primary || secondary.length || actions);
  return (
    <header className="flex flex-col gap-2">
      {breadcrumbs && <Breadcrumb items={breadcrumbs} />}
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-t-title text-ims-text">{title}</h1>
          {subtitle && <p className="mt-1 max-w-3xl text-t-subtitle text-ims-muted">{subtitle}</p>}
          {meta && <p className="mt-1 text-t-small text-ims-muted">{meta}</p>}
        </div>
        {hasActions && (
          <div className="flex flex-wrap items-center gap-2 md:justify-end">
            {actions}
            {secondary.slice(0, 2).map((a) => <ActionButton key={a.label} a={a} variant="secondary" />)}
            {primary && <ActionButton a={primary} variant="primary" />}
          </div>
        )}
      </div>
    </header>
  );
}

// ------------------------------------------------------------------ card
export function Card({ children, className, padded = true, as: Tag = "section", ...rest }: { children: React.ReactNode; className?: string; padded?: boolean; as?: "section" | "div" | "article" } & React.HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={cn("min-w-0 rounded-card border border-ims-border bg-ims-card", padded && "px-[18px] py-[18px] sm:px-5 sm:py-5", className)} {...rest}>
      {children}
    </Tag>
  );
}

/** Card title 17px/800, optional muted subtitle, optional "View all →" link or a custom control on the right. */
export function CardHeader({
  title,
  subtitle,
  link,
  action,
  className,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  link?: { label?: string; to?: string; onClick?: () => void };
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-2", className)}>
      <div className="min-w-0">
        <h2 className="text-t-section text-ims-text">{title}</h2>
        {subtitle && <p className="mt-0.5 text-t-small text-ims-muted">{subtitle}</p>}
      </div>
      {action}
      {link &&
        (link.to ? (
          <Link to={link.to} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-ims-link hover:underline">
            {link.label || "View all"} <ArrowRight size={14} aria-hidden />
          </Link>
        ) : (
          <button type="button" onClick={link.onClick} className="inline-flex shrink-0 items-center gap-1 text-[13px] font-bold text-ims-link hover:underline">
            {link.label || "View all"} <ArrowRight size={14} aria-hidden />
          </button>
        ))}
    </div>
  );
}

// ------------------------------------------------------------------ KPI band
export type Kpi = {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "default" | "success" | "warning" | "danger";
  onClick?: () => void;
  to?: string;
};

const KPI_TONE = { default: "text-ims-text", success: "text-ims-success", warning: "text-ims-warning", danger: "text-ims-danger" };

/** One white card split by thin dividers; 4–6 small numbers. A number shown here is not repeated elsewhere on the page. */
export function KpiBand({ items, loading, className }: { items: Kpi[]; loading?: boolean; className?: string }) {
  const n = Math.min(Math.max(items.length, 1), 6);
  const cols = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4", 5: "lg:grid-cols-5", 6: "lg:grid-cols-6" }[n];
  return (
    <section aria-label="Key figures" className={cn("overflow-hidden rounded-card border border-ims-border bg-ims-card", className)}>
      {/* each cell draws its left and top divider; the -1px offset hides those on the outer edge */}
      <div className={cn("-ml-px -mt-px grid grid-cols-2 sm:grid-cols-3", cols)}>
        {items.map((k) => {
          const body = (
            <>
              <span className="block truncate text-t-small text-ims-muted">{k.label}</span>
              {loading ? <Skeleton className="mt-1.5 h-6 w-20" /> : <span className={cn("mt-1 block break-words text-t-kpi tabular-nums", KPI_TONE[k.tone || "default"])}>{k.value ?? "—"}</span>}
              {k.sub && !loading && <span className="mt-0.5 block truncate text-t-small text-ims-muted">{k.sub}</span>}
            </>
          );
          const cls = "block min-w-0 border-l border-t border-ims-divider bg-ims-card px-5 py-4 text-left";
          if (k.to) return <Link key={k.label} to={k.to} className={cn(cls, "transition-colors hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus")}>{body}</Link>;
          if (k.onClick) return <button key={k.label} type="button" onClick={k.onClick} className={cn(cls, "transition-colors hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ims-focus")}>{body}</button>;
          return <div key={k.label} className={cls}>{body}</div>;
        })}
      </div>
    </section>
  );
}
