/**
 * My plans & reports: the staff member's work plans along the planning cycle (fiscal year → quarter →
 * month → week), the department's plan they contribute to, their mission / activity reports, and — for
 * supervisors — the team's plans waiting for approval and the reports waiting for an assessment.
 */
import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowRight, CalendarPlus, ChevronLeft, ChevronRight, Copy, Flag, Lightbulb, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { ITEM_STATUS, PLAN_STATUS, PLAN_TYPES, PlanType, TYPE_INFO, dayOf, plansApi, shiftPeriod } from "@/lib/plans";
import { useMe } from "@/components/portal/kit";
import { Skeleton } from "@/components/ui/skeleton";
import ReportsTab from "@/pages/portal/ReportsTab";
import { MyHeader, Pill, WCard, WHead, btnOutline, btnPrimary, myPage, toDate } from "@/components/workspace/WorkspaceKit";
import { Stars } from "./PlanDetail";
import { cn } from "@/utils";

const today = () => format(new Date(), "yyyy-MM-dd");

export default function MyPlans() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user }: any = useAuth();
  const uid: string = user?.id || "";
  const me = useMe();
  const tab = params.get("tab") || "plans";
  const supervising = useQuery(["plans-supervising", uid], () => pocketbase.collection("work_plans").getList(1, 1, { filter: `supervisor = "${uid}" && (status = "submitted" || status = "reported")`, fields: "id" }).then((r) => r.totalItems), { enabled: Boolean(uid) });
  const supervisesAny = useQuery(["plans-supervises-any", uid], () => pocketbase.collection("work_plans").getList(1, 1, { filter: `supervisor = "${uid}"`, fields: "id" }).then((r) => r.totalItems), { enabled: Boolean(uid) });
  const showTeam = Boolean(me.data?.isHead || me.data?.hrScope === "all" || (supervisesAny.data || 0) > 0);
  const tabs: [string, string][] = [["plans", "My plans"], ["department", "Department plan"], ["reports", "Reports"], ...(showTeam ? [["team", `My team${supervising.data ? ` (${supervising.data})` : ""}`] as [string, string]] : [])];
  const setTab = (k: string) => setParams(k === "plans" ? {} : { tab: k });

  return (
    <main className={myPage}>
      <MyHeader
        title="My plans & reports"
        subtitle="Plan your work the way the public service does: an annual performance contract, then quarterly outputs, monthly and weekly activities — each approved by your supervisor, followed up and reported."
        actions={<button type="button" className={btnPrimary} onClick={() => navigate("/dashboard/my/plans/new")}><Plus size={15} /> New plan</button>}
      />
      <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-[#E3E8EF]">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-[14px] font-bold", tab === k ? "border-[#1466C0] text-[#0B3A6F]" : "border-transparent text-[#5B6577] hover:text-[#14213D]")}>{l}</button>
        ))}
      </div>
      {tab === "plans" && <PlansTab uid={uid} />}
      {tab === "department" && <DepartmentTab department={me.data?.department} departmentName={me.data?.departmentName} isHead={Boolean(me.data?.isHead)} />}
      {tab === "reports" && <WCard><ReportsTab employeeId={uid} /></WCard>}
      {tab === "team" && <TeamTab uid={uid} />}
    </main>
  );
}

// ------------------------------------------------------------------ my plans
function PlansTab({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const type = (PLAN_TYPES as string[]).includes(params.get("type") || "") ? (params.get("type") as PlanType) : "weekly";
  const date = params.get("date") || today();
  const set = (next: Record<string, string>) => setParams({ ...Object.fromEntries(params.entries()), ...next });
  const period = useQuery(["plan-period", type, date], () => plansApi.period(type, date), { keepPreviousData: true });
  const all = useQuery(["my-plans", uid], () => pocketbase.collection("work_plans").getFullList({ filter: `staff = "${uid}"`, sort: "-period_start", expand: "supervisor" }), { enabled: Boolean(uid) });
  const plans = (all.data || []) as any[];
  const p = period.data;
  const current = p ? plans.find((x) => x.plan_type === type && dayOf(x.period_start) === p.start) : null;
  const previous = p ? plans.find((x) => x.plan_type === type && dayOf(x.period_start) < p.start) : null;
  const cycle = PLAN_TYPES.slice().reverse().map((t) => ({ t, plan: plans.find((x) => x.plan_type === t && dayOf(x.period_start) <= today() && dayOf(x.period_end) >= today()) }));
  const [busy, setBusy] = React.useState(false);

  async function copyPrevious() {
    if (!previous) return;
    setBusy(true);
    try {
      const r = await plansApi.act(previous.id, "copy");
      toast.success(`${r.number} started from ${previous.period_label}`);
      navigate(`/dashboard/my/plans/${r.id}/edit`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-[18px]">
      <WCard>
        <WHead title="Planning cycle" subtitle="Your plans in force today, from the year down to the week" />
        <ol className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          {cycle.map(({ t, plan }, i) => (
            <li key={t} className="relative">
              <button type="button" onClick={() => (plan ? navigate(`/dashboard/my/plans/${plan.id}`) : navigate(`/dashboard/my/plans/new?type=${t}`))}
                className={cn("flex h-full w-full flex-col gap-1.5 rounded-xl border px-3.5 py-3 text-left hover:bg-[#F8FAFD]", plan ? "border-[#E3E8EF]" : "border-dashed border-[#C5CDD9]")}>
                <span className="text-[12px] font-bold uppercase tracking-wider text-[#5B6577]">{i + 1} · {TYPE_INFO[t].short}</span>
                <span className="text-[14px] font-bold">{TYPE_INFO[t].label}</span>
                {plan && <Pill tone={PLAN_STATUS[plan.status]?.tone} className="self-start">{PLAN_STATUS[plan.status]?.label}</Pill>}
                {plan ? (
                  <>
                    <span className="text-[12.5px] text-[#5B6577]">{plan.period_label} · {(plan.items || []).length} {TYPE_INFO[t].items.toLowerCase()}</span>
                    <span className="flex items-center gap-2"><span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[#EEF1F5]"><span className="block h-full rounded-full bg-[#1466C0]" style={{ width: `${plan.progress}%` }} /></span><b className="text-[12.5px] tabular-nums">{plan.progress}%</b></span>
                  </>
                ) : <span className="text-[12.5px] text-[#1466C0]">Not planned yet — plan it →</span>}
              </button>
            </li>
          ))}
        </ol>
      </WCard>

      <WCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="group" aria-label="Kind of plan" className="flex rounded-[9px] bg-[#F1F4F9] p-[3px]">
            {PLAN_TYPES.map((t) => (
              <button key={t} type="button" aria-pressed={type === t} onClick={() => set({ type: t })} className={cn("h-[32px] rounded-[7px] px-3.5 text-[13px] font-bold", type === t ? "bg-white text-[#0B3A6F] shadow-[0_1px_2px_rgba(20,33,61,.12)]" : "text-[#5B6577] hover:text-[#14213D]")}>{TYPE_INFO[t].short}</button>
            ))}
          </div>
          <div className="flex w-full items-center gap-2 sm:w-auto">
            <button type="button" aria-label="Previous period" onClick={() => p && set({ date: shiftPeriod(type, p.start, -1) })} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3EC] hover:bg-[#F1F4F9]"><ChevronLeft size={16} /></button>
            <span className="min-w-0 flex-1 text-center text-[13.5px] font-bold sm:min-w-[200px] sm:flex-none sm:text-[14px]">{p?.label || "…"}</span>
            <button type="button" aria-label="Next period" onClick={() => p && set({ date: shiftPeriod(type, p.start, 1) })} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3EC] hover:bg-[#F1F4F9]"><ChevronRight size={16} /></button>
            <button type="button" onClick={() => set({ date: today() })} className="h-9 rounded-lg px-3 text-[13px] font-bold text-[#1466C0] hover:bg-[#EAF2FC]">Today</button>
          </div>
        </div>

        <div className="mt-4">
          {all.isLoading || period.isLoading ? <Skeleton className="h-40 w-full" /> : current ? (
            <PlanSummary plan={current} />
          ) : (
            <div className="grid gap-4 rounded-xl border border-dashed border-[#C5CDD9] bg-[#F8FAFC] p-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
              <div>
                <p className="text-[16px] font-extrabold">No {TYPE_INFO[type].label.toLowerCase()} for {p?.label}</p>
                <p className="mt-1 text-[13.5px] text-[#36435A]">{TYPE_INFO[type].hint}</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" className={btnPrimary} onClick={() => navigate(`/dashboard/my/plans/new?type=${type}&date=${p?.start || today()}`)}><CalendarPlus size={15} /> Plan {TYPE_INFO[type].short.toLowerCase()}</button>
                  {previous && <button type="button" disabled={busy} className={btnOutline} onClick={copyPrevious}><Copy size={15} /> From {previous.period_label}</button>}
                </div>
              </div>
              <Tips type={type} />
            </div>
          )}
        </div>
      </WCard>

      <WCard flush className="overflow-hidden">
        <div className="px-5 pb-3 pt-[18px]"><WHead title="All my plans" subtitle="Every plan with its outcome" /></div>
        {all.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-32 w-full" /></div> : !plans.length ? <p className="px-5 pb-6 text-[13px] text-[#5B6577]">No plan yet.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[14px]">
              <thead><tr className="bg-[#F8FAFC] text-left text-[12.5px] text-[#5B6577]"><th className="px-5 py-2.5 font-bold">Plan</th><th className="px-3.5 py-2.5 font-bold">Period</th><th className="px-3.5 py-2.5 text-right font-bold">Items</th><th className="px-3.5 py-2.5 font-bold">Progress</th><th className="px-3.5 py-2.5 font-bold">Status</th><th className="py-2.5 pl-3.5 pr-5 font-bold">Rating</th></tr></thead>
              <tbody>
                {plans.map((x) => (
                  <tr key={x.id} onClick={() => navigate(`/dashboard/my/plans/${x.id}`)} className="cursor-pointer border-t border-[#EDF0F5] hover:bg-[#F8FAFD]">
                    <td className="px-5 py-3"><span className="font-bold">{TYPE_INFO[x.plan_type as PlanType]?.label}</span><span className="block font-mono text-[11.5px] text-[#5B6577]">{x.number}</span></td>
                    <td className="px-3.5 py-3 text-[13px]">{x.period_label}</td>
                    <td className="px-3.5 py-3 text-right tabular-nums">{(x.items || []).length}</td>
                    <td className="px-3.5 py-3"><span className="flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#EEF1F5]"><span className="block h-full rounded-full bg-[#1466C0]" style={{ width: `${x.progress}%` }} /></span><span className="text-[12.5px] font-bold tabular-nums">{x.progress}%</span></span></td>
                    <td className="px-3.5 py-3"><Pill tone={PLAN_STATUS[x.status]?.tone}>{PLAN_STATUS[x.status]?.label}</Pill></td>
                    <td className="py-3 pl-3.5 pr-5">{x.supervisor_rating ? <Stars value={x.supervisor_rating} size={13} /> : <span className="text-[#5B6577]">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </WCard>
    </div>
  );
}

function PlanSummary({ plan }: { plan: any }) {
  const navigate = useNavigate();
  const items = (plan.items || []) as any[];
  return (
    <div className="rounded-xl border border-[#E3E8EF]">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#EDF0F5] px-4 py-3">
        <div>
          <p className="text-[15px] font-extrabold">{plan.focus || plan.title}</p>
          <p className="text-[12.5px] text-[#5B6577]">{plan.number} · supervisor {plan.expand?.supervisor?.name || "assigned when sent"}</p>
        </div>
        <div className="flex items-center gap-3">
          <Pill tone={PLAN_STATUS[plan.status]?.tone}>{PLAN_STATUS[plan.status]?.label}</Pill>
          <span className="text-[20px] font-extrabold tabular-nums">{plan.progress}%</span>
        </div>
      </div>
      {plan.status === "returned" && plan.review_comment && <p className="border-b border-[#EDF0F5] bg-[#FDE8E7] px-4 py-2 text-[13px] text-[#B42318]"><b>Returned:</b> {plan.review_comment}</p>}
      <ul className="divide-y divide-[#EDF0F5]">
        {items.map((i) => (
          <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
            <span className={cn("h-2.5 w-2.5 shrink-0 rounded-full", i.status === "done" ? "bg-[#0F6B3A]" : i.status === "in_progress" ? "bg-[#1466C0]" : i.status === "postponed" ? "bg-[#E8833A]" : "bg-[#C5CDD9]")} aria-hidden />
            <span className="min-w-0 flex-1 truncate text-[13.5px]">{i.title}</span>
            {i.target && <span className="hidden text-[12px] text-[#5B6577] sm:inline">target {i.target}</span>}
            <span className="text-[12px] text-[#5B6577]">{ITEM_STATUS[i.status]?.label}</span>
            <span className="w-10 text-right text-[12.5px] font-bold tabular-nums">{i.progress}%</span>
          </li>
        ))}
      </ul>
      <div className="flex justify-end border-t border-[#EDF0F5] px-4 py-2.5">
        <button type="button" onClick={() => navigate(`/dashboard/my/plans/${plan.id}`)} className="inline-flex items-center gap-1 text-[13px] font-bold text-[#1466C0] hover:underline">Open the plan <ArrowRight size={13} /></button>
      </div>
    </div>
  );
}

function Tips({ type }: { type: PlanType }) {
  const tips: Record<PlanType, string[]> = {
    annual: ["3 to 6 objectives that serve RALGA's strategic objectives", "One indicator per objective, with today's value (baseline) and the year's target", "Weights add up to 100% — more weight for what matters most", "Say what will prove it: reports, lists, publications"],
    quarterly: ["Take the objectives of your annual contract that fall in this quarter", "Each output: indicator and target for the quarter", "Plan the money: cost of each output"],
    monthly: ["Break the quarter's outputs into activities", "Give each activity an expected output and a due date", "Link them to your department's plan"],
    weekly: ["Start from your monthly plan: what moves this week?", "Spread the work over the days, leave room for meetings and reporting", "Friday: update the progress and write two lines per activity"],
  };
  return (
    <div className="rounded-lg bg-white p-3.5">
      <p className="mb-1.5 flex items-center gap-1.5 text-[13px] font-bold text-[#0B3A6F]"><Lightbulb size={14} aria-hidden /> A good {TYPE_INFO[type].label.toLowerCase()}</p>
      <ul className="list-disc space-y-1 pl-5 text-[13px] text-[#36435A]">{tips[type].map((t) => <li key={t}>{t}</li>)}</ul>
    </div>
  );
}

// ------------------------------------------------------------------ department plan
function DepartmentTab({ department, departmentName, isHead }: { department?: string; departmentName?: string; isHead: boolean }) {
  const navigate = useNavigate();
  const q = useQuery(["dept-plans-tab", department], () => pocketbase.collection("actionPlans").getFullList({ filter: `scope = "department" && department_id = "${department}"`, sort: "-start_date", expand: "staff_id" }), { enabled: Boolean(department) });
  const rows = (q.data || []) as any[];
  return (
    <WCard flush className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-[18px]">
        <WHead title={`${departmentName || "Department"} plan`} subtitle="What the department committed to; link your activities to it when you plan" />
        {isHead && <button type="button" className={btnPrimary} onClick={() => navigate("/dashboard/employee-portal/plans/new?scope=department")}><Flag size={15} /> New department plan</button>}
      </div>
      {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-32 w-full" /></div> : !rows.length ? <p className="px-5 pb-6 text-[13px] text-[#5B6577]">No department plan recorded yet. The head of department records it.</p> : (
        <ul className="divide-y divide-[#EDF0F5] border-t border-[#EDF0F5]">
          {rows.map((r) => (
            <li key={r.id}>
              <Link to={`/dashboard/employee-portal/plans/${r.id}`} className="flex flex-wrap items-center gap-3 px-5 py-3 hover:bg-[#F8FAFD]">
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-bold">{r.title}</span>
                  <span className="block text-[12.5px] text-[#5B6577]">{toDate(r.start_date) ? format(toDate(r.start_date) as Date, "d MMM") : ""} – {toDate(r.end_date) ? format(toDate(r.end_date) as Date, "d MMM yyyy") : ""}{r.expected_output ? ` · ${r.expected_output}` : ""}</span>
                </span>
                <span className="flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#EEF1F5]"><span className="block h-full rounded-full bg-[#1466C0]" style={{ width: `${r.progress || 0}%` }} /></span><b className="text-[12.5px] tabular-nums">{r.progress || 0}%</b></span>
                <Pill tone={r.status === "completed" ? "approved" : r.status === "in_progress" ? "info" : "neutral"}>{String(r.status || "").replace(/_/g, " ")}</Pill>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </WCard>
  );
}

// ------------------------------------------------------------------ team (supervisors)
function TeamTab({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const [filter, setFilter] = React.useState<"todo" | "all">("todo");
  const q = useQuery(["team-plans", uid], () => pocketbase.collection("work_plans").getFullList({ filter: `supervisor = "${uid}" || (staff != "${uid}" && staff.department.head = "${uid}")`, sort: "-updated", expand: "staff" }), { enabled: Boolean(uid) });
  const rows = ((q.data || []) as any[]).filter((r) => r.staff !== uid);
  const todo = rows.filter((r) => r.supervisor === uid && (r.status === "submitted" || r.status === "reported"));
  const shown = filter === "todo" ? todo : rows;
  return (
    <WCard flush className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-[18px]">
        <WHead title="My team's plans" subtitle="Approve plans before the work starts; assess the reports at the end of each period" />
        <div role="group" className="flex rounded-[9px] bg-[#F1F4F9] p-[3px]">
          {([["todo", `Waiting for me ${todo.length}`], ["all", `All ${rows.length}`]] as const).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("h-[30px] rounded-[7px] px-3 text-[12.5px] font-bold", filter === k ? "bg-white text-[#0B3A6F] shadow-[0_1px_2px_rgba(20,33,61,.12)]" : "text-[#5B6577]")}>{l}</button>
          ))}
        </div>
      </div>
      {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-32 w-full" /></div> : !shown.length ? <p className="border-t border-[#EDF0F5] px-5 py-8 text-center text-[13.5px] text-[#5B6577]">{filter === "todo" ? "Nothing waiting for you." : "Your team has no plan yet."}</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-[14px]">
            <thead><tr className="bg-[#F8FAFC] text-left text-[12.5px] text-[#5B6577]"><th className="px-5 py-2.5 font-bold">Staff member</th><th className="px-3.5 py-2.5 font-bold">Plan</th><th className="px-3.5 py-2.5 font-bold">Progress</th><th className="px-3.5 py-2.5 font-bold">Status</th><th className="py-2.5 pl-3.5 pr-5 text-right font-bold" /></tr></thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id} onClick={() => navigate(`/dashboard/my/plans/${r.id}`)} className="cursor-pointer border-t border-[#EDF0F5] hover:bg-[#F8FAFD]">
                  <td className="px-5 py-3 font-bold">{r.expand?.staff?.name}</td>
                  <td className="px-3.5 py-3"><span className="font-semibold">{TYPE_INFO[r.plan_type as PlanType]?.label}</span><span className="block text-[12.5px] text-[#5B6577]">{r.period_label} · {(r.items || []).length} items</span></td>
                  <td className="px-3.5 py-3"><span className="flex items-center gap-2"><span className="h-1.5 w-20 overflow-hidden rounded-full bg-[#EEF1F5]"><span className="block h-full rounded-full bg-[#1466C0]" style={{ width: `${r.progress}%` }} /></span><b className="text-[12.5px] tabular-nums">{r.progress}%</b></span></td>
                  <td className="px-3.5 py-3"><Pill tone={PLAN_STATUS[r.status]?.tone}>{PLAN_STATUS[r.status]?.label}</Pill></td>
                  <td className="py-3 pl-3.5 pr-5 text-right">{r.supervisor === uid && r.status === "submitted" ? <span className="text-[13px] font-bold text-[#1466C0]">Approve →</span> : r.supervisor === uid && r.status === "reported" ? <span className="text-[13px] font-bold text-[#1466C0]">Assess →</span> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </WCard>
  );
}
