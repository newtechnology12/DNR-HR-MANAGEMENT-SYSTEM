/**
 * My plans & reports: the staff member's plans along the planning cycle (fiscal year → quarter → month →
 * week) and the tasks assigned to them, with the health of each (achievement against the time passed),
 * open issues and the supervisor's rating; the department's plan they contribute to; mission / activity
 * reports; and — for supervisors — the team's plans to approve and reports to assess, and work to assign.
 */
import * as React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { format } from "date-fns";
import { ArrowRight, CalendarPlus, ChevronLeft, ChevronRight, ClipboardCheck, ExternalLink, FileText, Flag, Pencil, Plus, Send, UserPlus } from "lucide-react";
import type { RecordModel } from "pocketbase";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import {
  HEALTH, LEVELS, LEVEL_ORDER, PLAN_STATUS, PlanKind, TYPE_INFO, dayOf, healthOf, openIssues, originOf, planTitle, plansApi, statusOf,
} from "@/lib/plans";
import { DepartmentActivitiesCard } from "@/components/workspace/DepartmentActivities";
import { useMe } from "@/components/portal/kit";
import { Skeleton } from "@/components/ui/skeleton";
import ReportsTab from "@/pages/portal/ReportsTab";
import {
  Button,
  Card,
  CardHeader,
  Column,
  DataTable,
  DocNo,
  EmptyState,
  FilterBar,
  FilterChip,
  FilterSelect,
  Kpi,
  KpiBand,
  Modal,
  Page,
  PageHeader,
  Pager,
  Person,
  StatusPill,
  Tabs,
  TwoLine,
} from "@/components/ims";
import { Stars } from "./PlanDetail";
import { cn } from "@/utils";

const today = () => format(new Date(), "yyyy-MM-dd");
const EXPAND = "supervisor,assigned_by,assigned_by.designation,parent";
const LIST = "/dashboard/my/plans";

export default function MyPlans() {
  const [params, setParams] = useSearchParams();
  const { user }: any = useAuth();
  const uid: string = user?.id || "";
  const me = useMe();
  const tab = params.get("tab") || "plans";
  const [reporting, setReporting] = React.useState(false);
  const waiting = useQuery(["plans-supervising", uid], () => pocketbase.collection("work_plans").getList(1, 1, { filter: `supervisor = "${uid}" && staff != "${uid}" && (status = "submitted" || status = "reported")`, fields: "id" }).then((r) => r.totalItems), { enabled: Boolean(uid) });
  const team = useQuery(["plans-team-size", uid], () => pocketbase.send("/api/ims/plans/team", {}).then((r: any) => (r.items || []).length as number), { enabled: Boolean(uid), staleTime: 300_000 });
  const showTeam = Boolean((team.data || 0) > 0 || (waiting.data || 0) > 0);
  const setTab = (k: string) => setParams(k === "plans" ? {} : { tab: k });

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "My workspace", to: "/dashboard/my" }, { label: "My plans & reports" }]}
        title="My plans & reports"
        subtitle="Plan your work from the annual performance contract down to each week, and report on it to your supervisor."
        primary={{ label: "New plan", icon: Plus, to: `${LIST}/new` }}
        secondary={[{ label: "Submit report", icon: Send, onClick: () => setReporting(true) }]}
      />
      <Tabs
        label="Plans and reports"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "plans", label: "My plans" },
          { key: "department", label: "Department plan" },
          { key: "reports", label: "Reports" },
          ...(showTeam ? [{ key: "team", label: "My team", count: waiting.data || undefined }] : []),
        ]}
      />
      {tab === "plans" && <PlansTab uid={uid} />}
      {tab === "department" && <DepartmentTab isHead={Boolean(me.data?.isHead)} />}
      {tab === "reports" && <ReportsTab employeeId={uid} />}
      {tab === "team" && <TeamTab uid={uid} />}
      {reporting && <SubmitReportDialog uid={uid} onClose={() => setReporting(false)} />}
    </Page>
  );
}

function useMyPlans(uid: string) {
  return useQuery(["my-plans", uid], () => pocketbase.collection("work_plans").getFullList({ filter: `staff = "${uid}"`, sort: "-period_start", expand: EXPAND }), { enabled: Boolean(uid) });
}

/** Thin progress bar coloured by health. */
function Bar({ value, health, className }: { value: number; health: keyof typeof HEALTH; className?: string }) {
  return (
    <span className={cn("block h-[6px] overflow-hidden rounded-full bg-ims-neutral-bg", className)} aria-hidden>
      <span className="block h-full rounded-full" style={{ width: `${Math.max(0, Math.min(100, value))}%`, background: HEALTH[health].bar }} />
    </span>
  );
}

/** Health is not a status: a coloured dot and the word. */
export function HealthTag({ health, small }: { health: keyof typeof HEALTH; small?: boolean }) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap font-semibold", small ? "text-t-small" : "text-t-body", HEALTH[health].text)}>
      <span className={cn("h-2 w-2 shrink-0 rounded-full", HEALTH[health].dot)} aria-hidden />
      {HEALTH[health].label}
    </span>
  );
}

/** Achieved % with the health bar and word under it (table cells). */
function AchievedCell({ value, health }: { value: number; health: keyof typeof HEALTH }) {
  return (
    <span className="ml-auto block w-[96px]">
      <b className="block tabular-nums">{value}%</b>
      <Bar value={value} health={health} className="mt-1 w-full" />
      <span className="mt-1 flex justify-end"><HealthTag health={health} small /></span>
    </span>
  );
}

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

/** Status in the glossary and the next step under it. */
function statusView(p: RecordModel & { status: string; period_start: string }, now: Date) {
  const st = statusOf(p, now);
  const who = p.expand?.supervisor?.name || "your supervisor";
  const starts = p.period_start ? format(new Date(`${dayOf(p.period_start)}T12:00:00`), "d MMM") : "";
  const ends = p.period_end ? format(new Date(`${dayOf(p.period_end)}T12:00:00`), "d MMM") : "";
  const next: Record<string, string> = {
    draft: "Not sent yet",
    submitted: `With ${who}`,
    returned: "Correct and send again",
    approved: st.label === "Approved" ? (starts ? `Starts ${starts}` : "Not started yet") : ends ? `Report by ${ends}` : "Recording progress",
    reported: `With ${who} · report`,
    assessed: "Feedback received",
  };
  return { tone: st.tone, label: st.label, next: next[p.status] ?? st.note ?? "" };
}

/** Health colours explained in plain words (same thresholds as healthOf in lib/plans). */
function HealthLegend() {
  const items: [keyof typeof HEALTH, string][] = [
    ["on_track", "no more than 10 points behind the time that has passed"],
    ["at_risk", "10 to 25 points behind"],
    ["off_track", "more than 25 points behind"],
    ["completed", "done or reported"],
    ["not_started", "the period has not begun"],
  ];
  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">
      <span className="font-bold text-ims-body">Health</span>
      {items.map(([k, text]) => (
        <span key={k} className="inline-flex items-center gap-1.5">
          <HealthTag health={k} small /> <span>{text}</span>
        </span>
      ))}
    </div>
  );
}

const HEALTH_KPI: Record<keyof typeof HEALTH, Kpi["tone"]> = { not_started: "default", on_track: "default", at_risk: "warning", off_track: "danger", completed: "success" };
const THIS: Record<string, string> = { annual: "This year", quarterly: "This quarter", monthly: "This month", weekly: "This week" };

// ------------------------------------------------------------------ my plans
function PlansTab({ uid }: { uid: string }) {
  const navigate = useNavigate();
  const q = useMyPlans(uid);
  const plans = (q.data || []) as any[];
  const [search, setSearch] = React.useState("");
  const [origin, setOrigin] = React.useState<"all" | "assigned" | "own">("all");
  const [level, setLevel] = React.useState<"" | PlanKind>("");
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(15);

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
  React.useEffect(() => setPage(1), [needle, origin, level, perPage]);
  const shown = rows.slice((page - 1) * perPage, page * perPage);
  const open = (p: any) => navigate(`${LIST}/${p.id}`);

  const kpis: Kpi[] = cycle.map(({ k, plan }) => {
    if (!plan) return { label: THIS[k], value: "—", sub: `${TYPE_INFO[k].label} · plan it now`, to: `${LIST}/new?type=${k}` };
    const h = healthOf(plan, now);
    const period = periodParts(plan.period_label);
    return { label: THIS[k], value: `${plan.progress}%`, tone: HEALTH_KPI[h], sub: `${HEALTH[h].label} · ${period.sub || period.main}`, to: `${LIST}/${plan.id}` };
  });

  const chips: FilterChip[] = [
    ...(origin !== "all" ? [{ key: "origin", label: `Origin: ${origin === "assigned" ? "Assigned to me" : "My own"}`, onRemove: () => setOrigin("all") }] : []),
    ...(level ? [{ key: "level", label: `Level: ${TYPE_INFO[level].label}`, onRemove: () => setLevel("") }] : []),
  ];

  const columns: Column<any>[] = [
    {
      key: "plan",
      header: "Plan",
      className: "min-w-[240px] max-w-[320px]",
      cell: (p) => {
        const o = originTag(p);
        return (
          <TwoLine
            main={planTitle(p)}
            sub={
              <span className="inline-flex flex-wrap items-center gap-x-1.5" title={o.full}>
                <DocNo value={p.number} />
                <span aria-hidden>·</span>
                <span className={o.assigned ? "font-semibold text-ims-body" : undefined}>{o.text}</span>
              </span>
            }
          />
        );
      },
    },
    { key: "period", header: "Period", nowrap: true, cell: (p) => <span className="font-semibold">{periodParts(p.period_label).main}</span>, sub: (p) => periodParts(p.period_label).sub },
    { key: "supervisor", header: "Supervisor", className: "min-w-[140px]", cell: (p) => (p.expand?.supervisor?.name ? <Person name={p.expand.supervisor.name} /> : <span className="text-ims-faint">Not set</span>) },
    { key: "achieved", header: "Achieved · health", numeric: true, cell: (p) => <AchievedCell value={p.progress} health={healthOf(p, now)} /> },
    {
      key: "issues",
      header: "Open issues",
      numeric: true,
      cell: (p) => {
        const n = openIssues(p);
        return n ? <span className="font-bold text-ims-danger">{n}</span> : <span className="text-ims-faint">—</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      nowrap: true,
      cell: (p) => {
        const s = statusView(p, now);
        return <StatusPill status={s.label} sub={s.next || undefined} />;
      },
    },
    { key: "rating", header: "Rating", nowrap: true, cell: (p) => (p.supervisor_rating ? <Stars value={p.supervisor_rating} size={13} /> : <span className="text-t-small text-ims-faint">Not rated</span>) },
  ];

  return (
    <>
      <KpiBand items={kpis} loading={q.isLoading} />

      <Card padded={false} className="overflow-hidden">
        <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
          <CardHeader
            className="mb-0"
            title="All my plans"
            subtitle={q.isLoading ? "Loading…" : `${plans.length} plan${plans.length === 1 ? "" : "s"} · ${assigned.length} assigned to you · open one to update progress or report`}
          />
        </div>
        {!q.isLoading && !plans.length ? (
          <EmptyState
            icon={ClipboardCheck}
            text="No plan yet. Start at the top: agree your annual performance contract with your supervisor, then plan the quarter, the month and the week. Work your supervisor assigns to you appears here too."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="primary" icon={Flag} onClick={() => navigate(`${LIST}/new?type=annual`)}>Start my annual contract</Button>
                <Button icon={CalendarPlus} onClick={() => navigate(`${LIST}/new?type=weekly`)}>Plan this week</Button>
              </div>
            }
          />
        ) : (
          <>
            <FilterBar
              search={{ value: search, onChange: setSearch, placeholder: "Search plan, number or supervisor" }}
              chips={chips}
              onClear={() => { setOrigin("all"); setLevel(""); }}
            >
              <FilterSelect
                label="Origin"
                value={origin === "all" ? "" : origin}
                onChange={(v) => setOrigin((v || "all") as "all" | "assigned" | "own")}
                options={[{ value: "assigned", label: `Assigned to me (${assigned.length})` }, { value: "own", label: `My own (${plans.length - assigned.length})` }]}
              />
              <FilterSelect label="Level" value={level} onChange={(v) => setLevel(v as PlanKind | "")} options={LEVELS.map((k) => ({ value: k, label: TYPE_INFO[k].label }))} />
            </FilterBar>
            <DataTable
              columns={columns}
              rows={shown}
              rowKey={(p) => p.id}
              onRowClick={open}
              loading={q.isLoading}
              error={q.isError ? q.error : undefined}
              onRetry={() => q.refetch()}
              minWidth={960}
              caption="All my plans"
              rowActions={(p) => [
                { label: "Open", icon: ExternalLink, onSelect: open },
                ...(["draft", "returned"].includes(p.status) ? [{ label: "Edit", icon: Pencil, onSelect: () => navigate(`${LIST}/${p.id}/edit`) }] : []),
                ...(p.status === "approved" ? [{ label: "Write the report", icon: FileText, onSelect: () => navigate(`${LIST}/${p.id}?report=1`) }] : []),
              ]}
              empty={<EmptyState compact text="No plan matches these filters. Change the search or clear the filters." />}
              footer={rows.length > 0 ? <Pager page={page} perPage={perPage} total={rows.length} onPage={setPage} onPerPage={setPerPage} /> : null}
            />
            <HealthLegend />
          </>
        )}
      </Card>
    </>
  );
}

// ------------------------------------------------------------------ submit report
function SubmitReportDialog({ uid, onClose }: { uid: string; onClose: () => void }) {
  const navigate = useNavigate();
  const q = useMyPlans(uid);
  const now = new Date();
  const due = ((q.data || []) as any[]).filter((p) => p.status === "approved").sort((a, b) => String(a.period_end).localeCompare(String(b.period_end)));
  return (
    <Modal
      open
      onClose={onClose}
      title="Submit a report"
      description="Choose the work you are reporting on. Your supervisor assesses the report."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button icon={FileText} onClick={() => navigate("/dashboard/employee-portal/reports/new")}>Mission or activity report</Button>
        </>
      }
    >
      {q.isLoading ? (
        <Skeleton className="h-24 w-full" />
      ) : !due.length ? (
        <EmptyState compact icon={FileText} text="No approved plan is waiting for a report. Plans are reported once your supervisor has approved them." />
      ) : (
        <ul className="-mx-2 divide-y divide-ims-divider">
          {due.map((p) => {
            const h = healthOf(p, now);
            const ended = dayOf(p.period_end) <= today();
            return (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => navigate(`${LIST}/${p.id}?report=1`)}
                  className="flex w-full items-center gap-3 rounded-control px-2 py-3 text-left hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-t-body font-bold text-ims-text">{planTitle(p)}</span>
                    <span className="block text-t-small text-ims-muted">{p.period_label} · {p.progress}% achieved{ended ? " · period ended" : ""}</span>
                  </span>
                  <HealthTag health={h} small />
                  <ArrowRight size={15} className="shrink-0 text-ims-faint" aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Modal>
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
  const st = plan ? PLAN_STATUS[plan.status] : undefined;
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2" role="group" aria-label="Month">
          <Button size="icon" icon={ChevronLeft} aria-label="Previous month" onClick={() => shift(-1)} />
          <span className="min-w-[150px] text-center text-t-section text-ims-text">{q.data?.period.label || "…"}</span>
          <Button size="icon" icon={ChevronRight} aria-label="Next month" onClick={() => shift(1)} />
          {month.slice(0, 7) !== today().slice(0, 7) && <Button variant="link" className="ml-1" onClick={() => setMonth(today())}>This month</Button>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {plan && <Button icon={ExternalLink} onClick={() => navigate(`${LIST}/${plan.id}`)}>Open {plan.number}</Button>}
          {isHead && !plan && q.data && <Button icon={Flag} onClick={() => navigate(`${LIST}/new?type=department&date=${q.data!.period.start}`)}>Prepare the {q.data.period.label} plan</Button>}
          {!isHead && plan && <Button icon={Plus} onClick={() => navigate(`${LIST}/new?type=monthly&date=${q.data!.period.start}`)}>Contribute in my monthly plan</Button>}
        </div>
      </div>
      <DepartmentActivitiesCard
        view={q.data}
        loading={q.isLoading}
        empty={isHead ? `No department plan for ${q.data?.period.label || "this month"} yet. Prepare it: the month's shared activities with a target each; staff contribute from their monthly plans.` : undefined}
      />
      {plan && (
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-t-small text-ims-muted">
          <DocNo value={plan.number} />
          <span>· prepared by {plan.head} ·</span>
          <StatusPill status={st?.label || plan.status} />
          <span>Achievement adds up the results recorded in staff monthly plans and tasks approved for this month.</span>
        </p>
      )}
    </>
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
  const open = (r: any) => navigate(`${LIST}/${r.id}`);

  /** Who must act now: you (approve / assess), their supervisor, or the staff member. */
  const withCell = (r: any) => {
    const mine = r.supervisor === uid;
    if (r.status === "submitted") return mine ? <Person name="You" detail="Approve or return" /> : <Person name="Their supervisor" detail="To approve" />;
    if (r.status === "reported") return mine ? <Person name="You" detail="Assess the report" /> : <Person name="Their supervisor" detail="To assess" />;
    if (r.status === "draft" || r.status === "returned") return <Person name={r.expand?.staff?.name} detail={r.status === "returned" ? "Correcting the plan" : "Preparing the plan"} />;
    if (r.status === "approved") return <Person name={r.expand?.staff?.name} detail="Recording progress" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: Column<any>[] = [
    { key: "staff", header: "Staff member", className: "min-w-[150px]", cell: (r) => <Person name={r.expand?.staff?.name} /> },
    { key: "plan", header: "Plan", clamp: true, className: "min-w-[240px] max-w-[340px]", cell: (r) => <span className="font-semibold">{planTitle(r)}</span>, sub: (r) => `${r.period_label} · ${(r.items || []).length} ${TYPE_INFO[r.plan_type as PlanKind]?.items.toLowerCase()}` },
    { key: "achieved", header: "Achieved · health", numeric: true, cell: (r) => <AchievedCell value={r.progress} health={healthOf(r, now)} /> },
    {
      key: "issues",
      header: "Open issues",
      numeric: true,
      cell: (r) => {
        const n = openIssues(r);
        return n ? <span className="font-bold text-ims-danger">{n}</span> : <span className="text-ims-faint">—</span>;
      },
    },
    {
      key: "status",
      header: "Status",
      nowrap: true,
      cell: (r) => {
        const st = statusOf(r, now);
        return <StatusPill status={st.label} sub={st.note} />;
      },
    },
    { key: "with", header: "With", className: "min-w-[150px]", cell: withCell },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-[18px] pt-[18px] sm:px-5 sm:pt-5">
        <CardHeader
          className="mb-0"
          title="My team's plans"
          subtitle="Approve plans before the work starts, assess the reports, and assign work."
          action={<Button icon={UserPlus} onClick={() => navigate(`${LIST}/new?assign=1`)}>Assign work</Button>}
        />
      </div>
      <FilterBar>
        <FilterSelect
          label="Show"
          all={false}
          value={filter}
          onChange={(v) => setFilter(v as "todo" | "all")}
          options={[{ value: "todo", label: `Waiting for me (${todo.length})` }, { value: "all", label: `All plans (${rows.length})` }]}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        rows={shown}
        rowKey={(r) => r.id}
        onRowClick={open}
        loading={q.isLoading}
        error={q.isError ? q.error : undefined}
        onRetry={() => q.refetch()}
        minWidth={900}
        caption="My team's plans"
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={<EmptyState compact icon={ClipboardCheck} text={filter === "todo" ? "Nothing is waiting for you." : "Your team has no plan yet."} />}
      />
      <p className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">
        <b className="text-ims-body">{PLAN_STATUS.submitted.label} · {PLAN_STATUS.submitted.note?.toLowerCase()}:</b> approve the plan, or return it with a comment.{" "}
        <b className="text-ims-body">{PLAN_STATUS.reported.label} · {PLAN_STATUS.reported.note?.toLowerCase()}:</b> rate the work and give feedback.
      </p>
    </Card>
  );
}
