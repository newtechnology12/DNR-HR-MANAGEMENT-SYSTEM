/**
 * My plans & reports: the staff member's plans along the planning cycle (fiscal year → quarter → month →
 * week) and the tasks assigned to them, with the health of each (achievement against the time passed),
 * open issues and the supervisor's rating; the department's plan they contribute to; mission / activity
 * reports; and — for supervisors — the team's plans to approve and reports to assess, and work to assign.
 */
import * as React from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { format } from "date-fns";
import { ArrowRight, CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck, FileText, Flag, Plus, Search, UserPlus } from "lucide-react";
import type { RecordModel } from "pocketbase";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import {
  HEALTH, LEVELS, LEVEL_ORDER, PLAN_STATUS, PlanKind, TYPE_INFO, dayOf, healthOf, openIssues, originOf, planTitle, plansApi, statusOf,
} from "@/lib/plans";
import { DepartmentActivitiesCard } from "@/components/workspace/DepartmentActivities";
import { useMe } from "@/components/portal/kit";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ReportsTab from "@/pages/portal/ReportsTab";
import { MyHeader, Pill, WCard, WHead, btnOutline, btnPrimary, myPage } from "@/components/workspace/WorkspaceKit";
import { Stars } from "./PlanDetail";
import { cn } from "@/utils";

const today = () => format(new Date(), "yyyy-MM-dd");
const EXPAND = "supervisor,assigned_by,assigned_by.designation,parent";

export default function MyPlans() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { user }: any = useAuth();
  const uid: string = user?.id || "";
  const me = useMe();
  const tab = params.get("tab") || "plans";
  const [reporting, setReporting] = React.useState(false);
  const waiting = useQuery(["plans-supervising", uid], () => pocketbase.collection("work_plans").getList(1, 1, { filter: `supervisor = "${uid}" && staff != "${uid}" && (status = "submitted" || status = "reported")`, fields: "id" }).then((r) => r.totalItems), { enabled: Boolean(uid) });
  const team = useQuery(["plans-team-size", uid], () => pocketbase.send("/api/ims/plans/team", {}).then((r: any) => (r.items || []).length as number), { enabled: Boolean(uid), staleTime: 300_000 });
  const showTeam = Boolean((team.data || 0) > 0 || (waiting.data || 0) > 0);
  const tabs: [string, string][] = [["plans", "My plans"], ["department", "Department plan"], ["reports", "Reports"], ...(showTeam ? [["team", `My team${waiting.data ? ` (${waiting.data})` : ""}`] as [string, string]] : [])];
  const setTab = (k: string) => setParams(k === "plans" ? {} : { tab: k });

  return (
    <main className={myPage}>
      <MyHeader
        eyebrow="My workspace"
        title="My plans & reports"
        subtitle="Plan your work from the annual performance contract down to each week. Your supervisor approves every plan, and assesses the report you send with evidence."
        actions={
          <>
            <button type="button" className={btnOutline} onClick={() => setReporting(true)}>Submit report</button>
            <button type="button" className={btnPrimary} onClick={() => navigate("/dashboard/my/plans/new")}><Plus size={15} /> New plan</button>
          </>
        }
      />
      <div role="tablist" className="flex gap-1 overflow-x-auto overflow-y-hidden border-b border-[#E3E8EF] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {tabs.map(([k, l]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={cn("-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-[14.5px] font-bold", tab === k ? "border-[#1466C0] text-[#0B3A6F]" : "border-transparent text-[#5B6577] hover:text-[#14213D]")}>{l}</button>
        ))}
      </div>
      {tab === "plans" && <PlansTab uid={uid} />}
      {tab === "department" && <DepartmentTab isHead={Boolean(me.data?.isHead)} />}
      {tab === "reports" && <WCard><ReportsTab employeeId={uid} /></WCard>}
      {tab === "team" && <TeamTab uid={uid} />}
      {reporting && <SubmitReportDialog uid={uid} onClose={() => setReporting(false)} />}
    </main>
  );
}

function useMyPlans(uid: string) {
  return useQuery(["my-plans", uid], () => pocketbase.collection("work_plans").getFullList({ filter: `staff = "${uid}"`, sort: "-period_start", expand: EXPAND }), { enabled: Boolean(uid) });
}

/** Thin progress bar coloured by health. */
function Bar({ value, health, className }: { value: number; health: keyof typeof HEALTH; className?: string }) {
  return (
    <span className={cn("block h-[7px] overflow-hidden rounded-full bg-[#EEF1F5]", className)} aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: HEALTH[health].bar }} />
    </span>
  );
}

/** Tables on this page: light header, a line between every column (the workspace table style). */
const GRID =
  "w-full border-collapse text-[14px] [&_td]:border-r [&_td]:border-[#E3E8EF] [&_td:last-child]:border-r-0 [&_th]:border-r [&_th]:border-[#E3E8EF] [&_th:last-child]:border-r-0";
const TH = "px-3.5 py-3 text-left text-[12px] font-bold uppercase tracking-[0.04em] text-[#5B6577]";

/** "Week 43 · 19–23 Oct 2026" → dates on the first line, the period's name under them. */
function periodParts(label: string) {
  const [first, second] = String(label || "").split(" · ");
  return second ? { main: second, sub: first } : { main: first || "—", sub: "" };
}

/** Where the plan comes from, short enough for a table cell; the full sentence stays in the tooltip. */
function originTag(p: RecordModel): { text: string; full: string; assigned: boolean } {
  const o = originOf(p);
  if (!o.assigned) return { text: "My own plan", full: "A plan you prepared yourself", assigned: false };
  if (p.origin === "cascaded") {
    const parent = p.expand?.parent?.plan_type as PlanKind | undefined;
    return { text: `From my ${parent ? TYPE_INFO[parent].short.toLowerCase() : "higher-level"} plan`, full: o.text.replace("Assigned · ", ""), assigned: true };
  }
  if (p.source) return { text: `From ${String(p.source).split(" · ")[0]}`, full: o.text.replace("Assigned · ", ""), assigned: true };
  const by = p.expand?.assigned_by?.name;
  return { text: by ? `Assigned by ${by}` : "Assigned by your supervisor", full: o.text.replace("Assigned · ", "Assigned by "), assigned: true };
}

/** Status pill and the next step under it. */
function statusView(p: RecordModel, now: Date) {
  const st = statusOf(p, now);
  const who = p.expand?.supervisor?.name || "your supervisor";
  const starts = p.period_start ? format(new Date(`${dayOf(p.period_start)}T12:00:00`), "d MMM") : "";
  const view: Record<string, { label: string; next: string }> = {
    draft: { label: "Draft", next: "Not sent yet" },
    submitted: { label: st.label, next: `With ${who}` },
    returned: { label: "Returned", next: "Correct and send again" },
    approved: st.label === "Not started" ? { label: "Not started", next: starts ? `Starts ${starts}` : "" } : { label: "Approved", next: "Work in progress" },
    reported: { label: st.label, next: `With ${who}` },
    assessed: { label: "Assessed", next: "Feedback received" },
  };
  return { tone: st.tone, ...(view[p.status] || { label: st.label, next: "" }) };
}

/** Health colours explained in plain words (same thresholds as healthOf in lib/plans). */
function HealthLegend() {
  const items: [keyof typeof HEALTH, string][] = [
    ["on_track", "achievement is no more than 10 points behind the time that has passed"],
    ["at_risk", "10 to 25 points behind"],
    ["off_track", "more than 25 points behind"],
    ["completed", "done or reported"],
    ["not_started", "the period has not begun"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-[#EDF0F5] px-5 py-3 text-[12.5px] text-[#5B6577]">
      <span className="font-bold text-[#36435A]">Health</span>
      {items.map(([k, text]) => (
        <span key={k} className="flex items-start gap-1.5">
          <span className="mt-[5px] h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: HEALTH[k].bar }} aria-hidden />
          <span>
            <b className={cn("whitespace-nowrap", HEALTH[k].text)}>{HEALTH[k].label}</b> {text}
          </span>
        </span>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------ my plans
function PlansTab({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const q = useMyPlans(uid);
  const plans = (q.data || []) as any[];
  const [search, setSearch] = React.useState("");
  const [origin, setOrigin] = React.useState<"all" | "assigned" | "own">("all");
  const [level, setLevel] = React.useState<"" | PlanKind>("");
  const [showAll, setShowAll] = React.useState(false);

  const now = new Date();
  const t = today();
  const cycle = (["annual", "quarterly", "monthly", "weekly"] as PlanKind[]).map((k) => ({ k, plan: plans.find((x) => x.plan_type === k && dayOf(x.period_start) <= t && dayOf(x.period_end) >= t) }));
  const assigned = plans.filter((p) => originOf(p).assigned);
  const needle = search.trim().toLowerCase();
  const rows = plans
    .filter((p) => origin === "all" || (origin === "assigned") === originOf(p).assigned)
    .filter((p) => !level || p.plan_type === level)
    .filter((p) => !needle || [p.number, planTitle(p), p.period_label, p.expand?.supervisor?.name].some((v) => String(v || "").toLowerCase().includes(needle)))
    .sort((a, b) => LEVEL_ORDER[a.plan_type as PlanKind] - LEVEL_ORDER[b.plan_type as PlanKind] || String(b.period_start).localeCompare(String(a.period_start)));
  const shown = showAll ? rows : rows.slice(0, 12);

  return (
    <div className="flex flex-col gap-[18px]">
      <WCard flush className="overflow-hidden">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-[#EDF0F5] px-5 py-3.5">
          <h2 className="text-[15px] font-extrabold">This period</h2>
          <span className="text-[12.5px] text-[#5B6577]">The plans that cover today, from the year down to this week</span>
        </div>
        <div className="grid gap-px bg-[#EDF0F5] sm:grid-cols-2 xl:grid-cols-4">
          {cycle.map(({ k, plan }, i) => {
            const h = plan ? healthOf(plan, now) : "not_started";
            const period = plan ? periodParts(plan.period_label) : null;
            return (
              <button key={k} type="button" onClick={() => navigate(plan ? `/dashboard/my/plans/${plan.id}` : `/dashboard/my/plans/new?type=${k}`)} className="flex min-w-0 flex-col gap-1 bg-white px-5 py-4 text-left transition-colors hover:bg-[#F8FAFD]">
                <span className="flex items-center justify-between gap-2 text-[12px]">
                  <span className="font-bold uppercase tracking-[0.05em] text-[#5B6577]">Level {i + 1} · {TYPE_INFO[k].short}</span>
                  {plan && <Pill tone={HEALTH[h].tone}>{HEALTH[h].label}</Pill>}
                </span>
                <span className="text-[16px] font-extrabold leading-snug">{TYPE_INFO[k].label}</span>
                {plan && period ? (
                  <>
                    <span className="truncate text-[13px] text-[#5B6577]">{period.sub ? `${period.sub} · ${period.main}` : period.main}</span>
                    <span className="mt-2.5 flex items-center gap-3">
                      <Bar value={plan.progress} health={h} className="flex-1" />
                      <b className="w-11 text-right text-[15px] tabular-nums" aria-label={`${plan.progress}% achieved`}>{plan.progress}%</b>
                    </span>
                  </>
                ) : (
                  <span className="mt-1 text-[13px] font-semibold text-[#1466C0]">Not planned yet · Plan it now →</span>
                )}
              </button>
            );
          })}
        </div>
      </WCard>

      <WCard flush className="overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 px-5 py-4">
          <div className="mr-auto min-w-0">
            <h2 className="text-[17px] font-extrabold">All my plans</h2>
            <p className="text-[12.5px] text-[#5B6577]">
              {plans.length} plan{plans.length === 1 ? "" : "s"} · {assigned.length} assigned to you · open one to update progress or report
            </p>
          </div>
          <label className="relative w-full sm:w-[240px]">
            <span className="sr-only">Search plans</span>
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#8A94A6]" aria-hidden />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search plan or code" className="h-10 w-full rounded-[9px] border border-[#DDE3EC] bg-white pl-9 pr-3 text-[13.5px] outline-none placeholder:text-[#8A94A6] focus:border-[#1466C0] focus:ring-2 focus:ring-[#1466C0]/15" />
          </label>
          <div role="group" aria-label="Origin" className="flex rounded-[9px] bg-[#F1F4F9] p-[3px]">
            {([["all", "All", plans.length], ["assigned", "Assigned to me", assigned.length], ["own", "My own", plans.length - assigned.length]] as const).map(([k, l, n]) => (
              <button key={k} type="button" aria-pressed={origin === k} onClick={() => setOrigin(k)} className={cn("h-[34px] whitespace-nowrap rounded-[7px] px-3 text-[13px] font-bold", origin === k ? "bg-white text-[#0B3A6F] shadow-[0_1px_2px_rgba(20,33,61,.12)]" : "text-[#5B6577] hover:text-[#14213D]")}>
                {l} <span className={origin === k ? "text-[#1466C0]" : "text-[#8A94A6]"}>{n}</span>
              </button>
            ))}
          </div>
          <select aria-label="Level" value={level} onChange={(e) => setLevel(e.target.value as PlanKind | "")} className="h-10 rounded-[9px] border border-[#DDE3EC] bg-white px-3 text-[13.5px] font-semibold outline-none focus:border-[#1466C0]">
            <option value="">All levels</option>
            {LEVELS.map((k) => <option key={k} value={k}>{TYPE_INFO[k].short}</option>)}
          </select>
        </div>

        {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-48 w-full" /></div> : !plans.length ? (
          <div className="mx-5 mb-5 flex flex-col items-center gap-3 rounded-xl border border-dashed border-[#C5CDD9] bg-[#F8FAFC] px-6 py-10 text-center">
            <ClipboardCheck size={28} className="text-[#8A94A6]" aria-hidden />
            <div>
              <p className="text-[16px] font-extrabold">No plan yet</p>
              <p className="mx-auto mt-1 max-w-xl text-[13.5px] text-[#36435A]">Start at the top: agree your annual performance contract with your supervisor, then plan the quarter, the month and the week. Work your supervisor assigns to you appears here too.</p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className={btnPrimary} onClick={() => navigate("/dashboard/my/plans/new?type=annual")}><Flag size={15} /> Start my annual contract</button>
              <button type="button" className={btnOutline} onClick={() => navigate("/dashboard/my/plans/new?type=weekly")}><CalendarPlus size={15} /> Plan this week</button>
            </div>
          </div>
        ) : !rows.length ? (
          <p className="border-t border-[#EDF0F5] px-5 py-10 text-center text-[13.5px] text-[#5B6577]">No plan matches these filters.</p>
        ) : (
          <>
            {/* phones: one card per plan */}
            <ul className="divide-y divide-[#EDF0F5] border-t border-[#EDF0F5] md:hidden">
              {shown.map((p) => {
                const h = healthOf(p, now);
                const s = statusView(p, now);
                const period = periodParts(p.period_label);
                return (
                  <li key={p.id}>
                    <button type="button" onClick={() => navigate(`/dashboard/my/plans/${p.id}`)} className="flex w-full flex-col gap-1.5 px-4 py-3.5 text-left hover:bg-[#F8FAFD]">
                      <span className="flex items-start justify-between gap-3">
                        <b className="line-clamp-2 text-[14px] leading-snug text-[#14213D]">{planTitle(p)}</b>
                        <Pill tone={s.tone}>{s.label}</Pill>
                      </span>
                      <span className="text-[12.5px] text-[#5B6577]">{TYPE_INFO[p.plan_type as PlanKind]?.short} · {period.main}{period.sub ? ` · ${period.sub}` : ""}</span>
                      <span className="flex items-center gap-3">
                        <Bar value={p.progress} health={h} className="flex-1" />
                        <b className="text-[13px] tabular-nums">{p.progress}%</b>
                        <Pill tone={HEALTH[h].tone}>{HEALTH[h].label}</Pill>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>

            <div className="hidden overflow-x-auto border-t border-[#E3E8EF] md:block">
              <table className={cn(GRID, "min-w-[980px]")}>
                <thead>
                  <tr className="bg-[#F8FAFC]">
                    <th scope="col" className={cn(TH, "pl-5")}>Plan</th>
                    <th scope="col" className={TH}>Period</th>
                    <th scope="col" className={TH}>Supervisor</th>
                    <th scope="col" className={TH}>Achieved</th>
                    <th scope="col" className={TH}>Health</th>
                    <th scope="col" className={cn(TH, "text-center")} title="Problems you recorded that are not solved yet">Issues</th>
                    <th scope="col" className={TH}>Status</th>
                    <th scope="col" className={cn(TH, "pr-5")}>Rating</th>
                  </tr>
                </thead>
                <tbody>
                  {shown.map((p) => {
                    const h = healthOf(p, now);
                    const o = originTag(p);
                    const s = statusView(p, now);
                    const issues = openIssues(p);
                    const period = periodParts(p.period_label);
                    return (
                      <tr key={p.id} onClick={() => navigate(`/dashboard/my/plans/${p.id}`)} className="cursor-pointer border-t border-[#E3E8EF] align-middle hover:[&>td]:bg-[#F8FAFD]">
                        <td className="min-w-[230px] max-w-[340px] py-3 pl-5 pr-3.5">
                          <Link to={`/dashboard/my/plans/${p.id}`} onClick={(e) => e.stopPropagation()} className="line-clamp-2 font-bold leading-snug text-[#14213D] hover:text-[#0B3A6F] hover:underline">{planTitle(p)}</Link>
                          <span className="mt-1 flex flex-wrap items-center gap-1.5 text-[12px]">
                            <span className="rounded bg-[#F1F4F9] px-1.5 py-px font-mono text-[11px] text-[#5B6577]">{p.number}</span>
                            <span title={o.full} className={cn("max-w-[240px] truncate rounded px-1.5 py-px font-semibold", o.assigned ? "bg-[#F3ECFA] text-[#6B2FA3]" : "text-[#5B6577]")}>{o.text}</span>
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <span className="block text-[13.5px] font-semibold text-[#14213D]">{period.main}</span>
                          {period.sub && <span className="block text-[12px] text-[#5B6577]">{period.sub}</span>}
                        </td>
                        <td className="min-w-[115px] px-3.5 py-3 text-[13.5px] text-[#36435A]">{p.expand?.supervisor?.name || <span className="text-[#8A94A6]">Not set</span>}</td>
                        <td className="min-w-[105px] px-3.5 py-3">
                          <b className="block text-[14px] tabular-nums">{p.progress}%</b>
                          <Bar value={p.progress} health={h} className="mt-1 w-full" />
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3"><Pill tone={HEALTH[h].tone}>{HEALTH[h].label}</Pill></td>
                        <td className="whitespace-nowrap px-3.5 py-3 text-center">
                          {issues ? <span className="rounded-full bg-[#FDE8E7] px-2 py-0.5 text-[12.5px] font-bold text-[#B42318]">{issues} open</span> : <span className="text-[12.5px] text-[#8A94A6]">None</span>}
                        </td>
                        <td className="whitespace-nowrap px-3.5 py-3">
                          <Pill tone={s.tone}>{s.label}</Pill>
                          {s.next && <span className="mt-1 block text-[12px] text-[#5B6577]">{s.next}</span>}
                        </td>
                        <td className="whitespace-nowrap py-3 pl-3.5 pr-5">
                          {p.supervisor_rating ? <Stars value={p.supervisor_rating} size={13} /> : <span className="text-[12.5px] text-[#8A94A6]">Not rated</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {rows.length > shown.length && (
              <div className="border-t border-[#EDF0F5] px-5 py-2.5 text-center">
                <button type="button" onClick={() => setShowAll(true)} className="text-[13px] font-bold text-[#1466C0] hover:underline">Show all {rows.length} plans</button>
              </div>
            )}
          </>
        )}
        <HealthLegend />
      </WCard>
    </div>
  );
}

// ------------------------------------------------------------------ submit report
function SubmitReportDialog({ uid, onClose }: { uid: string; onClose: () => void }) {
  const navigate = useNavigate();
  const q = useMyPlans(uid);
  const now = new Date();
  const due = ((q.data || []) as any[]).filter((p) => p.status === "approved").sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl gap-0 p-0">
        <DialogHeader className="border-b border-[#EDF0F5] px-5 py-4 text-left">
          <DialogTitle className="text-[17px]">Submit a report</DialogTitle>
          <DialogDescription>Which work are you reporting on? Your supervisor assesses the report.</DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] overflow-y-auto px-2 py-2">
          {q.isLoading ? <Skeleton className="m-3 h-24" /> : !due.length ? (
            <p className="px-3 py-5 text-[13.5px] text-[#5B6577]">No approved plan is waiting for a report. Plans are reported once your supervisor has approved them.</p>
          ) : due.map((p) => {
            const h = healthOf(p, now);
            const ended = dayOf(p.period_end) <= today();
            return (
              <button key={p.id} type="button" onClick={() => navigate(`/dashboard/my/plans/${p.id}?report=1`)} className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-[#F1F4F9]">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-bold">{planTitle(p)}</span>
                  <span className="block text-[12.5px] text-[#5B6577]">{p.period_label} · {p.progress}% achieved{ended ? " · period ended" : ""}</span>
                </span>
                <Pill tone={HEALTH[h].tone}>{HEALTH[h].label}</Pill>
                <ArrowRight size={15} className="text-[#8A94A6]" aria-hidden />
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#EDF0F5] px-5 py-3.5">
          <span className="text-[13px] text-[#5B6577]">Back from a mission or an activity?</span>
          <button type="button" className={btnOutline} onClick={() => navigate("/dashboard/employee-portal/reports/new")}><FileText size={15} /> Mission or activity report</button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ department plan
function DepartmentTab({ isHead }: { isHead: boolean }) {
  const navigate = useNavigate();
  const [month, setMonth] = React.useState(today());
  const q = useQuery(["dept-view", month], () => plansApi.department(month), { keepPreviousData: true });
  const shift = (d: number) => {
    const x = new Date(`${month.slice(0, 7)}-01T12:00:00Z`);
    x.setUTCMonth(x.getUTCMonth() + d);
    setMonth(x.toISOString().slice(0, 10));
  };
  const plan = q.data?.plan;
  return (
    <div className="flex flex-col gap-[18px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <button type="button" aria-label="Previous month" onClick={() => shift(-1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white hover:bg-[#F1F4F9]"><ChevronLeft size={16} /></button>
          <span className="min-w-[150px] text-center text-[15px] font-extrabold">{q.data?.period.label || "…"}</span>
          <button type="button" aria-label="Next month" onClick={() => shift(1)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-[#DDE3EC] bg-white hover:bg-[#F1F4F9]"><ChevronRight size={16} /></button>
          {month.slice(0, 7) !== today().slice(0, 7) && <button type="button" onClick={() => setMonth(today())} className="h-9 rounded-lg px-3 text-[13px] font-bold text-[#1466C0] hover:bg-[#EAF2FC]">This month</button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {plan && <button type="button" className={btnOutline} onClick={() => navigate(`/dashboard/my/plans/${plan.id}`)}>Open {plan.number}</button>}
          {isHead && !plan && q.data && <button type="button" className={btnPrimary} onClick={() => navigate(`/dashboard/my/plans/new?type=department&date=${q.data!.period.start}`)}><Flag size={15} /> Prepare the {q.data.period.label} plan</button>}
          {!isHead && plan && <button type="button" className={btnPrimary} onClick={() => navigate(`/dashboard/my/plans/new?type=monthly&date=${q.data!.period.start}`)}><Plus size={15} /> Contribute in my monthly plan</button>}
        </div>
      </div>
      <DepartmentActivitiesCard view={q.data} loading={q.isLoading}
        empty={isHead ? `No department plan for ${q.data?.period.label || "this month"} yet. Prepare it: the month's shared activities with a target each; staff contribute from their monthly plans.` : undefined} />
      {plan && (
        <p className="text-[12.5px] text-[#5B6577]">
          {plan.number} · prepared by {plan.head} · {PLAN_STATUS[plan.status]?.label || plan.status}. Achievement adds up the results recorded in staff monthly plans and tasks approved for this month.
        </p>
      )}
    </div>
  );
}

// ------------------------------------------------------------------ team (supervisors)
function TeamTab({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const [filter, setFilter] = React.useState<"todo" | "all">("todo");
  const q = useQuery(["team-plans", uid], () => pocketbase.collection("work_plans").getFullList({ filter: `staff != "${uid}" && (supervisor = "${uid}" || assigned_by = "${uid}" || staff.department.head = "${uid}")`, sort: "-updated", expand: "staff" }), { enabled: Boolean(uid) });
  const rows = (q.data || []) as any[];
  const todo = rows.filter((r) => r.supervisor === uid && (r.status === "submitted" || r.status === "reported"));
  const shown = filter === "todo" ? todo : rows;
  const now = new Date();
  return (
    <WCard flush className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-3 pt-[18px]">
        <WHead title="My team's plans" subtitle="Approve plans before the work starts, assess the reports, and assign tasks" />
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" className="flex rounded-[9px] bg-[#F1F4F9] p-[3px]">
            {([["todo", `Waiting for me ${todo.length}`], ["all", `All ${rows.length}`]] as const).map(([k, l]) => (
              <button key={k} type="button" aria-pressed={filter === k} onClick={() => setFilter(k)} className={cn("h-[32px] rounded-[7px] px-3 text-[13px] font-bold", filter === k ? "bg-white text-[#0B3A6F] shadow-[0_1px_2px_rgba(20,33,61,.12)]" : "text-[#5B6577]")}>{l}</button>
            ))}
          </div>
          <button type="button" className={btnPrimary} onClick={() => navigate("/dashboard/my/plans/new?assign=1")}><UserPlus size={15} /> Assign work</button>
        </div>
      </div>
      {q.isLoading ? <div className="px-5 pb-5"><Skeleton className="h-32 w-full" /></div> : !shown.length ? <p className="border-t border-[#EDF0F5] px-5 py-8 text-center text-[13.5px] text-[#5B6577]">{filter === "todo" ? "Nothing waiting for you." : "Your team has no plan yet."}</p> : (
        <div className="overflow-x-auto border-t border-[#E3E8EF]">
          <table className={cn(GRID, "min-w-[960px]")}>
            <thead>
              <tr className="bg-[#F8FAFC]">
                <th scope="col" className={cn(TH, "pl-5")}>Staff member</th>
                <th scope="col" className={TH}>Plan</th>
                <th scope="col" className={TH}>Achieved</th>
                <th scope="col" className={TH}>Health</th>
                <th scope="col" className={cn(TH, "text-center")}>Issues</th>
                <th scope="col" className={TH}>Status</th>
                <th scope="col" className={cn(TH, "pr-5 text-right")}>Your action</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((r) => {
                const h = healthOf(r, now);
                const st = statusOf(r, now);
                const issues = openIssues(r);
                const mine = r.supervisor === uid;
                const action = mine && r.status === "submitted" ? "Approve or return" : mine && r.status === "reported" ? "Assess the report" : "";
                return (
                  <tr key={r.id} onClick={() => navigate(`/dashboard/my/plans/${r.id}`)} className="cursor-pointer border-t border-[#E3E8EF] hover:[&>td]:bg-[#F8FAFD]">
                    <td className="whitespace-nowrap py-3 pl-5 pr-3.5 font-bold">{r.expand?.staff?.name}</td>
                    <td className="max-w-[340px] px-3.5 py-3">
                      <span className="line-clamp-2 font-semibold leading-snug">{planTitle(r)}</span>
                      <span className="block text-[12.5px] text-[#5B6577]">{r.period_label} · {(r.items || []).length} {TYPE_INFO[r.plan_type as PlanKind]?.items.toLowerCase()}</span>
                    </td>
                    <td className="min-w-[110px] px-3.5 py-3"><b className="block text-[14px] tabular-nums">{r.progress}%</b><Bar value={r.progress} health={h} className="mt-1 w-full" /></td>
                    <td className="whitespace-nowrap px-3.5 py-3"><Pill tone={HEALTH[h].tone}>{HEALTH[h].label}</Pill></td>
                    <td className="whitespace-nowrap px-3.5 py-3 text-center">{issues ? <span className="rounded-full bg-[#FDE8E7] px-2 py-0.5 text-[12.5px] font-bold text-[#B42318]">{issues} open</span> : <span className="text-[12.5px] text-[#8A94A6]">None</span>}</td>
                    <td className="whitespace-nowrap px-3.5 py-3"><Pill tone={st.tone}>{st.label}</Pill></td>
                    <td className="whitespace-nowrap py-3 pl-3.5 pr-5 text-right">{action ? <span className="text-[13px] font-bold text-[#1466C0]">{action} →</span> : <span className="text-[12.5px] text-[#8A94A6]">Nothing to do</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="border-t border-[#EDF0F5] px-5 py-3 text-[12.5px] text-[#5B6577]">
        <b className="text-[#36435A]">{PLAN_STATUS.submitted.label}:</b> approve the plan, or return it with a comment. <b className="text-[#36435A]">{PLAN_STATUS.reported.label}:</b> rate the work and give feedback.
      </p>
    </WCard>
  );
}
