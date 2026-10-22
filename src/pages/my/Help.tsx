/**
 * Help & HR policies: how things work for staff — hours and attendance, leave, public holidays, pay and
 * statutory deductions, requests and approvals, planning and reporting, who to contact. The figures are
 * read from the system's own settings and rate tables, so they are always the ones in force.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { format } from "date-fns";
import { CalendarDays, Clock, Coins, HelpCircle, Inbox, LifeBuoy, Mail, Plane, Plus, Target } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import useSettings from "@/hooks/useSettings";
import { BRAND } from "@/lib/brand";
import { Skeleton } from "@/components/ui/skeleton";
import { WLink } from "@/components/workspace/WorkspaceKit";
import { Card, CardHeader, Column, DataTable, Details, Page, PageHeader, fmtDate, fmtNumber, toDate } from "@/components/ims";
import { cn } from "@/utils";

const SECTIONS = [
  { id: "hours", label: "Working hours & attendance", icon: Clock },
  { id: "leave", label: "Leave", icon: Plane },
  { id: "holidays", label: "Public holidays", icon: CalendarDays },
  { id: "pay", label: "Pay & deductions", icon: Coins },
  { id: "requests", label: "Requests & approvals", icon: Inbox },
  { id: "planning", label: "Planning & reporting", icon: Target },
  { id: "contacts", label: "Who to contact", icon: LifeBuoy },
  { id: "faq", label: "Questions", icon: HelpCircle },
];

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAY_NAMES: Record<string, string> = { monday: "Monday", tuesday: "Tuesday", wednesday: "Wednesday", thursday: "Thursday", friday: "Friday", saturday: "Saturday", sunday: "Sunday" };
const BASES: Record<string, string> = { gross: "gross salary", gross_excl_transport: "gross salary without transport", basic: "basic salary", net_before_cbhi: "net salary" };
const time = (v?: string) => (v ? String(v).slice(0, 5) : "—");

const all = <T,>(collection: string, sort: string) => () => pocketbase.collection(collection).getFullList<T>({ sort }).catch(() => [] as T[]);

const REQUESTS = [
  { need: "Time off", request: "Leave request", who: "Your line manager, then HR", link: "/dashboard/my/leave" },
  { need: "A day I could not clock in", request: "Attendance correction", who: "HR", link: "/dashboard/my/attendance" },
  { need: "Money for an activity, paid back after", request: "Expense / salary advance", who: "Line manager and Finance", link: "/dashboard/my/expenses" },
  { need: "Small cash for an urgent purchase", request: "Petty cash", who: "Finance", link: "/dashboard/my/expenses?tab=petty" },
  { need: "A laptop, phone or other equipment", request: "Equipment request", who: "The asset officer", link: "/dashboard/my/equipment" },
  { need: "Goods or services bought by RALGA", request: "Purchase requisition", who: "Head of department, budget check, then procurement", link: "/dashboard/procurement/requisitions" },
  { need: "Approval of my work plan", request: "Work plan", who: "Your supervisor (head of department)", link: "/dashboard/my/plans" },
];

const PLANNING = [
  ["Annual performance contract", "At the start of the fiscal year (July). 3 to 6 objectives linked to RALGA's strategic objectives, each with an indicator, baseline, target and weight; agreed with your supervisor. Assessed at year end."],
  ["Quarterly plan", "Before each quarter (July, October, January, April): the outputs that move your annual objectives, with indicators and targets. Reported at quarter end."],
  ["Monthly plan", "Before each month: activities with expected outputs and due dates, linked to the department plan."],
  ["Weekly plan", "Each Monday: what you will do this week, day by day. On Friday update the progress and write the week's report."],
];

const FAQ = [
  ["I forgot to clock in. What do I do?", "Open My attendance, choose the day and ask for a correction with a short explanation. HR approves it and the day is recorded with the normal hours."],
  ["The clock-in button asks for my location.", "Allow location for this site in your browser (the lock icon next to the address). Your position is recorded only when you clock in or out."],
  ["How many leave days do I have left?", "My workspace and My leave show your balance: the days you are entitled to, taken, planned and left."],
  ["My leave request is still pending.", "My requests shows who has it now. Your line manager decides first, then HR; remind them if the date is close."],
  ["Who approves my plan?", "Your head of department. If you are a head of department, the Secretary General. You see the supervisor on the plan."],
  ["Can I change a plan after it is approved?", "You update the progress and the status of each item at any time. To change the content, ask your supervisor to return it, change it and send it again."],
  ["Where is my payslip?", "My payslips lists every approved month; open one to view or download the PDF. Amounts can be hidden on your workspace with the eye button."],
  ["I need to change my bank account.", "Send HR the new account details with a bank letter before the payroll is prepared for the month."],
];

const listClass = "mt-4 list-disc space-y-1.5 pl-5 text-t-body text-ims-body marker:text-ims-faint";

export default function Help() {
  const navigate = useNavigate();
  const { settings }: any = useSettings();
  const leaveTypes = useQuery(["help", "leave-types"], all<any>("leave_types", "sort,name"));
  const holidays = useQuery(["help", "holidays"], all<any>("public_holidays", "date"));
  const bands = useQuery(["help", "paye"], all<any>("paye_bands", "employment_type,min_amount"));
  const contributions = useQuery(["help", "contributions"], all<any>("statutory_contributions", "sort"));
  const departments = useQuery(["help", "departments"], () => pocketbase.collection("departments").getFullList({ sort: "name", expand: "head", fields: "id,name,head,expand.head.name,expand.head.email,expand.head.phone" }).catch(() => [] as any[]));
  const [active, setActive] = React.useState("hours");

  React.useEffect(() => {
    const els = SECTIONS.map((s) => document.getElementById(s.id)).filter(Boolean) as HTMLElement[];
    if (!("IntersectionObserver" in window) || !els.length) return;
    const io = new IntersectionObserver((entries) => {
      const top = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
      if (top) setActive(top.target.id);
    }, { rootMargin: "-80px 0px -60% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [leaveTypes.isLoading]);

  const working: string[] = settings?.working_days?.length ? settings.working_days : ["monday", "tuesday", "wednesday", "thursday", "friday"];
  const year = new Date().getFullYear();
  const thisYear = ((holidays.data || []) as any[]).filter((h) => toDate(h.date)?.getFullYear() === year);
  const today = format(new Date(), "yyyy-MM-dd");
  const regular = ((bands.data || []) as any[]).filter((b) => b.active !== false && b.employment_type === "regular" && (!b.effective_to || String(b.effective_to).slice(0, 10) >= today));
  const deptOf = (re: RegExp) => ((departments.data || []) as any[]).find((d) => re.test(d.name));
  const hr = deptOf(/human resources/i);
  const ict = deptOf(/\bict\b|information/i);
  const finance = deptOf(/finance/i);

  const leaveColumns: Column<any>[] = [
    { key: "name", header: "Type of leave", cell: (t) => <span className="font-semibold text-ims-text">{t.name}</span>, sub: (t) => (t.eligible_gender && t.eligible_gender !== "any" ? (t.eligible_gender === "female" ? "Female staff" : "Male staff") : undefined) },
    { key: "days", header: "Days", numeric: true, cell: (t) => (t.days_per_year ? t.days_per_year : "—"), sub: (t) => (t.days_per_year ? `${t.day_basis === "calendar" ? "calendar" : "working"} days` : undefined) },
    { key: "paid", header: "Paid", cell: (t) => (t.paid ? "Yes" : "No") },
    { key: "doc", header: "Document", cell: (t) => (t.requires_attachment ? (t.attachment_after_days ? `After ${t.attachment_after_days} day(s)` : "Required") : "—") },
    { key: "notes", header: "Notes", className: "min-w-[260px] text-ims-body", cell: (t) => [t.description, t.deducts_annual && t.category !== "annual" ? "Taken from annual leave." : "", t.legal_reference].filter(Boolean).join(" ") || "—" },
  ];
  const payeColumns: Column<any>[] = [
    { key: "band", header: "Monthly taxable pay (RWF)", numeric: true, align: "left", cell: (b) => (b.max_amount ? `${fmtNumber(b.min_amount)} – ${fmtNumber(b.max_amount)}` : `Above ${fmtNumber(b.min_amount)}`) },
    { key: "rate", header: "Rate", numeric: true, cell: (b) => <span className="font-semibold">{b.rate}%</span> },
  ];
  const contributionColumns: Column<any>[] = [
    { key: "name", header: "Contribution", cell: (c) => c.name, sub: (c) => `On ${BASES[c.base] || c.base}${c.remit_to ? ` · paid to ${c.remit_to}` : ""}` },
    { key: "you", header: "You", numeric: true, cell: (c) => (c.employee_rate ? <span className="font-semibold">{c.employee_rate}%</span> : "—") },
    { key: "ralga", header: "RALGA", numeric: true, cell: (c) => (c.employer_rate ? <span className="font-semibold">{c.employer_rate}%</span> : "—") },
  ];
  const requestColumns: Column<(typeof REQUESTS)[number]>[] = [
    { key: "need", header: "I need…", cell: (r) => r.need },
    { key: "request", header: "Request", nowrap: true, cell: (r) => <WLink to={r.link} className="text-t-body">{r.request}</WLink> },
    { key: "who", header: "Who decides", className: "text-ims-body", cell: (r) => r.who },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Help & HR policies" }]}
        title="Help & HR policies"
        subtitle="How hours, leave, pay, requests and planning work at RALGA, with the figures in force today."
      />
      <div className="grid gap-4 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-4 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  aria-current={active === s.id ? "location" : undefined}
                  className={cn(
                    "flex items-center gap-2 rounded-r-control border-l-[3px] px-3 py-2 text-t-body font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
                    active === s.id ? "border-ims-link bg-ims-info-bg text-ims-primary" : "border-transparent text-ims-muted hover:bg-ims-subtle hover:text-ims-text"
                  )}
                >
                  <s.icon size={15} aria-hidden /> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <Section id="hours" title="Working hours & attendance" subtitle="Clock in when you arrive and clock out when you leave, from My workspace">
            <div className="rounded-control bg-ims-thead px-4 py-3.5">
              <Details
                columns={3}
                items={[
                  { label: "Working days", value: <span className="font-semibold">{working.map((d) => DAY_NAMES[d] || d).join(", ")}</span> },
                  { label: "Working hours", value: <span className="font-semibold tabular-nums">{time(settings?.work_start_time)} – {time(settings?.work_end_time)}</span> },
                  { label: "Earliest clock-in", value: <span className="font-semibold">{settings?.early_clockin_mins ? `${settings.early_clockin_mins} minutes before the start` : "At the start time"}</span> },
                ]}
              />
            </div>
            <ul className={listClass}>
              <li>Clocking in after {time(settings?.work_start_time)} counts as <b className="text-ims-text">late</b>; your calendar shows those days in orange.</li>
              <li>Your location is recorded with each clock-in and clock-out; allow location in the browser.</li>
              <li>On mission, in training or at a meeting outside the office? Ask for an <b className="text-ims-text">attendance correction</b> from <WLink to="/dashboard/my/attendance" className="text-t-body">My attendance</WLink> and attach the mission order or invitation. HR approves it and the day is recorded.</li>
              <li>Days on approved leave and public holidays are filled in automatically.</li>
            </ul>
          </Section>

          <Section id="leave" title="Leave" subtitle="Request leave from My leave; your line manager approves, then HR">
            <div className="overflow-hidden rounded-control border border-ims-border">
              <DataTable
                columns={leaveColumns}
                rows={((leaveTypes.data || []) as any[]).filter((t) => t.active !== false)}
                rowKey={(t) => t.id}
                loading={leaveTypes.isLoading}
                minWidth={680}
                caption="Types of leave"
                empty={<p className="px-5 py-8 text-center text-t-body text-ims-muted">HR has not set up the types of leave yet.</p>}
              />
            </div>
            <ul className={listClass}>
              {Number(settings?.leave_accrual_per_month) > 0 && <li>Annual leave builds up at <b className="text-ims-text">{settings.leave_accrual_per_month} day(s) per month</b> worked.</li>}
              {Number(settings?.leave_seniority_extra_days) > 0 && <li>Seniority: <b className="text-ims-text">+{settings.leave_seniority_extra_days} day(s)</b> every {settings.leave_seniority_every_years || 3} years of service{settings.leave_seniority_max_days ? `, up to ${settings.leave_seniority_max_days} extra days` : ""}.</li>}
              <li>Plan your annual leave for the year in the <WLink to="/dashboard/leave-plan" className="text-t-body">leave plan</WLink>{settings?.leave_plan_start_month ? ` (the plan year starts in ${MONTHS[(Number(settings.leave_plan_start_month) || 1) - 1]})` : ""}; requests follow the plan where possible.</li>
              <li>Ask early: your line manager needs to arrange the handover of your work.</li>
            </ul>
          </Section>

          <Section id="holidays" title={`Public holidays ${year}`} subtitle="Days off for everyone; they do not count as leave">
            {holidays.isLoading ? <Skeleton className="h-24 w-full" /> : !thisYear.length ? <p className="text-t-body text-ims-muted">HR has not recorded this year's public holidays yet.</p> : (
              <ul className="grid gap-x-8 sm:grid-cols-2">
                {thisYear.map((h) => {
                  const d = toDate(h.date) as Date;
                  const past = format(d, "yyyy-MM-dd") < today;
                  return (
                    <li key={h.id} className={cn("flex items-baseline gap-3 border-b border-ims-divider py-2.5 text-t-body", past ? "text-ims-faint" : "text-ims-text")}>
                      <span className="w-[104px] shrink-0 whitespace-nowrap font-semibold tabular-nums">{fmtDate(d)}</span>
                      <span className="min-w-0 flex-1">
                        {h.name}
                        <span className={cn("block text-t-small", past ? "text-ims-faint" : "text-ims-muted")}>
                          {format(d, "EEEE")}
                          {!h.confirmed && <span className={past ? "" : "text-ims-warning"}> · date to be confirmed</span>}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section id="pay" title="Pay & deductions" subtitle="Your payslip shows each line; download it from My payslips">
            <p className="text-t-body text-ims-body">Salaries are paid monthly once the payroll is approved. From your gross salary the law requires income tax (PAYE) and social security contributions; RALGA pays its own share on top.</p>
            <div className="mt-4 grid gap-4 xl:grid-cols-2">
              <div className="min-w-0">
                <h3 className="mb-2 text-t-label text-ims-text">Income tax (PAYE) on monthly taxable pay</h3>
                <div className="overflow-hidden rounded-control border border-ims-border">
                  <DataTable
                    columns={payeColumns}
                    rows={regular}
                    rowKey={(b) => b.id}
                    loading={bands.isLoading}
                    minWidth={320}
                    caption="PAYE bands"
                    empty={<p className="px-5 py-6 text-center text-t-body text-ims-muted">Not configured.</p>}
                  />
                </div>
              </div>
              <div className="min-w-0">
                <h3 className="mb-2 text-t-label text-ims-text">Contributions</h3>
                <div className="overflow-hidden rounded-control border border-ims-border">
                  <DataTable
                    columns={contributionColumns}
                    rows={((contributions.data || []) as any[]).filter((c) => c.active)}
                    rowKey={(c) => c.id}
                    loading={contributions.isLoading}
                    minWidth={360}
                    caption="Statutory contributions"
                    empty={<p className="px-5 py-6 text-center text-t-body text-ims-muted">Not configured.</p>}
                  />
                </div>
              </div>
            </div>
            <ul className={listClass}>
              <li>Salary advances and other agreed deductions are taken from the net pay as approved.</li>
              <li>Changed bank account, RSSB number or TIN? Tell HR with a copy of the document before the payroll is prepared.</li>
            </ul>
          </Section>

          <Section id="requests" title="Requests & approvals" subtitle="Start any request from My workspace; follow it in My requests">
            <div className="overflow-hidden rounded-control border border-ims-border">
              <DataTable columns={requestColumns} rows={REQUESTS} rowKey={(r) => r.request} onRowClick={(r) => navigate(r.link)} minWidth={600} caption="Which request to use and who decides" />
            </div>
            <p className="mt-4 text-t-body text-ims-body">You get a notification at each decision. If a request is returned, correct it and send it again; the history stays with it.</p>
          </Section>

          <Section id="planning" title="Planning & reporting" subtitle="The public-service planning cycle, from the year down to the week">
            <ol className="grid gap-3 md:grid-cols-2">
              {PLANNING.map(([t, d], i) => (
                <li key={t} className="flex gap-3 rounded-control border border-ims-border p-4">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ims-primary text-t-small font-extrabold text-white" aria-hidden>{i + 1}</span>
                  <span className="min-w-0">
                    <span className="block text-t-body font-bold text-ims-text">{t}</span>
                    <span className="mt-0.5 block text-t-small text-ims-body">{d}</span>
                  </span>
                </li>
              ))}
            </ol>
            <ul className={listClass}>
              <li>Each plan is sent to your supervisor, who approves it or returns it with comments. Heads of department send theirs to the Secretary General.</li>
              <li>Write SMART items: specific, measurable, achievable, relevant and time-bound. Say what will prove it (report, attendance list, publication).</li>
              <li>At the end of the period write the report (what was achieved, challenges, next steps) and rate yourself; your supervisor assesses it.</li>
              <li>Mission or activity reports go in <WLink to="/dashboard/my/plans?tab=reports" className="text-t-body">Reports</WLink>.</li>
            </ul>
            <p className="mt-3 text-t-small text-ims-muted">The timing above is the usual rhythm; HR confirms RALGA's own deadlines each year.</p>
          </Section>

          <Section id="contacts" title="Who to contact" subtitle="For anything this page does not answer">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Human Resources", "Leave, attendance, pay, contracts, training", hr],
                ["Finance and Administration", "Advances, petty cash, payments", finance],
                ["ICT and Digital Services", "Your account, password, equipment, this system", ict],
              ].map(([title, what, d]: any) => (
                <div key={title} className="min-w-0 rounded-control border border-ims-border p-4">
                  <h3 className="text-t-body font-bold text-ims-text">{d?.name || title}</h3>
                  <p className="mt-0.5 text-t-small text-ims-muted">{what}</p>
                  {d?.expand?.head && (
                    <p className="mt-2.5 text-t-body">
                      <span className="block font-semibold text-ims-text">{d.expand.head.name}</span>
                      {d.expand.head.email && (
                        <a href={`mailto:${d.expand.head.email}`} className="mt-0.5 flex min-w-0 items-center gap-1.5 text-t-small font-semibold text-ims-link hover:underline">
                          <Mail size={13} className="shrink-0" aria-hidden /> <span className="truncate">{d.expand.head.email}</span>
                        </a>
                      )}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {BRAND.supportEmail && (
              <p className="mt-4 text-t-body text-ims-body">
                System support: <a className="font-semibold text-ims-link hover:underline" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>
              </p>
            )}
          </Section>

          <Section id="faq" title="Questions" subtitle="The ones staff ask most">
            <div className="divide-y divide-ims-divider rounded-control border border-ims-border">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-sm text-t-body font-semibold text-ims-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus [&::-webkit-details-marker]:hidden">
                    {q}
                    <Plus size={17} aria-hidden className="shrink-0 text-ims-muted transition-transform group-open:rotate-45" />
                  </summary>
                  <p className="mt-2 text-t-body text-ims-body">{a}</p>
                </details>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </Page>
  );
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Card id={id} className="scroll-mt-4">
      <CardHeader title={title} subtitle={subtitle} />
      {children}
    </Card>
  );
}
