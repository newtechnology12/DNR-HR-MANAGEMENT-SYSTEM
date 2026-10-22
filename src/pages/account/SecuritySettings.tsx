/**
 * Account → Security: two-factor authentication with an authenticator app (Google / Microsoft
 * Authenticator, Authy…). Set-up shows a QR code; eight one-time recovery codes are shown once.
 */
import * as React from "react";
import QRCode from "qrcode";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Copy, Download, KeyRound, ShieldCheck, ShieldOff, Smartphone } from "lucide-react";
import { useAuth } from "@/context/auth.context";
import { imsApi } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { BRAND } from "@/lib/brand";
import { color } from "@/design/tokens";
import { Button, Field, Input, StatusPill } from "@/components/ims";
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
      // The QR code stays dark on white in every theme so phone cameras can read it.
      const qr = await QRCode.toDataURL(s.otpauth, { margin: 1, width: 220, color: { dark: color.text, light: color.card } });
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
    <div className="space-y-5">
      {required && !on && (
        <div role="alert" className="flex items-start gap-3 rounded-control border border-ims-priority-high/50 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" aria-hidden />
          <p><strong>Two-factor authentication is required for your role.</strong> Set it up now to continue using the system.</p>
        </div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-control", on ? "bg-ims-success-bg text-ims-success" : "bg-ims-subtle text-ims-muted")} aria-hidden>
            {on ? <ShieldCheck size={19} /> : <ShieldOff size={19} />}
          </span>
          <div>
            <h3 className="text-t-section text-ims-text">Two-factor authentication</h3>
            <p className="text-t-body text-ims-muted">After your password, sign-in asks for a 6-digit code from an authenticator app on your phone.</p>
          </div>
        </div>
        <StatusPill status={on ? "Active" : "Inactive"} sub={on ? "On" : "Off"} />
      </div>

      {recovery && (
        <div className="rounded-card border border-ims-success/30 bg-ims-success-bg p-4">
          <p className="flex items-center gap-2 text-t-body font-bold text-ims-success"><CheckCircle2 size={16} aria-hidden /> Save your recovery codes</p>
          <p className="mt-0.5 text-t-small text-ims-body">If you lose your phone, each code signs you in once. They are shown only now.</p>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {recovery.map((c) => <li key={c} className="rounded-md bg-ims-card px-2 py-1.5 text-center font-mono text-t-small tracking-wider text-ims-text ring-1 ring-inset ring-ims-success/30">{c}</li>)}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" icon={Copy} onClick={() => { navigator.clipboard?.writeText(recovery.join("\n")); toast.success("Recovery codes copied"); }}>Copy</Button>
            <Button size="sm" icon={Download} onClick={downloadCodes}>Download</Button>
            <Button size="sm" variant="primary" onClick={() => setRecovery(null)}>I saved them</Button>
          </div>
        </div>
      )}

      {!on && !setup && !recovery && (
        <Button variant="primary" icon={Smartphone} onClick={start} loading={busy}>Set up two-factor authentication</Button>
      )}

      {setup && (
        <div className="grid gap-5 rounded-card border border-ims-border p-4 sm:grid-cols-[220px_1fr]">
          <img src={setup.qr} alt="QR code for your authenticator app" className="h-[220px] w-[220px] rounded-control border border-ims-border" />
          <div className="space-y-3 text-t-body text-ims-body">
            <ol className="list-decimal space-y-1.5 pl-4">
              <li>Install an authenticator app (Google Authenticator, Microsoft Authenticator or Authy).</li>
              <li>
                Scan the QR code. If you cannot scan, enter this key:
                <br />
                <code className="mt-1 inline-block select-all break-all rounded-md bg-ims-subtle px-2 py-1 font-mono text-t-small tracking-wider text-ims-text">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</code>
              </li>
              <li>Type the 6-digit code the app shows.</li>
            </ol>
            <div className="flex flex-wrap items-end gap-2">
              <Field label="6-digit code" htmlFor="tfa-code">
                <Input
                  id="tfa-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  placeholder="000000"
                  className="w-40 text-center font-mono text-t-kpi tracking-[0.3em]"
                />
              </Field>
              <Button variant="primary" icon={KeyRound} onClick={enable} loading={busy}>Turn on</Button>
              <Button variant="ghost" onClick={() => setSetup(null)}>Cancel</Button>
            </div>
          </div>
        </div>
      )}

      {on && !recovery && (
        <div className="rounded-card border border-ims-border p-4 text-t-body text-ims-body">
          <p>Recovery codes left: <strong className="text-ims-text">{me?.security?.recovery_codes_left ?? 0}</strong>. Lost your phone and your codes? Ask a System Administrator to reset 2FA.</p>
          {me?.security?.two_factor_required ? (
            <p className="mt-2 text-t-small text-ims-muted">Your role must use two-factor authentication, so it cannot be turned off.</p>
          ) : !disabling ? (
            <Button className="mt-3" size="sm" icon={ShieldOff} onClick={() => setDisabling(true)}>Turn off</Button>
          ) : (
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Field label="Current code or a recovery code" htmlFor="tfa-off-code">
                <Input id="tfa-off-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 11))} className="w-56 font-mono" autoComplete="one-time-code" />
              </Field>
              <Button variant="danger" onClick={disable} loading={busy}>Turn off 2FA</Button>
              <Button variant="ghost" onClick={() => { setDisabling(false); setCode(""); }}>Cancel</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
