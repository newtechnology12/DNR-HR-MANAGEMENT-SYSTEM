/**
 * Settings → E-mail: the mail server the system sends notifications with (applied to the server's mailer
 * as soon as it is saved), a test e-mail with its result, and the log of every e-mail with retry.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { CheckCircle2, Mail, RefreshCw, Send, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import useSettings from "@/hooks/useSettings";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { ListSkeleton } from "@/components/enterprise/ui";
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  Column,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  Input,
  Pager,
  Select,
  StatusPill,
  Tabs,
  fmtDateTime,
} from "@/components/ims";
import { cn } from "@/utils";

const PRESETS = [
  { key: "office365", label: "Microsoft 365 / Outlook", host: "smtp.office365.com", port: "587", encryption: "starttls", note: "Use a mailbox licensed for SMTP AUTH (e.g. noreply@ralga.gov.rw)." },
  { key: "gmail", label: "Google Workspace / Gmail", host: "smtp.gmail.com", port: "587", encryption: "starttls", note: "Use an app password (Google account → Security → App passwords), not the normal password." },
  { key: "custom", label: "Other mail server", host: "", port: "587", encryption: "starttls", note: "Ask your ICT team for the SMTP host, port and account." },
];
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
/** Delivery states in the glossary words, with the detail as the note. */
const STATUS: Record<string, { word: string; note: string }> = {
  sent: { word: "Completed", note: "Sent" },
  failed: { word: "Rejected", note: "Failed" },
  skipped: { word: "Cancelled", note: "Not sent" },
  queued: { word: "In progress", note: "Queued" },
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
  const err = (k: string) => (tried && errors[k]) || null;

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

  if (!settings) return <Card as="div"><ListSkeleton rows={6} /></Card>;
  return (
    <div className="flex flex-col gap-4">
      <Card as="div">
        <CardHeader title="Mail server" subtitle="Approvals, reminders, payslips and alerts are e-mailed through this server. Saved settings apply at once, no restart needed." />
        <div className="space-y-4">
          <div className="rounded-control border border-ims-border bg-ims-thead px-3.5 py-3">
            <Checkbox
              id="smtp-enabled"
              label={<span className="font-semibold">Send e-mails</span>}
              hint="When off, notifications stay in the app and the log shows them as not sent. In-app notifications always work."
              checked={Boolean(v.smtp_enabled)}
              onChange={(c) => setV((x) => ({ ...x, smtp_enabled: c }))}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-t-small font-semibold text-ims-muted">Fill in for:</span>
            {PRESETS.map((p) => (
              <Button
                key={p.key}
                size="sm"
                onClick={() => {
                  setV((x) => ({ ...x, smtp_host: p.host || x.smtp_host, smtp_port: p.port, smtp_encryption: p.encryption }));
                  toast.info(p.note);
                }}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-6">
            <Field label="SMTP server" htmlFor="smtp-host" required={Boolean(v.smtp_enabled)} error={err("smtp_host")} className="sm:col-span-3">
              <Input id="smtp-host" value={v.smtp_host || ""} onChange={set("smtp_host")} placeholder="smtp.office365.com" autoComplete="off" invalid={Boolean(err("smtp_host"))} />
            </Field>
            <Field label="Port" htmlFor="smtp-port" required={Boolean(v.smtp_enabled)} error={err("smtp_port")} className="sm:col-span-1">
              <Input id="smtp-port" inputMode="numeric" value={v.smtp_port || ""} onChange={set("smtp_port")} invalid={Boolean(err("smtp_port"))} />
            </Field>
            <Field label="Security" htmlFor="smtp-security" className="sm:col-span-2">
              <Select id="smtp-security" value={v.smtp_encryption || "starttls"} onChange={set("smtp_encryption")}>
                <option value="starttls">STARTTLS (port 587)</option>
                <option value="ssl">SSL / TLS (port 465)</option>
                <option value="none">None (internal relay only)</option>
              </Select>
            </Field>
            <Field label="Username" htmlFor="smtp-user" className="sm:col-span-3" hint="Usually the full mailbox address; leave empty for an internal relay without login.">
              <Input id="smtp-user" value={v.smtp_username || ""} onChange={set("smtp_username")} autoComplete="off" />
            </Field>
            <Field label="Password" htmlFor="smtp-password" className="sm:col-span-3" hint={settings.smtp_host ? "Leave empty to keep the saved password." : "Stored on the server only — never shown again."}>
              <Input id="smtp-password" type="password" value={v.smtp_password || ""} onChange={set("smtp_password")} placeholder={settings.smtp_host ? "••••••••  (unchanged)" : ""} autoComplete="new-password" />
            </Field>
            <Field label="Sender address" htmlFor="smtp-from" required={Boolean(v.smtp_enabled)} error={err("smtp_from_email")} className="sm:col-span-3">
              <Input id="smtp-from" value={v.smtp_from_email || ""} onChange={set("smtp_from_email")} placeholder="noreply@ralga.gov.rw" invalid={Boolean(err("smtp_from_email"))} />
            </Field>
            <Field label="Sender name" htmlFor="smtp-from-name" className="sm:col-span-3">
              <Input id="smtp-from-name" value={v.smtp_from_name || ""} onChange={set("smtp_from_name")} placeholder="RALGA IMS" />
            </Field>
            <Field label="Address of the system" htmlFor="smtp-app-url" error={err("app_url")} hint="Used for the “Open in RALGA IMS” button in e-mails." className="sm:col-span-6">
              <Input id="smtp-app-url" value={v.app_url || ""} onChange={set("app_url")} placeholder="https://ims.ralga.gov.rw" invalid={Boolean(err("app_url"))} />
            </Field>
          </div>
          <div className="flex justify-end border-t border-ims-divider pt-4">
            <Button variant="primary" onClick={save} loading={busy}>Save e-mail settings</Button>
          </div>
        </div>
      </Card>

      <Card as="div">
        <CardHeader title="Send a test e-mail" subtitle="Uses the saved settings. Save first if you changed anything above." />
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <Field label="Send the test to" htmlFor="smtp-test-to" className="sm:w-[360px]">
            <Input id="smtp-test-to" type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="name@ralga.gov.rw" />
          </Field>
          <Button icon={Send} onClick={test} loading={testing}>{testing ? "Sending…" : "Send test"}</Button>
        </div>
        {lastTest && (
          <p role="status" className={cn("mt-3 flex items-start gap-2 rounded-control px-3.5 py-2.5 text-t-small", lastTest.status === "sent" ? "bg-ims-success-bg text-ims-success" : "bg-ims-danger-bg text-ims-danger")}>
            {lastTest.status === "sent" ? <CheckCircle2 size={15} className="mt-px shrink-0" aria-hidden /> : <XCircle size={15} className="mt-px shrink-0" aria-hidden />}
            {lastTest.status === "sent" ? "Delivered to the mail server. Check the inbox (and the spam folder the first time)." : `${lastTest.error || "Not sent."}`}
          </p>
        )}
      </Card>

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
      if (r.status === "sent") toast.success("E-mail sent");
      else toast.error(r.error || "The e-mail was not sent. Check the mail server settings and try again.");
      queryClient.invalidateQueries(["mail-log"]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const d = log.data;
  const columns: Column<any>[] = [
    { key: "when", header: "When", nowrap: true, cell: (m) => fmtDateTime(m.created) },
    { key: "to", header: "To", clamp: true, cell: (m) => m.to },
    { key: "subject", header: "Subject", clamp: true, cell: (m) => m.subject, sub: (m) => m.error || null },
    {
      key: "status",
      header: "Status",
      cell: (m) => {
        const s = STATUS[m.status] || STATUS.queued;
        return <StatusPill status={s.word} sub={s.note} />;
      },
    },
  ];
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader className="mb-2" title="E-mail log" subtitle="Every e-mail the system tried to send." />
      </div>
      <Tabs
        inset
        label="E-mail status"
        active={status || "all"}
        onChange={(k) => { setStatus(k === "all" ? "" : k); setPage(1); }}
        tabs={[
          { key: "all", label: "All" },
          { key: "sent", label: "Sent", count: d?.counts.sent },
          { key: "failed", label: "Failed", count: d?.counts.failed },
          { key: "skipped", label: "Not sent", count: d?.counts.skipped },
        ]}
      />
      <FilterBar search={{ value: q, onChange: (val) => { setQ(val); setPage(1); }, placeholder: "Search recipient or subject" }} />
      {d && !d.smtp_enabled && (
        <p className="mx-4 mb-3 rounded-control bg-ims-warning-bg px-3.5 py-2.5 text-t-small text-ims-warning sm:mx-5">E-mail sending is off or not set up yet, so new messages are logged as “Not sent”.</p>
      )}
      <DataTable
        columns={columns}
        rows={d?.items || []}
        rowKey={(m) => m.id}
        loading={log.isLoading}
        fetching={log.isFetching}
        error={log.isError ? log.error : undefined}
        onRetry={() => log.refetch()}
        minWidth={760}
        caption="E-mail log"
        rowActions={(m) => (m.status !== "sent" ? [{ label: "Retry", icon: RefreshCw, onSelect: () => retry(m.id) }] : [])}
        empty={<EmptyState icon={Mail} text={q || status ? "No e-mail matches. Change the search or choose another tab." : "No e-mail yet."} />}
        footer={d && d.totalItems > 0 ? <Pager page={d.page} perPage={d.perPage || 25} total={d.totalItems} onPage={setPage} /> : null}
      />
    </Card>
  );
}
