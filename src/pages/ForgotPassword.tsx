/**
 * Password reset request: PocketBase e-mails a reset link. The same confirmation is shown whether
 * or not the address has an account, so the page cannot be used to discover who has one.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { AlertCircle, ArrowLeft, Loader2, MailCheck, Send, ShieldCheck } from "lucide-react";
import authService from "@/services/auth.service";
import AuthShell, { AuthCard } from "@/components/enterprise/AuthShell";
import { useT } from "@/i18n";
import { cn } from "@/utils";

export function ForgotPassword() {
  const { t } = useT();
  const [email, setEmail] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);
  const [error, setError] = React.useState("");

  const valid = /^\S+@\S+\.\S+$/.test(email.trim());
  const emailError = touched && !valid ? "Enter your work e-mail address." : "";

  async function submit(ev: React.FormEvent) {
    ev.preventDefault();
    setTouched(true);
    if (!valid) return;
    setBusy(true);
    setError("");
    try {
      await authService.forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (e) {
      setError((e as Error).message || "The reset link could not be sent. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell>
      <div className="flex flex-1 flex-col items-center px-4 pb-10 sm:px-8">
        <div className="my-auto w-full max-w-[420px]">
          <AuthCard>
            {sent ? (
              <div>
                <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-ralga-green/10 text-ralga-green"><MailCheck size={20} /></span>
                <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ralga-ink">{t("forgot.sentTitle")}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">
                  {t("forgot.sentText")} <span className="font-semibold text-slate-800">{email.trim()}</span>
                </p>
                <Link to="/" className="mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-white hover:bg-primaryDark">
                  <ArrowLeft size={16} /> {t("forgot.back")}
                </Link>
              </div>
            ) : (
              <form onSubmit={submit} noValidate>
                <Link to="/" className="mb-5 inline-flex items-center gap-1.5 text-[13px] font-medium text-slate-500 hover:text-ralga-navy">
                  <ArrowLeft size={15} /> {t("forgot.back")}
                </Link>
                <h2 className="text-[24px] font-extrabold tracking-[-0.02em] text-ralga-ink">{t("forgot.title")}</h2>
                <p className="mt-1 text-[13.5px] leading-relaxed text-slate-500">{t("forgot.subtitle")}</p>
                {error && (
                  <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] leading-snug text-red-800">
                    <AlertCircle size={15} className="mt-0.5 shrink-0" /> <span>{error}</span>
                  </div>
                )}
                <label className="mt-6 block">
                  <span className="mb-1.5 block text-[13px] font-medium text-slate-700">{t("login.email")}</span>
                  <input
                    type="email" autoComplete="username" inputMode="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@ralga.rw"
                    aria-invalid={Boolean(emailError)}
                    className="block h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-[14px] text-slate-900 placeholder:text-slate-400 focus:border-ralga-navy focus:outline-none focus:ring-2 focus:ring-ralga-sky/25 aria-[invalid=true]:border-red-400"
                  />
                  {emailError && <span className="mt-1 block text-[12px] text-red-600">{emailError}</span>}
                </label>
                <button type="submit" disabled={busy} className={cn("mt-6 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-primaryDark disabled:opacity-60")}>
                  {busy ? <><Loader2 size={16} className="animate-spin" /> {t("forgot.sending")}</> : <><Send size={15} /> {t("forgot.send")}</>}
                </button>
              </form>
            )}
            <p className="mt-6 flex items-start gap-2 border-t border-slate-100 pt-4 text-[12px] leading-relaxed text-slate-500">
              <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ralga-green" /> {t("forgot.note")}
            </p>
          </AuthCard>
        </div>
      </div>
    </AuthShell>
  );
}
