/**
 * Sign-in: e-mail + password, then the authenticator code when 2FA is on. Lockout and inactive
 * accounts get a clear message. In development / demo builds (VITE_DEMO_LOGINS=true) testers can
 * sign in as any of the 13 RALGA roles with one click.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import qs from "qs";
import { toast } from "sonner";
import {
  AlertCircle, ArrowLeft, ArrowRight, Briefcase, Building2, Calculator, Eye, EyeOff, KeyRound, Landmark, Loader2, Lock,
  LucideIcon, Package, PieChart, Presentation, SearchCheck, ServerCog, ShieldCheck, ShoppingCart, User, Users, Wallet,
} from "lucide-react";
import authService, { SignInError } from "@/services/auth.service";
import { DEMO_LOGINS_ENABLED } from "@/lib/brand";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ROLE_DEFS, ROLE_GROUPS, RoleDef } from "@/lib/ims";
import AuthShell, { AuthCard } from "@/components/enterprise/AuthShell";
import { useT } from "@/i18n";
import { cn } from "@/utils";

const ICONS: Record<string, LucideIcon> = {
  landmark: Landmark, briefcase: Briefcase, "search-check": SearchCheck, presentation: Presentation, calculator: Calculator,
  "pie-chart": PieChart, wallet: Wallet, "shopping-cart": ShoppingCart, package: Package, users: Users, "server-cog": ServerCog,
  building: Building2, user: User,
};
// Role groups take the RALGA palette: navy, sky blue, and the flag's green and yellow.
const GROUP_TONE: Record<string, { tile: string; ring: string; dot: string }> = {
  leadership: { tile: "bg-ralga-navy/10 text-ralga-navy", ring: "hover:border-ralga-navy/40", dot: "bg-ralga-navy" },
  finance: { tile: "bg-ralga-sky/10 text-ralga-sky-dark", ring: "hover:border-ralga-sky/50", dot: "bg-ralga-sky" },
  operations: { tile: "bg-ralga-green/10 text-ralga-green", ring: "hover:border-ralga-green/40", dot: "bg-ralga-green" },
  people: { tile: "bg-ralga-yellow/15 text-ralga-yellow-dark", ring: "hover:border-ralga-yellow/60", dot: "bg-ralga-yellow" },
};

type Step = "credentials" | "otp";

const INPUT =
  "block h-11 w-full rounded-lg border border-slate-200 bg-white text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-ralga-navy focus:outline-none focus:ring-2 focus:ring-ralga-sky/25 aria-[invalid=true]:border-red-400";

export function Login() {
  const { t } = useT();
  const navigate = useNavigate();
  const redirect = (qs.parse(location.search, { ignoreQueryPrefix: true })?.redirect as string) || "/dashboard";

  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<{ message: string; code: string } | null>(null);
  const [touched, setTouched] = React.useState(false);
  const otpRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (step === "otp") setTimeout(() => otpRef.current?.focus(), 50);
  }, [step]);

  const emailError = touched && !/^\S+@\S+\.\S+$/.test(email) ? "Enter your work e-mail address." : "";
  const passwordError = touched && !password ? "Enter your password." : "";

  async function signIn(e: string, p: string, code?: string, label?: string) {
    setError(null);
    setBusy(label || "form");
    try {
      await authService.signIn({ email: e, password: p, otp: code });
      if (label) toast.success(`Signed in as ${label}`);
      setTimeout(() => navigate(redirect), 250);
    } catch (err) {
      const se = err as SignInError;
      if (se.code === "otp_required") {
        setEmail(e);
        setPassword(p);
        setStep("otp");
        setError(null);
      } else {
        setError({ message: se.message, code: se.code });
        if (se.code === "invalid_otp") setOtp("");
      }
    } finally {
      setBusy(null);
    }
  }

  const submitCredentials = (ev: React.FormEvent) => {
    ev.preventDefault();
    setTouched(true);
    if (!/^\S+@\S+\.\S+$/.test(email) || !password) return;
    signIn(email.trim(), password);
  };
  const submitOtp = (ev: React.FormEvent) => {
    ev.preventDefault();
    if (otp.replace(/\s/g, "").length < 6) return setError({ message: "Enter the 6-digit code.", code: "invalid_otp" });
    signIn(email.trim(), password, otp.replace(/\s/g, ""));
  };

  return (
    <AuthShell>
      <div className="flex flex-1 flex-col items-center px-4 pb-10 sm:px-8">
        <div className={cn("w-full", DEMO_LOGINS_ENABLED ? "max-w-[880px]" : "max-w-[420px] my-auto")}>
          <AuthCard className={cn(DEMO_LOGINS_ENABLED && "mt-2 sm:mt-6")}>
            {step === "credentials" ? (
              <form onSubmit={submitCredentials} noValidate>
                <div className="mb-6">
                  <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-ralga-navy/10 text-ralga-navy"><Lock size={20} /></span>
                  <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ralga-ink">{t("login.welcome")}</h2>
                  <p className="mt-1 text-[13.5px] text-slate-500">{t("login.subtitle")}</p>
                </div>
                {error && <ErrorBanner error={error} />}
                <div className="space-y-4">
                  <label className="block">
                    <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("login.email")}</span>
                    <input
                      type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ralga.rw"
                      aria-invalid={Boolean(emailError)}
                      className={cn(INPUT, "px-3")}
                    />
                    {emailError && <span className="mt-1 block text-[12px] text-red-600">{emailError}</span>}
                  </label>
                  <label className="block">
                    <span className="mb-1.5 flex items-center justify-between text-[13px] font-medium text-slate-700">
                      {t("login.password")}
                      <Link to="/forgot-password" className="text-[12.5px] font-semibold text-ralga-navy hover:text-ralga-sky-dark hover:underline">{t("login.forgot")}</Link>
                    </span>
                    <span className="relative block">
                      <input
                        type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                        aria-invalid={Boolean(passwordError)}
                        className={cn(INPUT, "pl-3 pr-11")}
                      />
                      <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? "Hide password" : "Show password"} className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </span>
                    {passwordError && <span className="mt-1 block text-[12px] text-red-600">{passwordError}</span>}
                  </label>
                </div>
                <button type="submit" disabled={Boolean(busy)} className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-primaryDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ralga-sky focus-visible:ring-offset-2 disabled:opacity-60">
                  {busy === "form" ? <><Loader2 size={16} className="animate-spin" /> {t("login.signingIn")}</> : <>{t("login.signIn")} <ArrowRight size={16} /></>}
                </button>
              </form>
            ) : (
              <form onSubmit={submitOtp} noValidate>
                <button type="button" onClick={() => { setStep("credentials"); setOtp(""); setError(null); }} className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-ralga-navy">
                  <ArrowLeft size={15} /> {t("login.useAnother")}
                </button>
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-ralga-navy/10 text-ralga-navy"><KeyRound size={20} /></span>
                <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ralga-ink">{t("login.otpTitle")}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">{t("login.otpHelp")}</p>
                <p className="mt-2 truncate text-[12.5px] font-medium text-slate-700">{email}</p>
                <div className="mt-5">{error && <ErrorBanner error={error} />}</div>
                <input
                  ref={otpRef} value={otp} onChange={(e) => setOtp(e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 11))}
                  inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="Verification code"
                  className={cn(INPUT, "h-14 text-center font-mono text-[26px] tracking-[0.35em] placeholder:text-slate-300")}
                />
                <button type="submit" disabled={Boolean(busy)} className="mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-white hover:bg-primaryDark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ralga-sky focus-visible:ring-offset-2 disabled:opacity-60">
                  {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} {t("login.verify")}
                </button>
              </form>
            )}
            <p className="mt-6 flex items-start gap-2 border-t border-slate-100 pt-4 text-[12px] leading-relaxed text-slate-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ralga-green" /> {t("login.secureNote")}
            </p>
          </AuthCard>

          {DEMO_LOGINS_ENABLED && step === "credentials" && <DemoRoles busy={busy} onPick={(acc, role) => signIn(acc.email, DEMO_PASSWORD, undefined, role.name)} />}
        </div>
      </div>
    </AuthShell>
  );
}

function ErrorBanner({ error }: { error: { message: string; code: string } }) {
  const locked = error.code === "account_locked";
  return (
    <div role="alert" className={cn("mb-4 flex items-start gap-2.5 rounded-lg border px-3 py-2.5 text-[13px] leading-snug", locked ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800")}>
      {locked ? <Lock size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
      <span>{error.message}</span>
    </div>
  );
}

// ------------------------------------------------------------------ demo role picker
function DemoRoles({ busy, onPick }: { busy: string | null; onPick: (acc: (typeof DEMO_ACCOUNTS)[number], role: RoleDef) => void }) {
  const { t } = useT();
  const [group, setGroup] = React.useState<string>("all");
  const [q, setQ] = React.useState("");
  const cards = ROLE_DEFS.map((role) => ({ role, acc: DEMO_ACCOUNTS.find((a) => a.code === role.code)! }))
    .filter((c) => c.acc)
    .filter((c) => group === "all" || c.role.group === group)
    .filter((c) => !q.trim() || `${c.role.name} ${c.acc.name} ${c.role.description}`.toLowerCase().includes(q.trim().toLowerCase()));
  const order = ROLE_GROUPS.map((g) => g.key);
  cards.sort((a, b) => order.indexOf(a.role.group) - order.indexOf(b.role.group) || a.role.sort - b.role.sort);

  return (
    <section className="mt-10" aria-labelledby="demo-title">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id="demo-title" className="flex items-center gap-2 text-[17px] font-extrabold tracking-[-0.01em] text-ralga-ink">
            <Users size={17} className="text-ralga-navy" /> {t("login.demoTitle")}
          </h2>
          <p className="mt-0.5 text-[13px] text-slate-500">
            {t("login.demoHelp")} {t("login.demoPassword")}: <code className="rounded bg-slate-200/70 px-1.5 py-0.5 font-mono text-[12px] text-slate-800">{DEMO_PASSWORD}</code>
          </p>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a role…" aria-label="Find a role" className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-[13px] focus:border-ralga-navy focus:outline-none focus:ring-2 focus:ring-ralga-sky/25 sm:w-56" />
      </div>
      <div className="-mx-1 mb-4 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {[{ key: "all", title: "All roles" }, ...ROLE_GROUPS].map((g) => (
          <button
            key={g.key} type="button" onClick={() => setGroup(g.key)} aria-pressed={group === g.key}
            className={cn("inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[12.5px] font-medium transition-colors", group === g.key ? "border-ralga-navy bg-ralga-navy text-white" : "border-slate-200 bg-white text-slate-600 hover:border-ralga-navy/40 hover:text-ralga-navy")}
          >
            {g.key !== "all" && <span className={cn("h-1.5 w-1.5 rounded-full", GROUP_TONE[g.key]?.dot, group === g.key && "ring-1 ring-white/70")} />}
            {g.title}
          </button>
        ))}
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {cards.map(({ role, acc }) => {
          const Icon = ICONS[role.icon] || User;
          const tone = GROUP_TONE[role.group] || GROUP_TONE.people;
          const loading = busy === role.name;
          return (
            <li key={role.code}>
              <button
                type="button" disabled={Boolean(busy)} onClick={() => onPick(acc, role)}
                className={cn("group flex h-full w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_24px_-14px_rgba(0,63,130,0.45)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ralga-sky/60 disabled:cursor-wait disabled:opacity-70", tone.ring)}
              >
                <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", tone.tile)}>
                  {loading ? <Loader2 size={18} className="animate-spin" /> : <Icon size={18} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-[14px] font-bold text-ralga-ink">{role.name}</span>
                    <ArrowRight size={15} className="shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-ralga-navy" />
                  </span>
                  <span className="block truncate text-[12.5px] text-slate-600">{acc.name} · {acc.designation}</span>
                  <span className="mt-2 flex flex-wrap gap-1">
                    {role.highlights.map((h) => (
                      <span key={h} className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-600">{h}</span>
                    ))}
                  </span>
                  <span className="mt-2 block truncate font-mono text-[11px] text-slate-400">{acc.email}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      {!cards.length && <p className="rounded-lg border border-dashed border-slate-200 bg-white p-6 text-center text-[13px] text-slate-500">No role matches “{q}”.</p>}
    </section>
  );
}
