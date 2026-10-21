/**
 * Product mark: the RALGA wordmark beside the product name. A deployment can swap in another
 * logo file with VITE_LOGO_URL (e.g. /logo.svg).
 */
import { cn } from "@/utils";
import { BRAND } from "@/lib/brand";
import { RalgaWordmark } from "./RalgaLogo";

const LOGO_URL = import.meta.env.VITE_LOGO_URL as string | undefined;

export function BrandLogo({ className, inverse = false }: { className?: string; inverse?: boolean }) {
  if (LOGO_URL) return <img src={LOGO_URL} alt={BRAND.orgShort} className={cn("h-8 w-auto object-contain", className)} />;
  return <RalgaWordmark tone={inverse ? "white" : "brand"} title={BRAND.orgShort} className={className} />;
}

const SIZES = {
  sm: { gap: "gap-2", logo: "h-[26px]", rule: "my-0.5", title: "text-[13px]", sub: "" },
  md: { gap: "gap-3", logo: "h-[34px]", rule: "my-1", title: "text-[14px]", sub: "text-[11px]" },
  nav: { gap: "gap-3", logo: "h-[34px]", rule: "my-1.5", title: "text-[17px]", sub: "" },
  lg: { gap: "gap-4", logo: "h-12", rule: "my-1", title: "text-[18px]", sub: "text-[12.5px]" },
};

export default function BrandMark({
  className, compact = false, inverse = false, size = compact ? "sm" : "md",
}: { className?: string; compact?: boolean; inverse?: boolean; size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <span className={cn("inline-flex min-w-0 items-center", s.gap, className)}>
      <BrandLogo inverse={inverse} className={s.logo} />
      <span className={cn("w-px self-stretch", s.rule, inverse ? "bg-white/25" : "bg-slate-200")} aria-hidden />
      <span className="flex min-w-0 flex-col leading-tight">
        <span className={cn("truncate font-bold tracking-tight", s.title, inverse ? "text-white" : "text-ralga-navy")}>
          {BRAND.product.replace(`${BRAND.orgShort} `, "") || BRAND.product}
        </span>
        {s.sub && <span className={cn("truncate font-medium", s.sub, inverse ? "text-white/70" : "text-slate-500")}>{BRAND.productLong}</span>}
      </span>
    </span>
  );
}
