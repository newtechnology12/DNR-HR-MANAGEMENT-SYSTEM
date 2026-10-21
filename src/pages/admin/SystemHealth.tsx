/**
 * Administration → System health: API / database status, backup schedule and restore procedure,
 * e-mail delivery and locked accounts. Data comes from GET /api/ims/health.
 */
import { useQuery } from "react-query";
import { formatDistanceToNow } from "date-fns";
import { Activity, Archive, CheckCircle2, Database, Lock, Mail, RefreshCw, ServerCog, XCircle } from "lucide-react";
import { imsApi } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { Badge, ListSkeleton, MetricGroup, PageHeader, Panel } from "@/components/enterprise/ui";

export default function SystemHealth() {
  const q = useQuery(["system-health"], () => imsApi.health(), { refetchInterval: 30_000 });
  const h = q.data;
  const ok = h?.status === "ok";
  const d = h?.details;

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="System health"
        description="Live status of the API, database, backups and outgoing e-mail. Refreshes every 30 seconds."
        breadcrumbs={[{ title: "Administration", link: "#" }, { title: "System health", link: "/dashboard/admin/health" }]}
        actions={<Button variant="outline" onClick={() => q.refetch()} disabled={q.isFetching}><RefreshCw size={14} className={q.isFetching ? "animate-spin" : ""} /> Refresh</Button>}
      />
      {q.isLoading ? (
        <Panel><ListSkeleton rows={4} /></Panel>
      ) : (
        <>
          <div className={`flex items-center gap-3 rounded-lg border px-4 py-3 ${ok ? "border-emerald-200 bg-emerald-50 text-emerald-900" : "border-red-200 bg-red-50 text-red-900"}`}>
            {ok ? <CheckCircle2 size={20} className="text-emerald-600" /> : <XCircle size={20} className="text-red-600" />}
            <div>
              <p className="text-[14px] font-semibold">{ok ? "All systems operational" : "Service degraded"}</p>
              <p className="text-[12.5px] opacity-80">Checked {h?.time ? formatDistanceToNow(new Date(h.time), { addSuffix: true }) : "—"} · database answered in {h?.db_ms ?? "—"} ms</p>
            </div>
          </div>
          <MetricGroup
            title="Activity"
            icon={Activity}
            columns={4}
            metrics={[
              { label: "Active users", value: d?.users_active ?? "—" },
              { label: "Pending approvals", value: d?.pending_approvals ?? "—" },
              { label: "Locked accounts", value: d?.locked_accounts ?? "—", tone: d?.locked_accounts ? "danger" : "default" },
              { label: "Failed e-mails (7 days)", value: d?.emails_failed_7d ?? "—", tone: d?.emails_failed_7d ? "warning" : "default" },
            ]}
          />
          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title={<span className="flex items-center gap-2"><Archive size={15} className="text-slate-400" /> Backups</span>} subtitle="Automated database and file backups">
              <dl className="space-y-2 text-[13px]">
                <div className="flex justify-between"><dt className="text-slate-500">Schedule</dt><dd className="font-mono text-slate-800">{d?.backups.cron || "not scheduled"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Copies kept</dt><dd className="text-slate-800">{d?.backups.keep ?? "—"}</dd></div>
                <div className="flex justify-between"><dt className="text-slate-500">Off-site (S3) copy</dt><dd>{d?.backups.s3 ? <Badge tone="success">On</Badge> : <Badge tone="warning">Off — recommended</Badge>}</dd></div>
              </dl>
              <div className="mt-4 rounded-md bg-slate-50 p-3 text-[12.5px] leading-relaxed text-slate-600">
                <p className="mb-1 font-semibold text-slate-800">Restore procedure</p>
                <ol className="list-decimal space-y-0.5 pl-4">
                  <li>Open the server Admin UI → Settings → Backups.</li>
                  <li>Download the backup to keep a copy, then choose “Restore”.</li>
                  <li>The server restarts on the restored data; sign in and check the audit log.</li>
                </ol>
                <p className="mt-1">Full steps, including restoring on a new server, are in the README (Backup & restore).</p>
              </div>
            </Panel>
            <div className="space-y-4">
              <Panel title={<span className="flex items-center gap-2"><Mail size={15} className="text-slate-400" /> E-mail notifications</span>} subtitle="Approval requests and decisions are e-mailed when SMTP is configured">
                {d?.smtp_enabled ? <Badge tone="success">SMTP configured</Badge> : <Badge tone="warning">SMTP not configured — notifications are in-app only</Badge>}
                <p className="mt-2 text-[12.5px] text-slate-500">SMS is ready to plug in: every message is queued in the message log for an SMS gateway.</p>
              </Panel>
              <Panel title={<span className="flex items-center gap-2"><ServerCog size={15} className="text-slate-400" /> Monitoring endpoints</span>}>
                <ul className="space-y-1.5 text-[12.5px]">
                  <li className="flex items-center gap-2"><Database size={13} className="text-slate-400" /> <code className="rounded bg-slate-100 px-1.5 py-0.5">GET /api/health</code> — liveness (no sign-in)</li>
                  <li className="flex items-center gap-2"><Activity size={13} className="text-slate-400" /> <code className="rounded bg-slate-100 px-1.5 py-0.5">GET /api/ims/health</code> — database check, details for administrators</li>
                  <li className="flex items-center gap-2"><Lock size={13} className="text-slate-400" /> Logs never contain passwords or 2FA secrets.</li>
                </ul>
              </Panel>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
