/**
 * Account → Security: two-factor authentication with an authenticator app (Google / Microsoft
 * Authenticator, Authy…). Set-up shows a QR code; eight one-time recovery codes are shown once.
 */
import * as React from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Download, KeyRound, Loader2, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useAuth } from "@/context/auth.context";
import { imsApi } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { BRAND } from "@/lib/brand";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/enterprise/ui";
import { cn } from "@/utils";

export default function SecuritySettings({ required = false }: { required?: boolean }) {
  const { me, refreshMe, user } = useAuth();
  const [setup, setSetup] = React.useState<{ secret: string; otpauth: string; qr: string } | null>(null);
  const [code, setCode] = React.useState("");
  const [recovery, setRecovery] = React.useState<string[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [disabling, setDisabling] = React.useState(false);
  const on = me?.security?.totp_enabled;

  async function start() {
    setBusy(true);
    try {
      const s = await imsApi.setup2fa();
      const qr = await QRCode.toDataURL(s.otpauth, { margin: 1, width: 220, color: { dark: "#0F172A", light: "#FFFFFF" } });
      setSetup({ ...s, qr });
      setCode("");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function enable() {
    if (!/^\d{6}$/.test(code)) return toast.error("Enter the 6-digit code shown in the app.");
    setBusy(true);
    try {
      const r = await imsApi.enable2fa(code);
      setRecovery(r.recovery_codes);
      setSetup(null);
      setCode("");
      await refreshMe();
      toast.success("Two-factor authentication is on");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function disable() {
    setBusy(true);
    try {
      await imsApi.disable2fa(code.trim());
      setDisabling(false);
      setCode("");
      await refreshMe();
      toast.success("Two-factor authentication is off");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const downloadCodes = () => {
    const text = `${BRAND.product} — recovery codes for ${user?.email}\nEach code works once. Keep them somewhere safe.\n\n${(recovery || []).join("\n")}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
    a.download = "ralga-ims-recovery-codes.txt";
    a.click();
  };

  return (
    <div className="space-y-5 p-4 sm:p-5">
      {required && !on && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <p><strong>Two-factor authentication is required for your role.</strong> Set it up now to continue using the system.</p>
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg", on ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")}>
            {on ? <ShieldCheck size={19} /> : <ShieldOff size={19} />}
          </span>
          <div>
            <h3 className="text-[15px] font-semibold text-slate-900">Two-factor authentication</h3>
            <p className="text-[13px] text-slate-500">After your password, sign-in asks for a 6-digit code from an authenticator app on your phone.</p>
          </div>
        </div>
        <Badge tone={on ? "success" : "neutral"}>{on ? "On" : "Off"}</Badge>
      </div>

      {recovery && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
          <p className="flex items-center gap-2 text-[13.5px] font-semibold text-emerald-900"><CheckCircle2 size={16} /> Save your recovery codes</p>
          <p className="mt-0.5 text-[12.5px] text-emerald-900/80">If you lose your phone, each code signs you in once. They are shown only now.</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {recovery.map((c) => <li key={c} className="rounded-md bg-white px-2 py-1.5 text-center font-mono text-[13px] tracking-wider text-slate-800 ring-1 ring-emerald-200">{c}</li>)}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => { navigator.clipboard?.writeText(recovery.join("\n")); toast.success("Copied"); }}><Copy size={13} /> Copy</Button>
            <Button size="sm" variant="outline" onClick={downloadCodes}><Download size={13} /> Download</Button>
            <Button size="sm" onClick={() => setRecovery(null)}>I saved them</Button>
          </div>
        </div>
      )}

      {!on && !setup && !recovery && (
        <Button onClick={start} disabled={busy}>{busy ? <Loader2 size={15} className="animate-spin" /> : <Smartphone size={15} />} Set up two-factor authentication</Button>
      )}

      {setup && (
        <div className="grid gap-5 rounded-xl border border-slate-200 p-4 sm:grid-cols-[220px_1fr]">
          <img src={setup.qr} alt="QR code for your authenticator app" className="h-[220px] w-[220px] rounded-lg border border-slate-200" />
          <div className="space-y-3 text-[13px] text-slate-700">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy).</li>
              <li>Scan the QR code. If you cannot scan, enter this key:<br /><code className="mt-1 inline-block select-all break-all rounded bg-slate-100 px-2 py-1 font-mono text-[12.5px] tracking-wider text-slate-900">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code></li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>
            <div className="flex gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="000000" aria-label="6-digit code" className="h-11 w-36 rounded-lg border border-slate-200 text-center font-mono text-[20px] tracking-[0.3em] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
              <Button onClick={enable} disabled={busy} className="h-11">{busy ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Turn on</Button>
              <Button variant="ghost" className="h-11" onClick={() => setSetup(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {on && !recovery && (
        <div className="rounded-xl border border-slate-200 p-4 text-[13px] text-slate-600">
          <p>Recovery codes left: <strong className="text-slate-900">{me?.security?.recovery_codes_left ?? 0}</strong>. Lost your phone and your codes? Ask a System Administrator to reset 2FA.</p>
          {me?.security?.two_factor_required ? (
            <p className="mt-2 text-[12.5px] text-slate-500">Your role must use two-factor authentication, so it cannot be turned off.</p>
          ) : !disabling ? (
            <Button className="mt-3" size="sm" variant="outline" onClick={() => setDisabling(true)}><ShieldOff size={13} /> Turn off</Button>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 11))} placeholder="Code or recovery code" aria-label="Current code" className="h-9 w-48 rounded-md border border-slate-200 px-3 font-mono text-[13px] outline-none focus:border-primary" />
              <Button size="sm" variant="danger" onClick={disable} disabled={busy}>Confirm turn off</Button>
              <Button size="sm" variant="ghost" onClick={() => { setDisabling(false); setCode(""); }}>Cancel</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
