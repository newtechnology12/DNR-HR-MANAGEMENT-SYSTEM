/**
 * Administration → System health: API / database status, backup schedule and restore procedure,
 * e-mail delivery and locked accounts. Data comes from GET /api/ims/health.
 */
import { useQuery } from "react-query";
import { Activity, AlertTriangle, CheckCircle2, Database, Lock, RefreshCw, XCircle } from "lucide-react";
import { imsApi } from "@/lib/ims";
import { ListSkeleton } from "@/components/enterprise/ui";
import { Card, CardHeader, Details, KpiBand, Page, PageHeader, fmtNumber, fmtWhen } from "@/components/ims";
import { cn } from "@/utils";

/** A setting that is on (green check) or off (amber warning with what to do). */
function OnOff({ on, onText, offText }: { on?: boolean; onText: string; offText: string }) {
  return on ? (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ims-success"><CheckCircle2 size={15} aria-hidden /> {onText}</span>
  ) : (
    <span className="inline-flex items-center gap-1.5 font-semibold text-ims-warning"><AlertTriangle size={15} aria-hidden /> {offText}</span>
  );
}

export default function SystemHealth() {
  const q = useQuery(["system-health"], () => imsApi.health(), { refetchInterval: 30_000 });
  const h = q.data;
  const ok = h?.status === "ok";
  const d = h?.details;

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Administration" }, { label: "System health" }]}
        title="System health"
        subtitle="Live status of the API, database, backups and outgoing e-mail. Refreshes every 30 seconds."
        secondary={[{ label: "Refresh", icon: RefreshCw, onClick: () => q.refetch(), loading: q.isFetching }]}
      />
      {q.isLoading ? (
        <Card><ListSkeleton rows={4} /></Card>
      ) : (
        <>
          <div role="status" className={cn("flex items-center gap-3 rounded-card border px-5 py-4", ok ? "border-ims-success/30 bg-ims-success-bg text-ims-success" : "border-ims-danger/30 bg-ims-danger-bg text-ims-danger")}>
            {ok ? <CheckCircle2 size={22} className="shrink-0" aria-hidden /> : <XCircle size={22} className="shrink-0" aria-hidden />}
            <div>
              <p className="text-t-body font-bold">{ok ? "All systems operational" : "Service degraded"}</p>
              <p className="text-t-small text-ims-body">Checked {h?.time ? fmtWhen(h.time) : "—"} · the database answered in {h?.db_ms ?? "—"} ms</p>
            </div>
          </div>
          <KpiBand
            items={[
              { label: "Active users", value: d ? fmtNumber(d.users_active) : "—" },
              { label: "Pending approvals", value: d ? fmtNumber(d.pending_approvals) : "—" },
              { label: "Locked accounts", value: d ? fmtNumber(d.locked_accounts) : "—", tone: d?.locked_accounts ? "danger" : "default", to: "/dashboard/admin/users" },
              { label: "Failed e-mails (7 days)", value: d ? fmtNumber(d.emails_failed_7d) : "—", tone: d?.emails_failed_7d ? "warning" : "default", to: "/dashboard/settings/general-settings/smtp" },
            ]}
          />
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2">
              <CardHeader title="Backups" subtitle="Automated database and file backups" />
              <Details
                columns={3}
                items={[
                  { label: "Schedule", value: d?.backups.cron ? <span className="font-mono text-t-small">{d.backups.cron}</span> : "Not scheduled" },
                  { label: "Copies kept", value: d?.backups.keep ?? "—" },
                  { label: "Off-site (S3) copy", value: <OnOff on={d?.backups.s3} onText="On" offText="Off · recommended" /> },
                ]}
              />
              <div className="mt-5 rounded-control bg-ims-thead px-4 py-3.5 text-t-body text-ims-body">
                <p className="mb-1.5 font-bold text-ims-text">Restore procedure</p>
                <ol className="list-decimal space-y-1 pl-5">
                  <li>Open the server Admin UI → Settings → Backups.</li>
                  <li>Download the backup to keep a copy, then choose “Restore”.</li>
                  <li>The server restarts on the restored data; sign in and check the audit log.</li>
                </ol>
                <p className="mt-2 text-t-small text-ims-muted">Full steps, including restoring on a new server, are in the README (Backup &amp; restore).</p>
              </div>
            </Card>
            <div className="flex flex-col gap-4">
              <Card>
                <CardHeader title="E-mail notifications" subtitle="Approval requests and decisions are e-mailed when SMTP is configured" link={{ label: "E-mail settings", to: "/dashboard/settings/general-settings/smtp" }} />
                <p className="text-t-body"><OnOff on={d?.smtp_enabled} onText="SMTP configured" offText="SMTP not configured · notifications are in-app only" /></p>
                <p className="mt-2 text-t-small text-ims-muted">SMS is ready to plug in: every message is queued in the message log for an SMS gateway.</p>
              </Card>
              <Card>
                <CardHeader title="Monitoring endpoints" />
                <ul className="space-y-2.5 text-t-body text-ims-body">
                  <li className="flex items-start gap-2"><Database size={15} className="mt-0.5 shrink-0 text-ims-muted" aria-hidden /> <span><code className="rounded-md bg-ims-subtle px-1.5 py-0.5 font-mono text-t-small text-ims-text">GET /api/health</code> — liveness (no sign-in)</span></li>
                  <li className="flex items-start gap-2"><Activity size={15} className="mt-0.5 shrink-0 text-ims-muted" aria-hidden /> <span><code className="rounded-md bg-ims-subtle px-1.5 py-0.5 font-mono text-t-small text-ims-text">GET /api/ims/health</code> — database check, details for administrators</span></li>
                  <li className="flex items-start gap-2"><Lock size={15} className="mt-0.5 shrink-0 text-ims-muted" aria-hidden /> <span>Logs never contain passwords or 2FA secrets.</span></li>
                </ul>
              </Card>
            </div>
          </div>
        </>
      )}
    </Page>
  );
}
