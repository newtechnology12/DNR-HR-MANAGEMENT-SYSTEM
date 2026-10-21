/**
 * One work plan: where it comes from (own, assigned, cascaded), its period, the plan it carries out and its
 * health (achievement against the time passed); the activities with their progress and quantities; issues
 * and risks; the supervisor's approval and assessment; the report; evidence and history. The owner records
 * progress and reports; the supervisor approves, assesses and can plan the next level down. A department
 * plan shows what the staff results add up to.
 */
import * as React from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, Check, CheckCircle2, Copy, GitBranch, Pencil, Plus, RotateCcw, Send, Star, Undo2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import {
  HEALTH, ITEM_STATUS, PRIORITY, PlanIssue, PlanKind, RATING, SEVERITY, TYPE_INFO, WEEKDAYS, expectedOf, healthOf, numberIn, originOf, plansApi, qty, statusOf,
} from "@/lib/plans";
import { Skeleton } from "@/components/ui/skeleton";
import { Chatter, toChatter } from "@/components/enterprise/DocumentLayout";
import { useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, inputCls, textareaCls } from "@/components/portal/kit";
import { MyHeader, Pill, WCard, WHead, btnOutline, btnPrimary, money, myPage, toDate } from "@/components/workspace/WorkspaceKit";
import { remainingTone, teamText } from "@/components/workspace/DepartmentActivities";
import { cn } from "@/utils";

const STEPS = [["draft", "Draft"], ["submitted", "Approval"], ["approved", "In progress"], ["reported", "Report"], ["assessed", "Assessed"]];
const stepIndex = (s: string) => (s === "returned" ? 0 : Math.max(0, STEPS.findIndex(([k]) => k === s)));
const when = (v?: string) => (toDate(v) ? format(toDate(v) as Date, "d MMM yyyy") : "");
const today = () => format(new Date(), "yyyy-MM-dd");

export function Stars({ value, size = 15 }: { value: number; size?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${value} of 5 — ${RATING[value] || ""}`}>
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={size} className={i <= value ? "fill-[#F2B544] text-[#F2B544]" : "text-[#D5DBE5]"} aria-hidden />)}
    </span>
  );
}

/** Days before the end of the period when the report becomes the main action. */
const REPORT_WINDOW_DAYS: Record<PlanKind, number> = { weekly: 1, monthly: 5, department: 5, quarterly: 10, annual: 30, task: 2 };
const NEXT_LEVEL: Partial<Record<PlanKind, string>> = { annual: "Plan a quarter", quarterly: "Plan a month", monthly: "Plan a week" };

export default function PlanDetail() {
  const { planId } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { user }: any = useAuth();
  const uid: string = user?.id || "";
  const q = useQuery(["work-plan", planId], () => pocketbase.collection("work_plans").getOne(planId!, { expand: "staff,supervisor,approved_by,assessed_by,parent,department,assigned_by,assigned_by.designation" }));
  const ref = useQuery(["plan-names"], async () => ({
    objectives: Object.fromEntries((await pocketbase.collection("strategic_objectives").getFullList({ fields: "id,code,name" })).map((o: any) => [o.id, o])),
  }));
  const p0: any = q.data;
  // the department activities this plan's items contribute to (codes and titles)
  const deptIds = Array.from(new Set(((p0?.items || []) as any[]).map((i) => i.department_plan).filter(Boolean))) as string[];
  const depts = useQuery(["plan-dept-refs", deptIds.join()], async () => {
    const rows = await pocketbase.collection("work_plans").getFullList({ filter: deptIds.map((id) => `id = "${id}"`).join(" || "), fields: "id,number,items" });
    const out: Record<string, any> = {};
    for (const r of rows as any[]) for (const i of r.items || []) out[`${r.id}:${i.id}`] = { ...i, plan: r.number };
    return out;
  }, { enabled: deptIds.length > 0 });
  const trail = useApprovalTrail("work_plan", "work_plans", planId);
  const [items, setItems] = React.useState<any[]>([]);
  const [dirty, setDirty] = React.useState(false);
  const [dialog, setDialog] = React.useState<"" | "review" | "report" | "assess">("");
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (q.data) {
      setItems(((q.data as any).items || []).map((i: any) => ({ ...i })));
      setDirty(false);
    }
  }, [q.data]);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };

  const p: any = q.data;
  const type = (p?.plan_type || "weekly") as PlanKind;
  const mine = Boolean(p) && p.staff === uid;
  const supervisor = Boolean(p) && (p.supervisor || p.approved_by) === uid && !mine;
  const canProgress = mine && p?.status === "approved" && type !== "department";
  const canReport = mine && p?.status === "approved";

  // "Submit report" from the plans list opens the report straight away
  React.useEffect(() => {
    if (params.get("report") === "1" && canReport) {
      setDialog("report");
      setParams({}, { replace: true });
    }
  }, [canReport]); // eslint-disable-line react-hooks/exhaustive-deps

  if (q.isLoading) return <div className={myPage}><Skeleton className="h-96 w-full" /></div>;
  if (!p) return <div className={myPage}><p className="text-[14px] text-[#5B6577]">Plan not found, or not one you can see.</p></div>;
  const info = TYPE_INFO[type];
  const reportDue = Date.now() >= new Date(String(p.period_end).replace(" ", "T")).getTime() - REPORT_WINDOW_DAYS[type] * 86_400_000;
  const idx = stepIndex(p.status);
  const health = healthOf(p);
  const expected = expectedOf(p);
  const origin = originOf(p);
  const st = statusOf(p);
  const canCascade = Boolean(NEXT_LEVEL[type]) && (mine || supervisor) && ["approved", "reported", "assessed"].includes(p.status);
  const deptItem = (it: any) => (it.department_plan && it.department_activity ? depts.data?.[`${it.department_plan}:${it.department_activity}`] : undefined);

  async function act(action: "submit" | "progress" | "copy" | "cascade", body: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const r = await plansApi.act(p.id, action, body);
      if (action === "copy" || action === "cascade") {
        toast.success(action === "copy" ? `${r.number} started for the next period` : `${r.number} prepared — complete it and send it`);
        navigate(mine ? `/dashboard/my/plans/${r.id}/edit` : `/dashboard/my/plans/${r.id}`);
      } else {
        toast.success(action === "submit" ? (r.status === "approved" ? "Saved and approved" : "Sent to your supervisor") : `Progress saved · ${r.progress}%`);
        refresh();
      }
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const setItem = (i: number, patch: Record<string, any>) => {
    setItems((xs) => xs.map((x, j) => {
      if (j !== i) return x;
      const n = { ...x, ...patch };
      if (patch.actual !== undefined) {
        const t = numberIn(n.target);
        if (n.actual !== null && t) n.progress = Math.min(100, Math.round((Number(n.actual) / t) * 100));
        if (n.progress > 0 && n.status === "not_started") n.status = "in_progress";
      }
      if (n.status === "done") n.progress = 100;
      return n;
    }));
    setDirty(true);
  };

  const doExport = (formatKind: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: `${p.plan_type === "task" ? p.title : info.label} — ${p.expand?.staff?.name || ""}`,
      subtitle: `${p.number} · ${p.period_label} · ${st.label}${p.expand?.supervisor ? ` · supervisor ${p.expand.supervisor.name}` : ""}${p.approved_at ? ` · approved ${when(p.approved_at)}` : ""}${p.focus ? ` · focus: ${p.focus}` : ""} · ${p.progress}% achieved`,
      rows: items, format: formatKind, what: `work_plan:${p.number}`, orientation: "landscape",
      totals: ["Weight %", "Cost (RWF)"].filter((h) => (h === "Weight %" ? items.some((i) => i.weight) : items.some((i) => i.cost))),
      columns: [
        ...(type === "department" ? [{ header: "Code", value: (i: any) => i.code, width: 8 }] : []),
        { header: info.item, value: (i: any) => i.title, width: 34 },
        { header: type === "annual" ? "Key result" : "Expected output", value: (i: any) => i.output, width: 24 },
        { header: "Indicator", value: (i: any) => i.indicator, width: 22 },
        { header: "Unit", value: (i: any) => i.unit, width: 10 },
        ...(type === "annual" || type === "quarterly" ? [{ header: "Baseline", value: (i: any) => i.baseline, width: 10 }] : []),
        { header: "Target", value: (i: any) => i.target, width: 10 },
        ...(items.some((i) => i.actual !== null && i.actual !== undefined) ? [{ header: "Achieved", value: (i: any) => i.actual ?? null, format: "number" as const, width: 10 }] : []),
        ...(items.some((i) => i.weight) ? [{ header: "Weight %", value: (i: any) => i.weight || null, format: "number" as const, width: 9 }] : []),
        ...(type === "annual" ? [{ header: "Quarters", value: (i: any) => (i.quarters || []).map((x: number) => `Q${x}`).join(" "), width: 10 }] : []),
        ...(type === "weekly" ? [{ header: "Days", value: (i: any) => (i.days || []).map((d: string) => WEEKDAYS.find(([k]) => k === d)?.[1]).join(" "), width: 14 }] : []),
        ...(items.some((i) => i.due) ? [{ header: "Due", value: (i: any) => i.due, format: "date" as const, width: 11 }] : []),
        { header: "Evidence", value: (i: any) => i.verification, width: 16 },
        ...(items.some((i) => i.cost) ? [{ header: "Cost (RWF)", value: (i: any) => i.cost || null, format: "money" as const, width: 13 }] : []),
        ...(type === "department" ? [{ header: "People contributing", value: (i: any) => i.team || 0, format: "number" as const, width: 10 }] : []),
        { header: "Status", value: (i: any) => ITEM_STATUS[i.status]?.label || i.status, width: 12 },
        { header: "Progress %", value: (i: any) => i.progress, format: "number" as const, width: 9 },
        { header: "Achieved / reason", value: (i: any) => i.achieved, width: 28 },
      ],
    });

  return (
    <main className={myPage}>
      <div className="text-[13px] text-[#5B6577]"><Link to={mine ? "/dashboard/my/plans" : "/dashboard/my/plans?tab=team"} className="font-semibold text-[#1466C0] hover:underline">My plans & reports</Link> · {p.number}</div>
      <MyHeader
        title={type === "task" ? p.title : `${info.label} · ${p.period_label}`}
        subtitle={
          <span>
            {[
              !mine ? (type === "department" ? p.expand?.department?.name : `Plan of ${p.expand?.staff?.name || "a staff member"}${p.expand?.department ? ` · ${p.expand.department.name}` : ""}`) : "",
              type === "task" ? `${info.label} · ${p.period_label}` : p.focus || "",
            ].filter(Boolean).join(" · ")}
            {(!mine || type === "task" || p.focus) && " · "}
            <span className={origin.assigned ? "font-semibold text-[#6B2FA3]" : ""}>{origin.text}</span>
          </span>
        }
        actions={
          <>
            <ExportMenu onExport={doExport} />
            {mine && ["draft", "returned"].includes(p.status) && <button type="button" className={btnOutline} onClick={() => navigate(`/dashboard/my/plans/${p.id}/edit`)}><Pencil size={15} /> Edit</button>}
            {mine && ["draft", "returned"].includes(p.status) && <button type="button" disabled={busy} className={btnPrimary} onClick={() => act("submit")}><Send size={15} /> Send to my supervisor</button>}
            {mine && type !== "task" && <button type="button" disabled={busy} className={btnOutline} onClick={() => act("copy")} title="Start the next period's plan with the activities still open"><Copy size={15} /> Next {info.short.toLowerCase()}</button>}
            {canCascade && <button type="button" disabled={busy} className={btnOutline} onClick={() => act("cascade", { date: today() })} title="Prepare the next level down from this plan"><GitBranch size={15} /> {NEXT_LEVEL[type]}</button>}
            {canReport && <button type="button" className={reportDue ? btnPrimary : btnOutline} onClick={() => setDialog("report")} title={reportDue ? undefined : "Usually written at the end of the period"}><Check size={15} /> Write the report</button>}
            {supervisor && p.status === "submitted" && <button type="button" className={btnPrimary} onClick={() => setDialog("review")}>Approve or return</button>}
            {supervisor && p.status === "reported" && <button type="button" className={btnPrimary} onClick={() => setDialog("assess")}><Star size={15} /> Assess</button>}
          </>
        }
      />

      <ol className="flex overflow-x-auto rounded-xl border border-[#E3E8EF] bg-white p-1" aria-label="Plan status">
        {STEPS.map(([k, l], i) => (
          <li key={k} aria-current={i === idx ? "step" : undefined} className={cn("flex flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-[12.5px] font-bold", i === idx ? "bg-[#0B3A6F] text-white" : i < idx ? "text-[#0F6B3A]" : "text-[#5B6577]")}>
            {i < idx && <Check size={13} aria-hidden />} {l}
          </li>
        ))}
      </ol>

      <div className="grid gap-[18px] min-[1500px]:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-[18px]">
          <WCard>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <dl className="grid flex-1 grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-x-6 gap-y-3 text-[13px]">
                <div><dt className="text-[#5B6577]">Status</dt><dd className="mt-0.5"><Pill tone={st.tone}>{st.label}</Pill></dd></div>
                <div><dt className="text-[#5B6577]">Supervisor</dt><dd className="font-semibold">{p.expand?.supervisor?.name || p.expand?.approved_by?.name || "Assigned when sent"}</dd></div>
                <div><dt className="text-[#5B6577]">Contributes to</dt><dd className="font-semibold">{p.expand?.parent ? <Link className="text-[#1466C0] hover:underline" to={`/dashboard/my/plans/${p.parent}`}>{TYPE_INFO[p.expand.parent.plan_type as PlanKind]?.label} · {String(p.expand.parent.period_label).split(" · ")[0]}</Link> : "—"}</dd></div>
                <div><dt className="text-[#5B6577]">Dates</dt><dd className="font-semibold">{p.approved_at ? `Approved ${when(p.approved_at)}` : p.submitted_at ? `Sent ${when(p.submitted_at)}` : `Created ${when(p.created)}`}</dd></div>
                {p.origin === "assigned" && (
                  <div className="col-span-2"><dt className="text-[#5B6577]">Assigned by</dt><dd className="font-semibold">{p.expand?.assigned_by?.name || "—"}{p.expand?.assigned_by?.expand?.designation?.name ? `, ${p.expand.assigned_by.expand.designation.name}` : ""}{p.source ? ` · ${p.source}` : ""}</dd></div>
                )}
                {type === "department" && <div className="col-span-2"><dt className="text-[#5B6577]">How it is measured</dt><dd className="font-semibold">From the staff plans that contribute to each activity</dd></div>}
              </dl>
              <div className="w-full sm:w-60">
                <div className="flex items-baseline justify-between"><span className="text-[12.5px] font-semibold text-[#5B6577]">Achieved</span><span className="text-[24px] font-extrabold tabular-nums">{p.progress}%</span></div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-[#EEF1F5]"><div className="h-full rounded-full" style={{ width: `${p.progress}%`, background: HEALTH[health].bar }} /></div>
                <p className="mt-1.5 flex items-center justify-between gap-2 text-[12.5px] text-[#5B6577]">
                  <span>Expected by today: <b className="text-[#14213D]">{expected}%</b></span>
                  <Pill tone={HEALTH[health].tone}>{HEALTH[health].label}</Pill>
                </p>
              </div>
            </div>
            {p.review_comment && (
              <p className={cn("mt-3 rounded-lg px-3 py-2 text-[13px]", p.status === "returned" ? "bg-[#FDE8E7] text-[#B42318]" : "bg-[#F8FAFC] text-[#36435A]")}>
                <b>{p.status === "returned" ? "Returned by your supervisor: " : p.origin === "assigned" ? "Instructions: " : "Supervisor: "}</b>{p.review_comment}
              </p>
            )}
          </WCard>

          <WCard flush className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDF0F5] px-5 py-3.5">
              <WHead title={info.items} subtitle={type === "department" ? "Targets, what the staff results add up to, and what remains" : canProgress ? "Update the status and progress as you go; enter quantities achieved where there is a numeric target." : `${items.length} ${items.length === 1 ? info.item.toLowerCase() : info.items.toLowerCase()}`} />
              {canProgress && <button type="button" disabled={!dirty || busy} className={btnPrimary} onClick={() => act("progress", { items: items.map((i) => ({ id: i.id, status: i.status, progress: i.progress, actual: i.actual ?? null, achieved: i.achieved, comment: i.comment })) })}>Save progress</button>}
            </div>
            <ol className="divide-y divide-[#EDF0F5]">
              {items.map((it, i) => {
                const da = deptItem(it);
                const target = numberIn(it.target);
                return (
                  <li key={it.id || i} className="grid gap-3 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_320px]">
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold">
                        <span>{type === "department" && it.code ? `${it.code} · ` : `${i + 1}. `}{it.title}</span>
                        {da && <span className="rounded-full bg-[#F1EAFB] px-2 py-0.5 text-[12px] font-bold text-[#6B2FA3]">Contributes to {da.code}</span>}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-[#5B6577]">
                        {it.output && <span>{type === "annual" ? "Key result" : "Output"}: <b className="text-[#36435A]">{it.output}</b></span>}
                        {it.indicator && <span>Indicator: <b className="text-[#36435A]">{it.indicator}</b></span>}
                        {(it.baseline || it.target) && <span>{it.baseline ? <>Baseline <b className="text-[#36435A]">{it.baseline}</b> → </> : null}target <b className="text-[#36435A]">{target !== null ? qty(target, it.unit) : it.target || "—"}</b></span>}
                        {it.weight > 0 && <span>Weight <b className="text-[#36435A]">{it.weight}%</b>{it.quarters?.length ? ` · ${it.quarters.map((x: number) => `Q${x}`).join(" ")}` : ""}</span>}
                        {type === "weekly" && it.days?.length > 0 && <span>{it.days.map((d: string) => WEEKDAYS.find(([k]) => k === d)?.[1]).join(" · ")}</span>}
                        {it.due && <span>Due <b className="text-[#36435A]">{when(it.due)}</b></span>}
                        {it.cost > 0 && <span>Cost <b className="text-[#36435A]">{money(it.cost)}</b></span>}
                        {it.priority && it.priority !== "medium" && <span>Priority {PRIORITY[it.priority] || it.priority}</span>}
                        {it.verification && <span>Evidence: {it.verification}</span>}
                        {it.objective && ref.data?.objectives[it.objective] && <span className="rounded bg-[#EAF2FC] px-1.5 text-[#0B3A6F]">{ref.data.objectives[it.objective].code} {ref.data.objectives[it.objective].name}</span>}
                      </div>
                      {!canProgress && it.achieved && <p className="mt-1.5 text-[13px] text-[#36435A]"><b>Achieved:</b> {it.achieved}</p>}
                    </div>
                    {type === "department" ? (
                      <div className="grid grid-cols-3 items-start gap-2 text-right text-[12.5px]">
                        <div><div className="text-[#5B6577]">Achieved</div><div className="text-[14px] font-extrabold">{target !== null ? qty(it.actual ?? 0, it.unit) : `${it.progress}%`}</div></div>
                        <div><div className="text-[#5B6577]">Remaining</div><div className={cn("text-[14px] font-extrabold", remainingTone(it.progress))}>{it.progress >= 100 ? "Done" : target !== null ? qty(Math.max(0, target - (it.actual || 0)), it.unit) : `${100 - it.progress}%`}</div></div>
                        <div><div className="text-[#5B6577]">Team</div><div className="text-[14px] font-extrabold">{teamText(it.team || 0, false)}</div></div>
                        <div className="col-span-3 mt-1 flex items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF1F5]"><div className="h-full rounded-full bg-[#1466C0]" style={{ width: `${it.progress}%` }} /></div><b className="w-10 tabular-nums">{it.progress}%</b></div>
                      </div>
                    ) : canProgress ? (
                      <div className="grid grid-cols-[1fr_84px] gap-2">
                        <select aria-label={`Status of ${it.title}`} className={cn(inputCls, "h-9")} value={it.status} onChange={(e) => setItem(i, { status: e.target.value })}>
                          {Object.entries(ITEM_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                        </select>
                        <div className="relative">
                          <input aria-label={`Progress percent of ${it.title}`} type="number" min={0} max={100} className={cn(inputCls, "h-9 pr-6 text-right")} value={it.progress} onChange={(e) => setItem(i, { progress: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                          <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[12px] text-[#5B6577]">%</span>
                        </div>
                        {target !== null && (
                          <label className="col-span-2 flex items-center gap-2 text-[12.5px] text-[#5B6577]">
                            Achieved
                            <input aria-label={`Quantity achieved of ${it.title}`} type="number" min={0} className={cn(inputCls, "h-9 w-24 text-right")} value={it.actual ?? ""} onChange={(e) => setItem(i, { actual: e.target.value === "" ? null : Math.max(0, Number(e.target.value) || 0) })} />
                            of <b className="text-[#14213D]">{qty(target, it.unit)}</b>
                          </label>
                        )}
                        <input aria-label={`Achieved or reason for ${it.title}`} className={cn(inputCls, "col-span-2 h-9")} value={it.achieved} placeholder="Achieved / reason if not done" onChange={(e) => setItem(i, { achieved: e.target.value })} />
                      </div>
                    ) : (
                      <div className="flex items-start justify-end gap-3">
                        <Pill tone={ITEM_STATUS[it.status]?.tone}>{ITEM_STATUS[it.status]?.label}</Pill>
                        <div className="w-28">
                          <div className="text-right text-[13px] font-bold tabular-nums">{it.progress}%{target !== null && it.actual !== null && it.actual !== undefined ? <span className="block text-[11.5px] font-semibold text-[#5B6577]">{qty(it.actual, it.unit)} of {qty(target, it.unit)}</span> : null}</div>
                          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[#EEF1F5]"><div className="h-full rounded-full bg-[#1466C0]" style={{ width: `${it.progress}%` }} /></div>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ol>
          </WCard>

          <IssuesCard plan={p} items={items} canManage={mine || supervisor || p.assigned_by === uid} onChange={refresh} />

          {(p.status === "reported" || p.status === "assessed") && (
            <WCard className="flex flex-col gap-3">
              <WHead title="Report" subtitle={`Written ${when(p.reported_at)}`} right={p.self_rating ? <span className="text-[12.5px] text-[#5B6577]">Self-rating <Stars value={p.self_rating} /></span> : undefined} />
              <p className="whitespace-pre-line text-[14px] text-[#14213D]">{p.report_summary}</p>
              <div className="grid gap-3 md:grid-cols-3">
                {[["Challenges", p.challenges], ["Next steps", p.next_steps], ["Support needed", p.support_needed]].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-[#F8FAFC] px-3 py-2"><p className="text-[12px] font-bold text-[#5B6577]">{k}</p><p className="whitespace-pre-line text-[13px]">{v}</p></div>
                ))}
              </div>
              {p.status === "assessed" && (
                <div className="rounded-xl border border-[#BFE3CB] bg-[#F3FBF6] px-4 py-3">
                  <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-bold text-[#0F6B3A]">Assessment by {p.expand?.assessed_by?.name || "the supervisor"} · <Stars value={p.supervisor_rating} /> {RATING[p.supervisor_rating]}</p>
                  <p className="mt-1 whitespace-pre-line text-[13.5px] text-[#14213D]">{p.supervisor_feedback}</p>
                </div>
              )}
            </WCard>
          )}
          {p.status === "approved" && p.supervisor_feedback && <p className="rounded-lg bg-[#FFF8E6] px-3 py-2 text-[13px] text-[#6B4A00]"><b>Report sent back:</b> {p.supervisor_feedback}</p>}

          <WCard>
            <WHead title="Evidence and documents" subtitle="Means of verification: attendance lists, reports, photos, mission orders" />
            <div className="mt-3"><DocumentUploads collection="work_plans" record={p} canAdd={mine} canRemove={mine && ["draft", "returned", "approved"].includes(p.status)} onChange={refresh} hint="Evidence of what was achieved" /></div>
          </WCard>
        </div>
        <aside className="min-w-0"><Chatter items={toChatter(trail.actions, trail.audit)} title="History" /></aside>
      </div>

      {dialog === "review" && <ReviewDialog plan={p} onClose={() => setDialog("")} onDone={() => { setDialog(""); refresh(); }} />}
      {dialog === "assess" && <AssessDialog plan={p} onClose={() => setDialog("")} onDone={() => { setDialog(""); refresh(); }} />}
      {dialog === "report" && <ReportDialog plan={p} items={items} onClose={() => setDialog("")} onDone={() => { setDialog(""); refresh(); }} />}
    </main>
  );
}

// ------------------------------------------------------------------ issues
function IssuesCard({ plan, items, canManage, onChange }: { plan: any; items: any[]; canManage: boolean; onChange: () => void }) {
  const issues = ((plan.issues || []) as PlanIssue[]).slice().sort((a, b) => (a.status === b.status ? String(b.raised_at).localeCompare(String(a.raised_at)) : a.status === "open" ? -1 : 1));
  const [adding, setAdding] = React.useState(false);
  const [form, setForm] = React.useState({ title: "", detail: "", severity: "medium", item: "" });
  const [resolving, setResolving] = React.useState<PlanIssue | null>(null);
  const [resolution, setResolution] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const canAdd = canManage && ["submitted", "approved", "returned", "reported"].includes(plan.status);
  const open = issues.filter((i) => i.status === "open").length;

  async function send(body: Record<string, unknown>, done: string) {
    setBusy(true);
    try {
      await plansApi.act(plan.id, "issues", body);
      toast.success(done);
      onChange();
      return true;
    } catch (e) {
      toast.error(errorMessage(e));
      return false;
    } finally {
      setBusy(false);
    }
  }

  return (
    <WCard flush className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#EDF0F5] px-5 py-3.5">
        <WHead title="Issues and risks" subtitle={open ? `${open} open — raised so the supervisor can help in time` : "Problems that could stop the plan; your supervisor is told when one is raised"} />
        {canAdd && !adding && <button type="button" className={btnOutline} onClick={() => setAdding(true)}><Plus size={15} /> Raise an issue</button>}
      </div>
      {adding && (
        <div className="grid gap-3 border-b border-[#EDF0F5] bg-[#F8FAFC] px-5 py-4 md:grid-cols-12">
          <Field label="Issue" required className="md:col-span-6"><input className={inputCls} value={form.title} maxLength={160} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="e.g. Venue not confirmed by Rulindo district" /></Field>
          <Field label="Severity" className="md:col-span-2">
            <select className={inputCls} value={form.severity} onChange={(e) => setForm({ ...form, severity: e.target.value })}>
              {Object.entries(SEVERITY).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
            </select>
          </Field>
          <Field label="Activity concerned" className="md:col-span-4">
            <select className={inputCls} value={form.item} onChange={(e) => setForm({ ...form, item: e.target.value })}>
              <option value="">The whole plan</option>
              {items.map((i) => <option key={i.id} value={i.id}>{i.code ? `${i.code} · ` : ""}{i.title}</option>)}
            </select>
          </Field>
          <Field label="Details" className="md:col-span-12"><textarea className={cn(textareaCls, "min-h-[64px]")} value={form.detail} maxLength={1000} onChange={(e) => setForm({ ...form, detail: e.target.value })} placeholder="What happened, what it affects, what help is needed" /></Field>
          <div className="flex justify-end gap-2 md:col-span-12">
            <button type="button" className={btnOutline} onClick={() => setAdding(false)}>Cancel</button>
            <button type="button" disabled={busy || form.title.trim().length < 5} className={btnPrimary} onClick={async () => {
              if (await send({ action: "add", ...form, title: form.title.trim(), detail: form.detail.trim() }, "Issue raised")) {
                setAdding(false);
                setForm({ title: "", detail: "", severity: "medium", item: "" });
              }
            }}><AlertTriangle size={15} /> Raise the issue</button>
          </div>
        </div>
      )}
      {!issues.length ? (
        <p className="px-5 py-5 text-[13.5px] text-[#5B6577]">No issue raised.</p>
      ) : (
        <ul className="divide-y divide-[#EDF0F5]">
          {issues.map((x) => {
            const item = items.find((i) => i.id === x.item);
            return (
              <li key={x.id} className="flex flex-wrap items-start gap-3 px-5 py-3.5">
                {x.status === "open" ? <AlertTriangle size={17} className={cn("mt-0.5 shrink-0", x.severity === "high" ? "text-[#B42318]" : "text-[#9A6300]")} aria-hidden /> : <CheckCircle2 size={17} className="mt-0.5 shrink-0 text-[#0F6B3A]" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 text-[14px] font-bold">{x.title} <Pill tone={x.status === "open" ? SEVERITY[x.severity]?.tone : "approved"}>{x.status === "open" ? `${SEVERITY[x.severity]?.label} · open` : "Resolved"}</Pill></p>
                  <p className="text-[12.5px] text-[#5B6577]">Raised by {x.raised_by_name} · {when(x.raised_at)}{item ? ` · ${item.title}` : ""}</p>
                  {x.detail && <p className="mt-1 whitespace-pre-line text-[13px] text-[#36435A]">{x.detail}</p>}
                  {x.status === "resolved" && <p className="mt-1 text-[13px] text-[#0F6B3A]"><b>Resolved</b> by {x.resolved_by_name} · {when(x.resolved_at)}: {x.resolution}</p>}
                </div>
                {canManage && (x.status === "open" ? (
                  <button type="button" className={cn(btnOutline, "h-9")} onClick={() => { setResolving(x); setResolution(""); }}><Check size={14} /> Resolve</button>
                ) : (
                  <button type="button" disabled={busy} className="inline-flex h-9 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-bold text-[#5B6577] hover:bg-[#F1F4F9]" onClick={() => send({ action: "reopen", id: x.id }, "Issue reopened")}><RotateCcw size={13} /> Reopen</button>
                ))}
              </li>
            );
          })}
        </ul>
      )}
      {resolving && (
        <Dialog open onOpenChange={(o) => !o && setResolving(null)}>
          <DialogContent className="max-w-lg bg-white">
            <DialogHeader>
              <DialogTitle>Resolve · {resolving.title}</DialogTitle>
              <DialogDescription>Say how it was resolved; the note stays on the plan.</DialogDescription>
            </DialogHeader>
            <Field label="How it was resolved" required><textarea className={cn(textareaCls, "min-h-[80px]")} value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="e.g. Rulindo confirmed the district hall for 10–11 November" /></Field>
            <DialogFooter className="gap-2">
              <button type="button" className={btnOutline} onClick={() => setResolving(null)}>Cancel</button>
              <button type="button" disabled={busy || resolution.trim().length < 5} className={btnPrimary} onClick={async () => { if (await send({ action: "resolve", id: resolving.id, resolution: resolution.trim() }, "Issue resolved")) setResolving(null); }}><Check size={15} /> Mark resolved</button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </WCard>
  );
}

// ------------------------------------------------------------------ dialogs
function ReviewDialog({ plan, onClose, onDone }: { plan: any; onClose: () => void; onDone: () => void }) {
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function decide(decision: "approve" | "return") {
    if (decision === "return" && comment.trim().length < 5) return toast.error("Say what to change.");
    setBusy(true);
    try {
      await plansApi.act(plan.id, "review", { decision, comment: comment.trim() });
      toast.success(decision === "approve" ? "Plan approved" : "Plan returned for changes");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>{plan.plan_type === "department" ? plan.expand?.department?.name : plan.expand?.staff?.name} · {TYPE_INFO[plan.plan_type as PlanKind].label}</DialogTitle>
          <DialogDescription>{plan.period_label} · {(plan.items || []).length} {TYPE_INFO[plan.plan_type as PlanKind].items.toLowerCase()}. Approve it so the work can start, or return it with what to change.</DialogDescription>
        </DialogHeader>
        <Field label="Comment" hint="Required to return the plan"><textarea className={cn(textareaCls, "min-h-[90px]")} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        <DialogFooter className="gap-2">
          <button type="button" disabled={busy} className={btnOutline} onClick={() => decide("return")}><Undo2 size={15} /> Return for changes</button>
          <button type="button" disabled={busy} className={btnPrimary} onClick={() => decide("approve")}><Check size={15} /> Approve</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AssessDialog({ plan, onClose, onDone }: { plan: any; onClose: () => void; onDone: () => void }) {
  const [rating, setRating] = React.useState(0);
  const [feedback, setFeedback] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  async function send(decision: "assess" | "return") {
    if (decision === "assess" && !rating) return toast.error("Choose a rating.");
    if (feedback.trim().length < 5) return toast.error(decision === "assess" ? "Give feedback to the staff member." : "Say what to complete in the report.");
    setBusy(true);
    try {
      await plansApi.act(plan.id, "assess", { decision, rating, feedback: feedback.trim() });
      toast.success(decision === "assess" ? "Assessment saved" : "Report sent back");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Assess · {plan.plan_type === "department" ? plan.expand?.department?.name : plan.expand?.staff?.name}</DialogTitle>
          <DialogDescription>{TYPE_INFO[plan.plan_type as PlanKind].label} · {plan.period_label} · {plan.progress}% achieved{plan.self_rating ? ` · self-rating ${plan.self_rating}/5` : ""}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5" role="radiogroup" aria-label="Rating">
          {[5, 4, 3, 2, 1].map((r) => (
            <label key={r} className={cn("flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2", rating === r ? "border-[#1466C0] bg-[#EAF2FC]" : "border-[#DDE3EC] hover:bg-[#F8FAFC]")}>
              <input type="radio" name="rating" checked={rating === r} onChange={() => setRating(r)} />
              <Stars value={r} /> <span className="text-[13px] font-semibold">{RATING[r]}</span>
            </label>
          ))}
        </div>
        <Field label="Feedback" required><textarea className={cn(textareaCls, "min-h-[80px]")} value={feedback} onChange={(e) => setFeedback(e.target.value)} placeholder="What went well, what to improve" /></Field>
        <DialogFooter className="gap-2">
          <button type="button" disabled={busy} className={btnOutline} onClick={() => send("return")}><Undo2 size={15} /> Send the report back</button>
          <button type="button" disabled={busy} className={btnPrimary} onClick={() => send("assess")}><Star size={15} /> Save assessment</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReportDialog({ plan, items, onClose, onDone }: { plan: any; items: any[]; onClose: () => void; onDone: () => void }) {
  const department = plan.plan_type === "department";
  const [f, setF] = React.useState({ report_summary: "", challenges: "", next_steps: "", support_needed: "", self_rating: 0 });
  const [rows, setRows] = React.useState(items.map((i) => ({ ...i })));
  const [busy, setBusy] = React.useState(false);
  const open = rows.filter((i) => i.status !== "done" && i.status !== "dropped");
  const ended = new Date() >= new Date(String(plan.period_end).replace(" ", "T"));
  async function send() {
    if (f.report_summary.trim().length < 20) return toast.error("Summarise what was achieved (at least 20 characters).");
    if (open.some((i) => !String(i.achieved || "").trim())) return toast.error("Say what was achieved, or why not, for each open activity.");
    setBusy(true);
    try {
      await plansApi.act(plan.id, "report", { ...f, items: rows.map((i) => (department ? { id: i.id, achieved: i.achieved } : { id: i.id, status: i.status, progress: i.progress, achieved: i.achieved })) });
      toast.success("Report sent to your supervisor");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-2xl overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>Report · {plan.plan_type === "task" ? plan.title : TYPE_INFO[plan.plan_type as PlanKind].label} · {plan.period_label}</DialogTitle>
          <DialogDescription>{ended ? "The period is over: report what was achieved." : "The period is not over yet; you can still report early."} {plan.progress}% achieved. Your supervisor assesses it.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="What was achieved" required><textarea className={cn(textareaCls, "min-h-[110px]")} value={f.report_summary} onChange={(e) => setF({ ...f, report_summary: e.target.value })} placeholder="Results against the plan, with figures (e.g. 58 of 60 councillors trained; satisfaction 87%)" /></Field>
          {open.length > 0 && (
            <div className="rounded-lg border border-[#F5DFA3] bg-[#FFF8E6] p-3">
              <p className="mb-2 text-[13px] font-bold text-[#6B4A00]">{department ? "Activities not completed — what was achieved, or why not" : "Activities not done — what was achieved, or why not"}</p>
              {open.map((i) => (
                <div key={i.id} className={cn("mb-2 grid gap-2", !department && "sm:grid-cols-[1fr_150px]")}>
                  <input className={inputCls} value={i.achieved} placeholder={`${i.code ? `${i.code} · ` : ""}${i.title}`} onChange={(e) => setRows((xs) => xs.map((x) => (x.id === i.id ? { ...x, achieved: e.target.value } : x)))} aria-label={`Achieved: ${i.title}`} />
                  {!department && (
                    <select className={inputCls} value={i.status} onChange={(e) => setRows((xs) => xs.map((x) => (x.id === i.id ? { ...x, status: e.target.value } : x)))} aria-label={`Status: ${i.title}`}>
                      {Object.entries(ITEM_STATUS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
                    </select>
                  )}
                </div>
              ))}
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Challenges"><textarea className={cn(textareaCls, "min-h-[70px]")} value={f.challenges} onChange={(e) => setF({ ...f, challenges: e.target.value })} /></Field>
            <Field label="Next steps"><textarea className={cn(textareaCls, "min-h-[70px]")} value={f.next_steps} onChange={(e) => setF({ ...f, next_steps: e.target.value })} /></Field>
            <Field label="Support needed"><textarea className={cn(textareaCls, "min-h-[70px]")} value={f.support_needed} onChange={(e) => setF({ ...f, support_needed: e.target.value })} /></Field>
          </div>
          <Field label="How would you rate your own work?">
            <div className="flex flex-wrap gap-1.5">
              {[1, 2, 3, 4, 5].map((r) => (
                <button key={r} type="button" aria-pressed={f.self_rating === r} onClick={() => setF({ ...f, self_rating: r })} className={cn("rounded-lg border px-2.5 py-1.5 text-[12.5px] font-semibold", f.self_rating === r ? "border-[#1466C0] bg-[#EAF2FC] text-[#0B3A6F]" : "border-[#DDE3EC] text-[#5B6577]")}>{r} · {RATING[r]}</button>
              ))}
            </div>
          </Field>
        </div>
        <DialogFooter className="gap-2">
          <button type="button" className={btnOutline} onClick={onClose}>Cancel</button>
          <button type="button" disabled={busy} className={btnPrimary} onClick={send}><Send size={15} /> {busy ? "Sending…" : "Send the report"}</button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
