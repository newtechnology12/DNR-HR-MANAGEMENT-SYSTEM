/**
 * Product mark: a neutral monogram emblem + wordmark built from BRAND (not the client's official logo,
 * which can be dropped in later as /public/logo.svg via VITE_LOGO_URL).
 */
import { useId } from "react";
import { cn } from "@/utils";
import { BRAND } from "@/lib/brand";

const LOGO_URL = import.meta.env.VITE_LOGO_URL as string | undefined;

export function BrandEmblem({ className, size = 36 }: { className?: string; size?: number }) {
  // Unique per instance: a shared id would point at a hidden copy (e.g. the desktop-only panel).
  const gradient = `ims-emblem-${useId().replace(/:/g, "")}`;
  if (LOGO_URL) return <img src={LOGO_URL} alt={BRAND.orgShort} style={{ height: size, width: size }} className={cn("object-contain", className)} />;
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" className={className} role="img" aria-label={BRAND.orgShort}>
      <defs>
        <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#15803D" />
          <stop offset="1" stopColor="#0F3D2E" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="38" height="38" rx="10" fill={`url(#${gradient})`} />
      {/* Five pillars: the provinces and City of Kigali that the association represents. */}
      <g fill="#ffffff">
        <rect x="9" y="22" width="3.4" height="9" rx="1" opacity="0.75" />
        <rect x="14.2" y="17" width="3.4" height="14" rx="1" opacity="0.85" />
        <rect x="19.4" y="12" width="3.4" height="19" rx="1" />
        <rect x="24.6" y="17" width="3.4" height="14" rx="1" opacity="0.85" />
        <rect x="29.8" y="22" width="3.4" height="9" rx="1" opacity="0.75" />
      </g>
      <circle cx="21.1" cy="8.2" r="2" fill="#FACC15" />
    </svg>
  );
}

export default function BrandMark({ className, compact = false, inverse = false }: { className?: string; compact?: boolean; inverse?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <BrandEmblem size={compact ? 30 : 36} />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("truncate text-[15px] font-bold tracking-tight", inverse ? "text-white" : "text-slate-900")}>{BRAND.product}</span>
        {!compact && <span className={cn("truncate text-[11px] font-medium", inverse ? "text-white/70" : "text-slate-500")}>{BRAND.productLong}</span>}
      </span>
    </span>
  );
}
