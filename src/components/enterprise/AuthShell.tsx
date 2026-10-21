/**
 * Frame for the signed-out pages (sign-in, forgot password) in the ralga.rw look: a navy brand
 * panel with the white wordmark and the flag stripe, and the form column on RALGA's light grey.
 */
import * as React from "react";
import { BadgeCheck, LucideIcon, PieChart, Scale, ScrollText } from "lucide-react";
import { BRAND } from "@/lib/brand";
import BrandMark from "@/components/enterprise/BrandMark";
import { FlagStripe } from "@/components/enterprise/RalgaLogo";
import { LANGUAGES, useT } from "@/i18n";
import { cn } from "@/utils";

const FEATURES: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: PieChart, title: "Budget control in real time", text: "Every requisition, order and voucher is checked against the available balance." },
  { icon: Scale, title: "Segregation of duties", text: "Nobody approves their own document, or the same document twice." },
  { icon: ScrollText, title: "Complete audit trail", text: "Who did what, when and from where — read-only for everyone." },
  { icon: BadgeCheck, title: "Reports that tie out", text: "From requisition to financial statements, exported to Excel and PDF." },
];

/** Layered ridge lines: the land of a thousand hills. */
function Hills() {
  const ridges = React.useMemo(
    () =>
      Array.from({ length: 13 }, (_, i) => {
        const base = 250 + i * 24;
        let d = "";
        for (let x = 0; x <= 600; x += 8) {
          const y = base - 30 * Math.sin(x / 95 + i * 0.62) - 12 * Math.sin(x / 41 + i * 1.7) - 6 * Math.sin(x / 17 + i);
          d += `${x ? "L" : "M"}${x} ${y.toFixed(1)}`;
        }
        return d;
      }),
    []
  );
  return (
    <svg viewBox="0 0 600 560" preserveAspectRatio="xMidYMax slice" className="absolute inset-x-0 bottom-0 h-[58%] w-full" aria-hidden>
      {ridges.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="#FFFFFF" strokeOpacity={0.04 + i * 0.007} strokeWidth="1.25" />
      ))}
    </svg>
  );
}

export default function AuthShell({ children }: { children: React.ReactNode }) {
  const { t, lang, setLang } = useT();
  return (
    <div className="min-h-dvh bg-ralga-mist lg:grid lg:grid-cols-[minmax(380px,40%)_1fr]">
      {/* ---------------------------------------------------------------- brand panel */}
      <aside className="relative hidden overflow-hidden bg-ralga-navy text-white lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col lg:self-start">
        <div className="absolute inset-0 bg-[linear-gradient(165deg,#003F82_0%,#00336B_48%,#001B3D_100%)]" />
        <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full bg-ralga-sky/20 blur-3xl" />
        <Hills />
        <FlagStripe className="absolute inset-x-0 top-0 z-10 h-1.5" />
        <div className="relative z-10 flex h-full flex-col px-10 pb-8 pt-11 xl:px-14">
          <BrandMark inverse size="lg" />
          <div className="my-auto max-w-lg py-12">
            <p className="text-[12px] font-semibold uppercase tracking-[0.16em] text-sky-300">{BRAND.orgName}</p>
            <h1 className="mt-4 text-[32px] font-extrabold leading-[1.12] tracking-[-0.025em] xl:text-[38px]">
              One system for budgets, procurement, payments, payroll and assets.
            </h1>
            <ul className="mt-10 space-y-5">
              {FEATURES.map((f) => (
                <li key={f.title} className="flex gap-3.5">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 ring-1 ring-white/15">
                    <f.icon size={17} className="text-sky-300" />
                  </span>
                  <span>
                    <span className="block text-[14.5px] font-semibold">{f.title}</span>
                    <span className="block text-[13px] leading-relaxed text-white/70">{f.text}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div className="flex items-center justify-between border-t border-white/10 pt-5 text-[12px] text-white/60">
            <span>© {new Date().getFullYear()} {BRAND.orgShort}</span>
            <span>Built by {BRAND.vendor}</span>
          </div>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- form column */}
      <main className="flex min-h-dvh flex-col">
        <FlagStripe className="lg:hidden" />
        <header className="flex items-center justify-between px-4 py-4 sm:px-8">
          <span className="lg:invisible"><BrandMark compact /></span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-0.5 shadow-sm" role="radiogroup" aria-label={t("common.language")}>
            {LANGUAGES.map((l) => (
              <button
                key={l.code}
                type="button"
                role="radio"
                aria-checked={lang === l.code}
                title={l.label}
                onClick={() => setLang(l.code)}
                className={cn("h-7 rounded-md px-2.5 text-[12px] font-semibold transition-colors", lang === l.code ? "bg-ralga-navy text-white" : "text-slate-500 hover:text-ralga-navy")}
              >
                {l.short}
              </button>
            ))}
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}

/** The white form card: navy top rule and a soft navy-tinted shadow. */
export function AuthCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <section
      className={cn(
        "mx-auto w-full max-w-[420px] rounded-xl border border-t-[3px] border-slate-200 border-t-ralga-navy bg-white p-6 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_14px_34px_-18px_rgba(0,63,130,0.35)] sm:p-8",
        className
      )}
    >
      {children}
    </section>
  );
}
