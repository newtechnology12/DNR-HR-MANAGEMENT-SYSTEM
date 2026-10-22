/**
 * One action plan (employee portal): what will be done, progress, the department plan it contributes to,
 * staff contributions (department plans), time spent, documents and the reports written on it.
 */
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { CheckCircle2, ExternalLink, FilePlus2, Flag, Pencil, Play, Printer } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { cn } from "@/utils";
import { Attachments, Progress, useMe } from "@/components/portal/kit";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  DataTable,
  DetailHeader,
  Details,
  EmptyState,
  Field,
  MenuItem,
  Modal,
  MoreMenu,
  Num,
  Page,
  Person,
  Priority,
  Tabs,
  Textarea,
  TwoLine,
  fmtDate,
  fmtDateTime,
  overdue,
} from "@/components/ims";
import { PLAN_STATUS, REPORT_STATUS, isOverdue, reportTypeLabel, totalHours } from "./shared";

const BACK = "/dashboard/my/plans?tab=department";
type TabKey = "details" | "work" | "documents" | "reports";

export default function ActionPlanDetail() {
  const { planId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const [completing, setCompleting] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey>("details");

  const q = useQuery(["action-plan", planId], async () => {
    const plan: any = await pocketbase.collection("actionPlans").getOne(planId!, { expand: "staff_id,department_id,parent_plan,created_by" });
    const [children, reports] = await Promise.all([
      plan.scope === "department" ? pocketbase.collection("actionPlans").getFullList({ filter: `parent_plan = "${plan.id}"`, sort: "staff_id.name", expand: "staff_id" }) : Promise.resolve([]),
      pocketbase.collection("employeeReports").getFullList({ filter: `action_plan = "${plan.id}"`, sort: "-reportDate", expand: "employee" }),
    ]);
    return { plan, children, reports };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["action-plan", planId]);
    queryClient.invalidateQueries(["action-plans"]);
  };
  const quick = useMutation((data: Record<string, unknown>) => pocketbase.collection("actionPlans").update(planId!, data), {
    onSuccess: () => {
      toast.success("Plan updated");
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState icon={Flag} text="This plan is not available. It may have been removed, or it belongs to someone else." action={<ButtonLink to={BACK}>Back to plans</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { plan: p, children, reports } = q.data;
  const isDept = p.scope === "department";
  const isOwner = me.data?.id === p.staff_id || me.data?.id === p.created_by;
  const canEdit = isOwner || me.data?.hrScope === "all";
  const inDept = me.data?.department === p.department_id;
  const hours = Array.isArray(p.hoursPerDay) ? p.hoursPerDay : [];
  const progress = isDept && children.length ? Math.round(children.reduce((a: number, c: any) => a + (c.status === "completed" ? 100 : c.progress || 0), 0) / children.length) : p.status === "completed" ? 100 : p.progress || 0;
  const kind = isDept ? "Department plan" : p.parent_plan ? "Contribution to a department plan" : "Personal plan";
  const late = isOverdue(p) ? overdue(p.deadline) || "Overdue" : null;

  // the next step is the primary button; at most two secondary ones, the rest under "More"
  const primary =
    isOwner && !isDept && p.status !== "completed" ? <Button variant="primary" icon={CheckCircle2} onClick={() => setCompleting(true)}>Mark as completed</Button>
    : isDept && inDept && !isOwner ? <Button variant="primary" icon={Flag} onClick={() => navigate(`/dashboard/employee-portal/plans/new?parent=${p.id}`)}>Contribute to this plan</Button>
    : null;
  const secondary: MenuItem[] = [
    ...(isOwner && !isDept && p.status === "not_started" ? [{ label: "Start working", icon: Play, onSelect: () => quick.mutate({ status: "in_progress", progress: 10 }), disabled: quick.isLoading }] : []),
    ...(me.data?.id === p.staff_id && !isDept ? [{ label: "Write a report", icon: FilePlus2, onSelect: () => navigate(`/dashboard/employee-portal/reports/new?plan=${p.id}`) }] : []),
    ...(canEdit ? [{ label: "Edit", icon: Pencil, onSelect: () => navigate(`/dashboard/employee-portal/plans/${p.id}/edit`) }] : []),
  ];
  const more: MenuItem[] = [...secondary.slice(2), { label: "Print", icon: Printer, onSelect: () => window.print() }];

  const childColumns: Column<any>[] = [
    { key: "title", header: "Plan", className: "min-w-[220px]", cell: (c) => <TwoLine main={c.title} sub={`Due ${fmtDate(c.deadline)}`} /> },
    { key: "staff", header: "Staff", className: "min-w-[150px]", cell: (c) => <Person name={c.expand?.staff_id?.name} /> },
    { key: "status", header: "Status", nowrap: true, cell: (c) => <StatusBadge status={c.status} map={PLAN_STATUS} /> },
    { key: "progress", header: "Progress", className: "w-44", cell: (c) => <Progress value={c.status === "completed" ? 100 : c.progress || 0} /> },
  ];
  const hourColumns: Column<any>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (h) => fmtDate(h.date) },
    { key: "time", header: "From – to", nowrap: true, cell: (h) => <span className="tabular-nums">{h.startTime} – {h.endTime}</span> },
    { key: "note", header: "Note", clamp: true, cell: (h) => h.note || <span className="text-ims-faint">—</span> },
    { key: "hours", header: "Hours", numeric: true, cell: (h) => <Num value={h.hours} decimals />, total: <Num value={totalHours(hours)} decimals /> },
  ];
  const reportColumns: Column<any>[] = [
    { key: "title", header: "Report", className: "min-w-[220px]", cell: (r) => <span className="font-semibold">{r.title || `${reportTypeLabel(r.reportType)} report`}</span>, sub: (r) => reportTypeLabel(r.reportType) },
    { key: "author", header: "Author", className: "min-w-[150px]", cell: (r) => <Person name={r.expand?.employee?.name || r.employeeName} /> },
    { key: "date", header: "Date", nowrap: true, cell: (r) => fmtDate(r.reportDate) },
    { key: "status", header: "Status", nowrap: true, cell: (r) => <StatusBadge status={r.status || "submitted"} map={REPORT_STATUS} /> },
  ];
  const openReport = (r: any) => navigate(`/dashboard/employee-portal/reports/${r.id}`);

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to plans", to: BACK }}
        type={`${kind}${p.planType ? ` · ${p.planType[0].toUpperCase()}${p.planType.slice(1)}` : ""}`}
        status={PLAN_STATUS[p.status]?.label || p.status}
        statusNote={late || PLAN_STATUS[p.status]?.note}
        title={p.title}
        facts={[
          p.expand?.staff_id?.name ? { label: isDept ? "Recorded by" : "Staff", value: p.expand.staff_id.name } : null,
          p.expand?.department_id?.name,
          { label: "Period", value: `${fmtDate(p.start_date).replace(/ \d{4}$/, "")} – ${fmtDate(p.end_date)}` },
          p.deadline ? { label: "Deadline", value: fmtDate(p.deadline) } : null,
          p.priority ? <Priority key="priority" value={p.priority} /> : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary.slice(0, 2).map((s) => <Button key={s.label} icon={s.icon} onClick={s.onSelect} disabled={s.disabled}>{s.label}</Button>)}
            {primary}
          </>
        }
      />

      <Tabs
        label="Plan sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          isDept ? { key: "work", label: "Contributions", count: children.length } : { key: "work", label: "Time spent", count: hours.length },
          { key: "documents", label: "Documents", count: (p.files || []).length },
          { key: "reports", label: "Reports", count: reports.length },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card className="xl:col-span-2">
            <CardHeader title="Plan" />
            <Details
              items={[
                { label: "What will be done", value: p.task_description ? <span className="whitespace-pre-line">{p.task_description}</span> : null, wide: true },
                { label: "Expected output", value: p.expected_output },
                { label: "Delivered", value: p.completion_note },
                {
                  label: "Contributes to",
                  value: p.expand?.parent_plan ? <Link to={`/dashboard/employee-portal/plans/${p.parent_plan}`} className="font-semibold text-ims-link hover:underline">{p.expand.parent_plan.title}</Link> : null,
                },
                { label: "Recorded by", value: p.expand?.created_by?.name, hint: fmtDateTime(p.created) },
                { label: "Last updated", value: fmtDateTime(p.updated) },
              ]}
            />
          </Card>
          <Card>
            <CardHeader title="Progress" subtitle={isDept && children.length ? "Average of the staff contributions." : undefined} />
            <Progress value={progress} />
            {isOwner && !isDept && p.status === "in_progress" && (
              <div className="mt-3 flex flex-wrap gap-1.5 print:hidden" role="group" aria-label="Set progress">
                {[25, 50, 75].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-pressed={p.progress === n}
                    disabled={quick.isLoading}
                    onClick={() => quick.mutate({ progress: n })}
                    className={cn(
                      "h-8 rounded-pill border px-3 text-t-small font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
                      p.progress === n ? "border-ims-link bg-ims-info-bg text-ims-primary" : "border-ims-field text-ims-body hover:bg-ims-hover"
                    )}
                  >
                    {n}%
                  </button>
                ))}
              </div>
            )}
            {late && <p className="mt-3 text-t-small font-semibold text-ims-danger">The deadline was {fmtDate(p.deadline)}. {late}.</p>}
          </Card>
        </div>
      )}

      {tab === "work" && isDept && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
            <CardHeader title="Staff contributions" subtitle="Personal plans linked to this department plan." />
          </div>
          <DataTable
            columns={childColumns}
            rows={children as any[]}
            rowKey={(c) => c.id}
            onRowClick={(c) => navigate(`/dashboard/employee-portal/plans/${c.id}`)}
            rowActions={(c) => [{ label: "Open", icon: ExternalLink, onSelect: () => navigate(`/dashboard/employee-portal/plans/${c.id}`) }]}
            minWidth={640}
            caption="Staff contributions"
            empty={<EmptyState compact text="No one has linked a personal plan yet." />}
          />
        </Card>
      )}

      {tab === "work" && !isDept && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
            <CardHeader title="Time spent" subtitle={`${totalHours(hours)} h recorded`} />
          </div>
          <DataTable
            columns={hourColumns}
            rows={hours}
            rowKey={(_, i) => String(i)}
            minWidth={520}
            caption="Time spent"
            empty={<EmptyState compact text="No time recorded yet." action={canEdit ? <ButtonLink to={`/dashboard/employee-portal/plans/${p.id}/edit`} icon={Pencil}>Record time</ButtonLink> : undefined} />}
          />
        </Card>
      )}

      {tab === "documents" && (
        <Card>
          <CardHeader title="Documents" subtitle="Terms of reference, drafts and evidence attached to the plan." />
          <Attachments record={p} names={p.files || []} empty="No documents attached." />
        </Card>
      )}

      {tab === "reports" && (
        <Card padded={false} className="overflow-hidden">
          <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
            <CardHeader title="Reports on this plan" />
          </div>
          <DataTable
            columns={reportColumns}
            rows={reports as any[]}
            rowKey={(r) => r.id}
            onRowClick={openReport}
            rowActions={(r) => [{ label: "Open", icon: ExternalLink, onSelect: () => openReport(r) }]}
            minWidth={640}
            caption="Reports on this plan"
            empty={<EmptyState compact text="No report yet." />}
          />
        </Card>
      )}

      <CompleteDialog open={completing} onClose={() => setCompleting(false)} onConfirm={(note) => quick.mutateAsync({ status: "completed", progress: 100, completion_note: note }).then(() => setCompleting(false))} />
    </Page>
  );
}

function CompleteDialog({ open, onClose, onConfirm }: { open: boolean; onClose: () => void; onConfirm: (note: string) => Promise<unknown> }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Mark the plan as completed?"
      description="Say briefly what was delivered. You can then write a report for your supervisor."
      footer={
        <>
          <Button onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" icon={CheckCircle2} loading={busy} onClick={() => { setBusy(true); onConfirm(note).finally(() => setBusy(false)); }}>Mark as completed</Button>
        </>
      }
    >
      <Field label="What was delivered?" htmlFor="complete-note">
        <Textarea id="complete-note" rows={3} className="min-h-[90px]" value={note} onChange={(e) => setNote(e.target.value)} autoFocus />
      </Field>
    </Modal>
  );
}
