/**
 * Settings → E-mail: the mail server the system sends notifications with (applied to the server's mailer
 * as soon as it is saved), a test e-mail with its result, and the log of every e-mail with retry.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Mail, RefreshCw, Search, Send, Server, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import useSettings from "@/hooks/useSettings";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, Panel } from "@/components/enterprise/ui";
import { Field, inputCls } from "@/components/portal/kit";
import { cn } from "@/utils";

const PRESETS = [
  { key: "office365", label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: "587", encryption: "starttls", note: "Use a mailbox licensed for SMTP AUTH (e.g. noreply@ralga.gov.rw)." },
  { key: "gmail", label: "Google Workspace / Gmail", host: "smtp.gmail.com", port: "587", encryption: "starttls", note: "Use an app password (Google account → Security → App passwords), not the normal password." },
  { key: "custom", label: "Other mail server", host: "", port: "587", encryption: "starttls", note: "Ask your ICT team for the SMTP host, port and account." },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const STATUS: Record<string, { label: string; tone: "success" | "danger" | "warning" | "neutral"; icon: any }> = {
  sent: { label: "Sent", tone: "success", icon: CheckCircle2 },
  failed: { label: "Failed", tone: "danger", icon: XCircle },
  skipped: { label: "Not sent", tone: "warning", icon: AlertTriangle },
  queued: { label: "Queued", tone: "neutral", icon: Mail },
};

export default function SmtpSettings() {
  const { settings } = useSettings() as any;
  const { user }: any = useAuth();
  const queryClient = useQueryClient();
  const [v, setV] = React.useState<Record<string, any>>({});
  const [tried, setTried] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [testTo, setTestTo] = React.useState("");
  const [testing, setTesting] = React.useState(false);
  const [lastTest, setLastTest] = React.useState<{ status: string; error: string } | null>(null);

  React.useEffect(() => {
    if (!settings) return;
    setV({
      smtp_enabled: Boolean(settings.smtp_enabled), smtp_host: settings.smtp_host || "", smtp_port: settings.smtp_port || "587",
      smtp_encryption: settings.smtp_encryption || "starttls", smtp_username: settings.smtp_username || "", smtp_password: "",
      smtp_from_email: settings.smtp_from_email || "", smtp_from_name: settings.smtp_from_name || "RALGA IMS",
      app_url: settings.app_url || window.location.origin,
    });
  }, [settings]);
  React.useEffect(() => setTestTo((t) => t || user?.email || ""), [user]);

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  const port = Number(v.smtp_port);
  const errors: Record<string, string | false> = {
    smtp_host: v.smtp_enabled && !String(v.smtp_host || "").trim() && "Enter the mail server.",
    smtp_port: v.smtp_enabled && !(port >= 1 && port <= 65535) && "Port between 1 and 65535 (usually 587 or 465).",
    smtp_from_email: v.smtp_enabled && !EMAIL.test(String(v.smtp_from_email || "").trim()) && "Enter the sender address.",
    app_url: Boolean(v.app_url) && !/^https?:\/\/[^\s]+$/.test(String(v.app_url).trim()) && "Start with https:// (e.g. https://ims.ralga.gov.rw).",
  };
  const invalid = Object.values(errors).some(Boolean);

  async function save() {
    setTried(true);
    if (invalid) return toast.error("Check the highlighted fields.");
    setBusy(true);
    try {
      const data: Record<string, any> = { ...v, smtp_port: String(port || ""), smtp_host: String(v.smtp_host).trim(), smtp_from_email: String(v.smtp_from_email).trim(), app_url: String(v.app_url || "").trim().replace(/\/$/, "") };
      if (!data.smtp_password) delete data.smtp_password; // blank keeps the saved password
      await pocketbase.collection("settings").update(settings.id, data);
      toast.success(v.smtp_enabled ? "E-mail settings saved and applied" : "Saved — e-mail sending is switched off");
      setV((x) => ({ ...x, smtp_password: "" }));
      queryClient.invalidateQueries();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    if (!EMAIL.test(testTo.trim())) return toast.error("Enter a valid address to send the test to.");
    setTesting(true);
    setLastTest(null);
    try {
      const r: any = await pocketbase.send("/api/ims/mail/test", { method: "POST", body: { to: testTo.trim() } });
      setLastTest({ status: r.status, error: r.error });
      if (r.status === "sent") toast.success(`Test e-mail sent to ${testTo.trim()}`);
      else toast.error(r.error || "The test e-mail was not sent.");
      queryClient.invalidateQueries(["mail-log"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setTesting(false);
    }
  }

  if (!settings) return <div className="p-6"><ListSkeleton rows={6} /></div>;
  return (
    <div className="max-w-4xl space-y-4 px-4 py-4">
      <div>
        <h2 className="text-[17px] font-semibold text-slate-900">E-mail</h2>
        <p className="text-[13px] text-slate-500">Approvals, reminders, payslips and alerts are e-mailed to staff through this mail server. In-app notifications always work, with or without e-mail.</p>
      </div>

      <Panel title={<span className="flex items-center gap-2"><Server size={15} className="text-slate-400" /> Mail server</span>} subtitle="Saved settings are applied immediately — no restart needed.">
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
            <span>
              <span className="block text-[13.5px] font-medium text-slate-900">Send e-mails</span>
              <span className="block text-[12px] text-slate-500">When off, notifications stay in the app and the log shows them as not sent.</span>
            </span>
            <input type="checkbox" className="h-5 w-5 rounded border-slate-300 text-primary" checked={Boolean(v.smtp_enabled)} onChange={(e) => setV((x) => ({ ...x, smtp_enabled: e.target.checked }))} aria-label="Send e-mails" />
          </label>
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((p) => (
              <button key={p.key} type="button" onClick={() => { setV((x) => ({ ...x, smtp_host: p.host || x.smtp_host, smtp_port: p.port, smtp_encryption: p.encryption })); toast.info(p.note); }}
                className="rounded-full border border-slate-200 px-3 py-1 text-[12.5px] text-slate-700 hover:border-primary/50 hover:bg-primary/[0.04]">{p.label}</button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <Field label="SMTP server" required={Boolean(v.smtp_enabled)} error={tried && errors.smtp_host} className="sm:col-span-3"><input className={inputCls} value={v.smtp_host || ""} onChange={set("smtp_host")} placeholder="smtp.office365.com" autoComplete="off" /></Field>
            <Field label="Port" required={Boolean(v.smtp_enabled)} error={tried && errors.smtp_port} className="sm:col-span-1"><input className={inputCls} inputMode="numeric" value={v.smtp_port || ""} onChange={set("smtp_port")} /></Field>
            <Field label="Security" className="sm:col-span-2">
              <select className={inputCls} value={v.smtp_encryption || "starttls"} onChange={set("smtp_encryption")}>
                <option value="starttls">STARTTLS (port 587)</option>
                <option value="ssl">SSL / TLS (port 465)</option>
                <option value="none">None (internal relay only)</option>
              </select>
            </Field>
            <Field label="Username" className="sm:col-span-3" hint="Usually the full mailbox address; leave empty for an internal relay without login."><input className={inputCls} value={v.smtp_username || ""} onChange={set("smtp_username")} autoComplete="off" /></Field>
            <Field label="Password" className="sm:col-span-3" hint={settings.smtp_host ? "Leave empty to keep the saved password." : "Stored on the server only — never shown again."}>
              <input type="password" className={inputCls} value={v.smtp_password || ""} onChange={set("smtp_password")} placeholder={settings.smtp_host ? "••••••••  (unchanged)" : ""} autoComplete="new-password" />
            </Field>
            <Field label="Sender address" required={Boolean(v.smtp_enabled)} error={tried && errors.smtp_from_email} className="sm:col-span-3"><input className={inputCls} value={v.smtp_from_email || ""} onChange={set("smtp_from_email")} placeholder="noreply@ralga.gov.rw" /></Field>
            <Field label="Sender name" className="sm:col-span-3"><input className={inputCls} value={v.smtp_from_name || ""} onChange={set("smtp_from_name")} placeholder="RALGA IMS" /></Field>
            <Field label="Address of the system" error={tried && errors.app_url} hint="Used for the “Open in RALGA IMS” button in e-mails." className="sm:col-span-6"><input className={inputCls} value={v.app_url || ""} onChange={set("app_url")} placeholder="https://ims.ralga.gov.rw" /></Field>
          </div>
          <div className="flex justify-end"><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save e-mail settings"}</Button></div>
        </div>
      </Panel>

      <Panel title={<span className="flex items-center gap-2"><Send size={15} className="text-slate-400" /> Send a test e-mail</span>} subtitle="Uses the saved settings. Save first if you changed anything above.">
        <div className="flex flex-col gap-2 sm:flex-row">
          <input className={cn(inputCls, "sm:max-w-sm")} value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="name@ralga.gov.rw" aria-label="Send the test to" />
          <Button onClick={test} disabled={testing}><Send size={14} /> {testing ? "Sending…" : "Send test"}</Button>
        </div>
        {lastTest && (
          <p className={cn("mt-3 flex items-start gap-2 rounded-md border px-3 py-2 text-[12.5px]", lastTest.status === "sent" ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-red-200 bg-red-50 text-red-800")}>
            {lastTest.status === "sent" ? <CheckCircle2 size={14} className="mt-0.5 shrink-0" /> : <XCircle size={14} className="mt-0.5 shrink-0" />}
            {lastTest.status === "sent" ? "Delivered to the mail server. Check the inbox (and the spam folder the first time)." : `${lastTest.error || "Not sent."}`}
          </p>
        )}
      </Panel>

      <MailLog />
    </div>
  );
}

function MailLog() {
  const queryClient = useQueryClient();
  const [status, setStatus] = React.useState("");
  const [q, setQ] = React.useState("");
  const [page, setPage] = React.useState(1);
  const log = useQuery(["mail-log", status, q, page], () => pocketbase.send(`/api/ims/mail/log?${new URLSearchParams({ status, q, page: String(page) })}`, {}) as Promise<any>, { keepPreviousData: true });
  async function retry(id: string) {
    try {
      const r: any = await pocketbase.send(`/api/ims/mail/${id}/retry`, { method: "POST" });
      if (r.status === "sent") toast.success("Sent");
      else toast.error(r.error || "Not sent");
      queryClient.invalidateQueries(["mail-log"]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const d = log.data;
  return (
    <Panel title={<span className="flex items-center gap-2"><Mail size={15} className="text-slate-400" /> E-mail log</span>} subtitle="Every e-mail the system tried to send." bodyClassName="px-0">
      <div className="flex flex-wrap items-center gap-2 px-4 pb-3">
        {[["", "All"], ["sent", `Sent ${d ? `(${d.counts.sent})` : ""}`], ["failed", `Failed ${d ? `(${d.counts.failed})` : ""}`], ["skipped", `Not sent ${d ? `(${d.counts.skipped})` : ""}`]].map(([k, l]) => (
          <button key={k} type="button" onClick={() => { setStatus(k); setPage(1); }} className={cn("rounded-full px-3 py-1 text-[12.5px] font-medium", status === k ? "bg-ralga-navy text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200")}>{l}</button>
        ))}
        <label className="relative ml-auto">
          <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input className={cn(inputCls, "h-9 w-56 pl-8")} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} placeholder="Recipient or subject" />
        </label>
      </div>
      {d && !d.smtp_enabled && <p className="mx-4 mb-3 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">E-mail sending is off or not set up yet, so new messages are logged as “Not sent”.</p>}
      {log.isLoading ? <div className="px-4"><ListSkeleton rows={4} /></div> : !d?.items.length ? <EmptyState icon={Mail} text="No e-mail yet." /> : (
        <div className="overflow-x-auto">
          <table className="dnr-grid w-full min-w-[720px]">
            <thead><tr><th>When</th><th>To</th><th>Subject</th><th>Status</th><th className="w-20" /></tr></thead>
            <tbody>
              {d.items.map((m: any) => {
                const s = STATUS[m.status] || STATUS.queued;
                return (
                  <tr key={m.id}>
                    <td className="whitespace-nowrap text-[12.5px] text-slate-600">{new Date(String(m.created).replace(" ", "T")).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" })}</td>
                    <td className="text-[12.5px]">{m.to}</td>
                    <td className="max-w-[300px]"><span className="block truncate text-[13px]">{m.subject}</span>{m.error && <span className="block truncate text-[11.5px] text-slate-500" title={m.error}>{m.error}</span>}</td>
                    <td><Badge tone={s.tone}><s.icon size={12} className="mr-1 inline" />{s.label}</Badge></td>
                    <td className="text-right">{m.status !== "sent" && <button type="button" onClick={() => retry(m.id)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-medium text-primaryDark hover:bg-primary/[0.06]"><RefreshCw size={12} /> Retry</button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {d && d.totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 px-4 pt-3 text-[12.5px] text-slate-600">
          <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span>Page {d.page} of {d.totalPages}</span>
          <Button size="sm" variant="outline" disabled={page >= d.totalPages} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}
    </Panel>
  );
}
