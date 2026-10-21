/**
 * Sign-in: work e-mail + password, then the authenticator code when 2FA is on. Lockout and inactive
 * accounts get a clear message. "Keep me signed in" off = the sign-in ends when the browser closes.
 * In development / demo builds (VITE_DEMO_LOGINS=true) a compact picker fills the form with any of the
 * 13 RALGA demo roles.
 */
import * as React from "react";
import { Link, useNavigate } from "react-router-dom";
import qs from "qs";
import { toast } from "sonner";
import { AlertCircle, ArrowLeft, ArrowRight, Check, ChevronDown, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, Search, ShieldCheck, Users } from "lucide-react";
import authService, { SignInError } from "@/services/auth.service";
import { BRAND, DEMO_LOGINS_ENABLED } from "@/lib/brand";
import { rememberSignIn } from "@/lib/pocketbase";
import { DEMO_ACCOUNTS, DEMO_PASSWORD, ROLE_DEFS } from "@/lib/ims";
import AuthShell from "@/components/enterprise/AuthShell";
import { useT } from "@/i18n";
import { cn } from "@/utils";

type Step = "credentials" | "otp";

const INPUT =
  "block h-11 w-full rounded-[9px] border border-[#CBD5E1] bg-white pl-10 pr-3.5 text-[14px] text-slate-900 outline-none transition-[border-color,box-shadow] placeholder:text-slate-400 focus:border-[#2463B5] focus:shadow-[0_0_0_3px_rgba(36,99,181,.14)] aria-[invalid=true]:border-red-400";
const BUTTON =
  "flex h-11 w-full items-center justify-center gap-2 rounded-[9px] bg-[#0A2647] text-[14.5px] font-semibold text-white transition-colors hover:bg-[#0F3460] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2463B5] focus-visible:ring-offset-2 disabled:opacity-60";

export function Login() {
  const { t } = useT();
  const navigate = useNavigate();
  const redirect = (qs.parse(location.search, { ignoreQueryPrefix: true })?.redirect as string) || "/dashboard";

  const [step, setStep] = React.useState<Step>("credentials");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [otp, setOtp] = React.useState("");
  const [keep, setKeep] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<{ message: string; code: string } | null>(null);
  const [touched, setTouched] = React.useState(false);
  const otpRef = React.useRef<HTMLInputElement>(null);
  const submitRef = React.useRef<HTMLButtonElement>(null);

  React.useEffect(() => {
    if (step === "otp") setTimeout(() => otpRef.current?.focus(), 50);
  }, [step]);

  const emailError = touched && !/^\S+@\S+\.\S+$/.test(email) ? t("login.emailRequired", "Enter your work e-mail address.") : "";
  const passwordError = touched && !password ? t("login.passwordRequired", "Enter your password.") : "";

  async function signIn(e: string, p: string, code?: string) {
    setError(null);
    setBusy(true);
    try {
      await authService.signIn({ email: e, password: p, otp: code });
      rememberSignIn(keep);
      setTimeout(() => navigate(redirect), 200);
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
      setBusy(false);
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
    if (otp.replace(/\s/g, "").length < 6) return setError({ message: t("login.otpShort", "Enter the 6-digit code."), code: "invalid_otp" });
    signIn(email.trim(), password, otp.replace(/\s/g, ""));
  };

  return (
    <AuthShell footer={<HelpLine />}>
      {step === "credentials" ? (
        <>
          <span className="mb-[22px] hidden h-11 w-11 place-items-center rounded-xl border border-slate-200 text-[#0A2647] min-[900px]:grid"><Lock size={20} strokeWidth={1.8} /></span>
          <h2 className="text-[26px] font-bold tracking-[-0.025em] text-slate-900">{t("login.welcome", "Welcome back")}</h2>
          <p className="mb-7 mt-1.5 text-[14px] text-slate-500">{t("login.subtitle", "Sign in with your RALGA work account.")}</p>
          {error && <ErrorBanner error={error} />}
          <form onSubmit={submitCredentials} noValidate>
            <div className="mb-4">
              <label htmlFor="email" className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("login.email", "Work email")}</label>
              <div className="relative">
                <Mail size={16} strokeWidth={1.8} className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="email" type="email" autoComplete="username" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ralga.rw"
                  aria-invalid={Boolean(emailError) || undefined} aria-describedby={emailError ? "email-error" : undefined} className={INPUT}
                />
              </div>
              {emailError && <p id="email-error" className="mt-1 text-[12px] text-red-600">{emailError}</p>}
            </div>
            <div className="mb-4">
              <div className="mb-1.5 flex items-baseline justify-between">
                <label htmlFor="password" className="text-[13px] font-medium text-slate-700">{t("login.password", "Password")}</label>
                <Link to="/forgot-password" className="text-[13px] font-medium text-[#2463B5] hover:underline">{t("login.forgot", "Forgot password?")}</Link>
              </div>
              <div className="relative">
                <Lock size={16} strokeWidth={1.8} className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="password" type={showPassword ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder={t("login.passwordPlaceholder", "Enter your password")} aria-invalid={Boolean(passwordError) || undefined} aria-describedby={passwordError ? "password-error" : undefined}
                  className={cn(INPUT, "pr-11")}
                />
                <button type="button" onClick={() => setShowPassword((s) => !s)} aria-label={showPassword ? t("login.hidePassword", "Hide password") : t("login.showPassword", "Show password")} className="absolute right-1.5 top-1/2 grid h-8 w-8 -translate-y-1/2 place-items-center rounded-md text-slate-500 hover:bg-slate-100">
                  {showPassword ? <EyeOff size={17} strokeWidth={1.8} /> : <Eye size={17} strokeWidth={1.8} />}
                </button>
              </div>
              {passwordError && <p id="password-error" className="mt-1 text-[12px] text-red-600">{passwordError}</p>}
            </div>
            <label className="mb-[22px] mt-1 flex cursor-pointer items-center gap-2 text-[13px] text-slate-700">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} className="h-4 w-4 accent-[#0A2647]" />
              {t("login.keep", "Keep me signed in on this device")}
            </label>
            <button ref={submitRef} type="submit" disabled={busy} className={cn(BUTTON, "group")}>
              {busy ? <><Loader2 size={16} className="animate-spin" /> {t("login.signingIn", "Signing in…")}</> : <>{t("login.signIn", "Sign in")} <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></>}
            </button>
            <p className="mt-4 flex items-center justify-center gap-2 text-[12px] text-slate-500">
              <ShieldCheck size={14} strokeWidth={1.8} className="text-green-600" /> {t("login.secure", "Two-factor authentication · Encrypted · Audited")}
            </p>
          </form>
          {DEMO_LOGINS_ENABLED && (
            <DemoPicker
              onPick={(acc) => {
                setEmail(acc.email);
                setPassword(DEMO_PASSWORD);
                setTouched(false);
                setError(null);
                setTimeout(() => submitRef.current?.focus(), 0);
              }}
            />
          )}
        </>
      ) : (
        <form onSubmit={submitOtp} noValidate>
          <button type="button" onClick={() => { setStep("credentials"); setOtp(""); setError(null); }} className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-[#0A2647]">
            <ArrowLeft size={15} /> {t("login.useAnother", "Use another account")}
          </button>
          <span className="mb-[22px] grid h-11 w-11 place-items-center rounded-xl border border-slate-200 text-[#0A2647]"><KeyRound size={20} strokeWidth={1.8} /></span>
          <h2 className="text-[26px] font-bold tracking-[-0.025em] text-slate-900">{t("login.otpTitle", "Two-step verification")}</h2>
          <p className="mt-1.5 text-[14px] leading-relaxed text-slate-500">{t("login.otpHelp")}</p>
          <p className="mb-6 mt-2 truncate text-[13px] font-medium text-slate-700">{email}</p>
          {error && <ErrorBanner error={error} />}
          <input
            ref={otpRef} value={otp} onChange={(e) => setOtp(e.target.value.toUpperCase().replace(/[^0-9A-Z-]/g, "").slice(0, 11))}
            inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label={t("login.otpTitle", "Verification code")}
            className={cn(INPUT, "h-14 pl-3.5 text-center font-mono text-[26px] tracking-[0.35em] placeholder:text-slate-300")}
          />
          <button type="submit" disabled={busy} className={cn(BUTTON, "mt-5")}>
            {busy ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />} {t("login.verify", "Verify and sign in")}
          </button>
        </form>
      )}
    </AuthShell>
  );
}

function HelpLine() {
  const { t } = useT();
  const ask = t("login.askIct", "Your account is created by the System Administrator in the RALGA ICT unit. Ask them, or your head of department, for access.");
  return (
    <p className="mt-6 text-center text-[12.5px] text-slate-500">
      {t("login.needAccess", "Need access?")}{" "}
      {BRAND.supportEmail ? (
        <a href={`mailto:${BRAND.supportEmail}`} className="font-medium text-slate-700 hover:underline">{t("login.contactIct", "Contact the RALGA ICT unit")}</a>
      ) : (
        <button type="button" onClick={() => toast.info(ask)} className="font-medium text-slate-700 hover:underline">{t("login.contactIct", "Contact the RALGA ICT unit")}</button>
      )}
    </p>
  );
}

function ErrorBanner({ error }: { error: { message: string; code: string } }) {
  const locked = error.code === "account_locked";
  return (
    <div role="alert" className={cn("mb-5 flex items-start gap-2.5 rounded-[9px] border px-3 py-2.5 text-[13px] leading-snug", locked ? "border-amber-200 bg-amber-50 text-amber-900" : "border-red-200 bg-red-50 text-red-800")}>
      {locked ? <Lock size={15} className="mt-0.5 shrink-0" /> : <AlertCircle size={15} className="mt-0.5 shrink-0" />}
      <span>{error.message}</span>
    </div>
  );
}

// ------------------------------------------------------------------ demo role picker
type DemoAccount = (typeof DEMO_ACCOUNTS)[number];
const PICKER_GROUPS: { key: string; label: [string, string]; codes: string[]; tone: string }[] = [
  { key: "lead", label: ["login.groupLead", "Leadership & oversight"], codes: ["SG", "INTERNAL_AUDITOR", "MGMT_VIEWER"], tone: "bg-[#E0ECFB] text-[#1E4E8C]" },
  { key: "fin", label: ["login.groupFinance", "Finance"], codes: ["DAF", "ACCOUNTANT", "BUDGET_OFFICER", "CASHIER"], tone: "bg-[#DCF5EA] text-[#0F6E52]" },
  { key: "ops", label: ["login.groupOps", "Operations"], codes: ["PROCUREMENT_OFFICER", "HR_PAYROLL", "STORE_ASSET", "SYS_ADMIN"], tone: "bg-[#ECE9FB] text-[#4B3B9A]" },
  { key: "staff", label: ["login.groupStaff", "Departments"], codes: ["HOD", "STAFF"], tone: "bg-[#FDF1D8] text-[#8A5A07]" },
];
const initials = (role: string) =>
  role.replace(/\(.*?\)/g, "").split(/[\s/&]+/).filter((w) => /^[A-Z]/.test(w)).slice(0, 2).map((w) => w[0]).join("");

function DemoPicker({ onPick }: { onPick: (acc: DemoAccount) => void }) {
  const { t } = useT();
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [picked, setPicked] = React.useState<{ acc: DemoAccount; role: string } | null>(null);
  const box = React.useRef<HTMLDivElement>(null);
  const search = React.useRef<HTMLInputElement>(null);
  const list = React.useRef<HTMLDivElement>(null);

  const rows = React.useMemo(() => {
    const known = PICKER_GROUPS.flatMap((g) => g.codes);
    return PICKER_GROUPS.map((g, gi) => {
      const codes = gi === PICKER_GROUPS.length - 1 ? [...g.codes, ...ROLE_DEFS.map((r) => r.code).filter((c) => !known.includes(c))] : g.codes;
      const items = codes
        .map((code) => ({ role: ROLE_DEFS.find((r) => r.code === code), acc: DEMO_ACCOUNTS.find((a) => a.code === code) }))
        .filter((x): x is { role: (typeof ROLE_DEFS)[number]; acc: DemoAccount } => Boolean(x.role && x.acc))
        .filter((x) => !q.trim() || `${x.role.name} ${x.acc.name} ${x.acc.email}`.toLowerCase().includes(q.trim().toLowerCase()));
      return { ...g, items };
    }).filter((g) => g.items.length);
  }, [q]);
  const count = DEMO_ACCOUNTS.length;

  React.useEffect(() => {
    if (!open) return;
    setQ("");
    setTimeout(() => search.current?.focus(), 0);
    const outside = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);

  const move = (e: React.KeyboardEvent, dir: 1 | -1) => {
    const opts = Array.from(list.current?.querySelectorAll<HTMLButtonElement>("[role=option]") || []);
    if (!opts.length) return;
    e.preventDefault();
    const i = opts.indexOf(document.activeElement as HTMLButtonElement);
    if (i === -1) return opts[dir === 1 ? 0 : opts.length - 1].focus();
    opts[Math.min(Math.max(i + dir, 0), opts.length - 1)].focus();
    if (i + dir < 0) search.current?.focus();
  };

  return (
    <div ref={box} className="relative mt-[26px]">
      <div className="mb-3 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-400 before:h-px before:flex-1 before:bg-slate-200 after:h-px after:flex-1 after:bg-slate-200">
        {t("login.demoAccess", "Demo access")}
      </div>
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className={cn("flex h-[46px] w-full items-center gap-2.5 rounded-[9px] border border-dashed px-3 text-left transition-colors", open ? "border-[#2463B5] bg-[#EEF4FC]" : "border-[#CBD5E1] bg-slate-50 hover:border-[#2463B5] hover:bg-[#EEF4FC]")}
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[7px] border border-slate-200 bg-white text-[#0A2647]"><Users size={14} strokeWidth={1.8} /></span>
        <span className="min-w-0 flex-1">
          <b className="block truncate text-[13px] font-semibold text-slate-900">{picked ? picked.role : t("login.demoPick", "Sign in as a demo role")}</b>
          <span className="block truncate text-[11.5px] text-slate-500">{picked ? `${picked.acc.name} · ${t("login.demoReady", "ready to sign in")}` : t("login.demoPickSub", "{n} roles · fills the form for you").replace("{n}", String(count))}</span>
        </span>
        <span className="whitespace-nowrap rounded-full border border-orange-200 bg-orange-50 px-2 py-px text-[10.5px] font-semibold text-amber-700">{t("login.testOnly", "Test only")}</span>
        <ChevronDown size={16} className={cn("shrink-0 text-slate-500 transition-transform", open && "rotate-180")} aria-hidden />
      </button>

      {open && (
        <div className="absolute inset-x-0 top-[calc(100%+6px)] z-20 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_12px_32px_-12px_rgba(15,23,42,.18)] min-[900px]:bottom-[calc(100%-22px)] min-[900px]:top-auto">
          <div className="relative border-b border-slate-100">
            <Search size={14} className="pointer-events-none absolute left-[13px] top-1/2 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              ref={search} type="search" value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={(e) => e.key === "ArrowDown" && move(e, 1)}
              placeholder={t("login.searchRole", "Search role or name…")} aria-label={t("login.searchRole", "Search role or name…")}
              className="h-[42px] w-full border-0 pl-9 pr-3 text-[13px] outline-none"
            />
          </div>
          <div ref={list} role="listbox" aria-label={t("login.demoPick", "Demo roles")} className="max-h-[300px] overflow-auto p-1.5" onKeyDown={(e) => (e.key === "ArrowDown" ? move(e, 1) : e.key === "ArrowUp" ? move(e, -1) : null)}>
            {!rows.length && <p className="p-5 text-center text-[12.5px] text-slate-500">{t("login.noRole", "No role matches your search.")}</p>}
            {rows.map((g) => (
              <div key={g.key}>
                <p className="px-2.5 pb-1 pt-2.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-slate-400">{t(g.label[0], g.label[1])}</p>
                {g.items.map(({ role, acc }) => {
                  const sel = picked?.acc.email === acc.email;
                  return (
                    <button
                      key={acc.email}
                      type="button"
                      role="option"
                      aria-selected={sel}
                      onClick={() => {
                        setPicked({ acc, role: role.name });
                        setOpen(false);
                        onPick(acc);
                      }}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left outline-none hover:bg-slate-100 focus-visible:bg-slate-100", sel && "bg-[#EEF4FC]")}
                    >
                      <span className={cn("grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] text-[10.5px] font-bold", g.tone)}>{initials(role.name)}</span>
                      <span className="min-w-0">
                        <b className="block truncate text-[13px] font-semibold leading-tight text-slate-900">{role.name}</b>
                        <span className="block truncate text-[11.5px] leading-tight text-slate-500">{acc.name}</span>
                      </span>
                      <Check size={15} strokeWidth={2.2} className={cn("ml-auto shrink-0 text-[#2463B5]", !sel && "invisible")} aria-hidden />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-[11.5px] text-slate-500">
            <span>{t("login.demoPassword", "Password for all demo roles")}</span>
            <code className="rounded-[5px] border border-slate-200 bg-slate-100 px-1.5 py-px font-mono text-[11px] text-slate-700">{DEMO_PASSWORD}</code>
          </div>
        </div>
      )}
    </div>
  );
}
