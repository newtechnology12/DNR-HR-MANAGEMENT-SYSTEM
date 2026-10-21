/**
 * Frame for the signed-out pages (sign-in, forgot password): a navy brand panel (flag stripe, RALGA logo,
 * what the system does, how every payment is controlled) beside a white form side with the language
 * switch. On phones the brand panel becomes a short band above the form.
 */
import * as React from "react";
import { Check, ClipboardList, LineChart, PieChart, Scale, Shield } from "lucide-react";
import { BRAND } from "@/lib/brand";
import { BrandLogo } from "@/components/enterprise/BrandMark";
import { LANGUAGES, useT } from "@/i18n";
import { cn } from "@/utils";

const NAVY = "#0A2647";

const FLOW: [string, string, string, string][] = [
  ["auth.step1", "Request", "auth.step1Sub", "Staff"],
  ["auth.step2", "Department", "auth.step2Sub", "Head approves"],
  ["auth.step3", "Budget check", "auth.step3Sub", "Automatic"],
  ["auth.step4", "Finance", "auth.step4Sub", "DAF approves"],
  ["auth.step5", "Payment", "auth.step5Sub", "Treasury"],
];

const FEATURES = [
  { icon: PieChart, title: ["auth.f1", "Real-time budget control"], text: ["auth.f1Text", "Checked on every requisition, order and voucher."] },
  { icon: Scale, title: ["auth.f2", "Segregation of duties"], text: ["auth.f2Text", "Nobody approves their own document."] },
  { icon: ClipboardList, title: ["auth.f3", "Complete audit trail"], text: ["auth.f3Text", "Who, what, when and from where."] },
  { icon: LineChart, title: ["auth.f4", "Reports that tie out"], text: ["auth.f4Text", "Requisition to statements, Excel & PDF."] },
];

export function LanguageSwitch() {
  const { t, lang, setLang } = useT();
  return (
    <div className="inline-flex rounded-lg border border-slate-200 p-0.5" role="radiogroup" aria-label={t("common.language", "Language")}>
      {LANGUAGES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={lang === l.code}
          title={l.label}
          onClick={() => setLang(l.code)}
          className={cn("rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors", lang === l.code ? "bg-slate-900 text-white" : "text-slate-500 hover:text-slate-900")}
        >
          {l.short}
        </button>
      ))}
    </div>
  );
}

export default function AuthShell({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const { t } = useT();
  return (
    <div className="min-h-dvh bg-white min-[900px]:grid min-[900px]:grid-cols-[1.05fr_1fr]">
      {/* ---------------------------------------------------------------- brand panel */}
      <aside className="relative flex flex-col overflow-hidden px-5 pb-6 pt-[26px] text-white min-[900px]:px-10 min-[900px]:py-8 min-[1180px]:px-14 min-[1180px]:py-9" style={{ backgroundColor: NAVY }}>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            backgroundImage: "radial-gradient(rgba(255,255,255,.07) 1px, transparent 1px)",
            backgroundSize: "22px 22px",
            maskImage: "linear-gradient(180deg,#000 0%,transparent 75%)",
            WebkitMaskImage: "linear-gradient(180deg,#000 0%,transparent 75%)",
          }}
        />
        <div aria-hidden className="pointer-events-none absolute -bottom-[320px] -right-[280px] h-[720px] w-[720px] rounded-full" style={{ background: "radial-gradient(circle, rgba(59,130,246,.22), transparent 65%)" }} />
        <div aria-hidden className="absolute inset-x-0 top-0 flex h-[3px]">
          <i className="flex-[2] bg-[#20A0DB]" />
          <i className="flex-1 bg-[#F4C300]" />
          <i className="flex-1 bg-[#1EB53A]" />
        </div>

        <div className="relative z-10 flex items-center gap-3.5">
          <BrandLogo inverse className="h-9" />
          <span className="h-[30px] w-px bg-white/25" aria-hidden />
          <span className="leading-tight">
            <b className="block text-[14px] font-semibold">{BRAND.product.replace(`${BRAND.orgShort} `, "") || BRAND.product}</b>
            <span className="block text-[12px] text-[#A9BCD6]">{BRAND.productLong}</span>
          </span>
        </div>

        <div className="relative z-10 max-w-[520px] pt-[22px] min-[900px]:my-auto min-[900px]:py-10">
          <span className="hidden items-center gap-2 rounded-full border border-[rgba(157,192,238,.25)] px-3 py-[5px] text-[11px] font-semibold uppercase tracking-[0.1em] text-[#9DC0EE] min-[900px]:inline-flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#1EB53A]" aria-hidden /> {BRAND.orgName}
          </span>
          <h1 className="text-[24px] font-bold leading-[1.12] tracking-[-0.025em] min-[900px]:mb-3.5 min-[900px]:mt-5 min-[900px]:text-[32px] min-[1180px]:text-[38px]">
            {t("auth.headline", "One system for budgets, procurement, payments,")} <em className="not-italic text-[#8DB8F2]">{t("auth.headlineEm", "payroll and assets.")}</em>
          </h1>
          <p className="hidden max-w-[440px] text-[15px] leading-relaxed text-[#B4C5DD] min-[900px]:block">{t("auth.lead", "Every franc budgeted, committed, approved, paid and reported in one auditable chain.")}</p>

          <div aria-hidden className="mt-8 hidden rounded-[14px] border border-white/[0.12] bg-white/[0.04] px-[18px] pb-4 pt-[18px] backdrop-blur-[6px] min-[900px]:block">
            <div className="mb-3.5 flex items-center justify-between">
              <b className="text-[12.5px] font-semibold">{t("auth.flowTitle", "How every payment is controlled")}</b>
              <span className="text-[11px] text-[#A9BCD6]">{t("auth.flowTag", "Approval chain")}</span>
            </div>
            <ol className="relative grid grid-cols-5">
              <span className="absolute left-[10%] right-[10%] top-[15px] h-px bg-white/[0.18]" />
              {FLOW.map(([k, label, sk, sub], i) => {
                const hi = i === 2;
                return (
                  <li key={k} className="relative flex flex-col items-center gap-0.5 text-center">
                    <span className={cn("mb-2 grid h-[30px] w-[30px] place-items-center rounded-full border text-[12px] font-semibold", hi ? "border-[#4ADE80] bg-[#4ADE80]" : "border-white/[0.28] text-[#CFE0F5]")} style={hi ? undefined : { backgroundColor: NAVY }}>
                      {hi ? <Check size={14} strokeWidth={2.6} style={{ color: NAVY }} /> : i + 1}
                    </span>
                    <b className="text-[12px] font-semibold">{t(k, label)}</b>
                    <small className="text-[10.5px] text-[#A9BCD6]">{t(sk, sub)}</small>
                  </li>
                );
              })}
            </ol>
            <p className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-[11.5px] text-[#B4C5DD]">
              <Shield size={14} className="text-[#8DB8F2]" /> {t("auth.flowNote", "Every step is recorded in the audit trail.")}
            </p>
          </div>

          <div className="mt-[26px] hidden grid-cols-1 gap-x-[22px] gap-y-2.5 min-[900px]:grid min-[1180px]:grid-cols-2">
            {FEATURES.map((f) => (
              <div key={f.title[0]} className="flex items-start gap-2.5 text-[12.5px] leading-relaxed text-[#B4C5DD]">
                <f.icon size={16} className="mt-0.5 shrink-0 text-[#8DB8F2]" aria-hidden />
                <div><b className="block text-[13px] font-semibold text-white">{t(f.title[0], f.title[1])}</b>{t(f.text[0], f.text[1])}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="relative z-10 hidden justify-between text-[11.5px] text-[#7F97B6] min-[900px]:flex">
          <span>© {new Date().getFullYear()} {BRAND.orgShort}</span>
          <span>{t("auth.developedBy", "Developed by")} {BRAND.vendor}</span>
        </div>
      </aside>

      {/* ---------------------------------------------------------------- form side */}
      <main className="relative flex min-h-[calc(100dvh-170px)] flex-col bg-white px-5 pb-7 pt-4 min-[900px]:min-h-dvh min-[900px]:px-10 min-[900px]:py-7">
        <div className="flex justify-end"><LanguageSwitch /></div>
        <div className="mx-auto mt-2 w-full max-w-[400px] py-6 min-[900px]:my-auto min-[900px]:mt-auto">{children}</div>
        {footer}
      </main>
    </div>
  );
}

/** Kept for pages that wrap their form in a card; on the white form side it is a plain column. */
export function AuthCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return <section className={cn("w-full", className)}>{children}</section>;
}
