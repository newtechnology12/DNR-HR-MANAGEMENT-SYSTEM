/**
 * Help & HR policies: how things work for staff — hours and attendance, leave, public holidays, pay and
 * statutory deductions, requests and approvals, planning and reporting, who to contact. The figures are
 * read from the system's own settings and rate tables, so they are always the ones in force.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { format } from "date-fns";
import { CalendarDays, Clock, Coins, HelpCircle, Inbox, LifeBuoy, Mail, Plane, Target } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import useSettings from "@/hooks/useSettings";
import { BRAND } from "@/lib/brand";
import { Skeleton } from "@/components/ui/skeleton";
import { MyHeader, WCard, WHead, WLink, myPage, toDate } from "@/components/workspace/WorkspaceKit";
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
const num = (n: number) => Math.round(Number(n) || 0).toLocaleString("en-US");
const time = (v?: string) => (v ? String(v).slice(0, 5) : "—");

const all = <T,>(collection: string, sort: string) => () => pocketbase.collection(collection).getFullList<T>({ sort }).catch(() => [] as T[]);

export default function Help() {
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

  return (
    <main className={myPage}>
      <MyHeader title="Help & HR policies" subtitle="How things work at RALGA — hours, leave, pay, requests and planning. The figures below come from the system's settings, so they are the ones in force today." />
      <div className="grid gap-[18px] lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="hidden lg:block">
          <ul className="sticky top-4 space-y-0.5">
            {SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className={cn("flex items-center gap-2 rounded-lg px-3 py-2 text-[13.5px] font-semibold", active === s.id ? "bg-[#EAF2FC] text-[#0B3A6F] shadow-[inset_3px_0_0_#1466C0]" : "text-[#5B6577] hover:bg-[#F1F4F9] hover:text-[#14213D]")}>
                  <s.icon size={15} aria-hidden /> {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-col gap-[18px]">
          <Section id="hours" title="Working hours & attendance" subtitle="Clock in when you arrive and clock out when you leave, from My workspace">
            <Facts items={[
              ["Working days", working.map((d) => DAY_NAMES[d] || d).join(", ")],
              ["Working hours", `${time(settings?.work_start_time)} – ${time(settings?.work_end_time)}`],
              ["Earliest clock-in", settings?.early_clockin_mins ? `${settings.early_clockin_mins} minutes before the start` : "At the start time"],
            ]} />
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] text-[#36435A]">
              <li>Clocking in after {time(settings?.work_start_time)} counts as <b>late</b>; your calendar shows those days in orange.</li>
              <li>Your location is recorded with each clock-in and clock-out; allow location in the browser.</li>
              <li>On mission, in training or at a meeting outside the office? Ask for an <b>attendance correction</b> from <WLink to="/dashboard/my/attendance">My attendance</WLink> and attach the mission order or invitation. HR approves it and the day is recorded.</li>
              <li>Days on approved leave and public holidays are filled in automatically.</li>
            </ul>
          </Section>

          <Section id="leave" title="Leave" subtitle="Request leave from My leave; your line manager approves, then HR">
            {leaveTypes.isLoading ? <Skeleton className="h-40 w-full" /> : (
              <div className="overflow-x-auto rounded-xl border border-[#E3E8EF]">
                <table className="w-full min-w-[640px] text-[13.5px]">
                  <thead><tr className="bg-[#F8FAFC] text-left text-[12.5px] text-[#5B6577]"><th className="px-4 py-2.5 font-bold">Type of leave</th><th className="px-3 py-2.5 text-right font-bold">Days</th><th className="px-3 py-2.5 font-bold">Paid</th><th className="px-3 py-2.5 font-bold">Document</th><th className="px-4 py-2.5 font-bold">Notes</th></tr></thead>
                  <tbody>
                    {((leaveTypes.data || []) as any[]).filter((t) => t.active !== false).map((t) => (
                      <tr key={t.id} className="border-t border-[#EDF0F5] align-top">
                        <td className="px-4 py-2.5 font-semibold">{t.name}{t.eligible_gender && t.eligible_gender !== "any" ? <span className="block text-[12px] font-normal text-[#5B6577]">{t.eligible_gender === "female" ? "Female staff" : "Male staff"}</span> : null}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{t.days_per_year ? <>{t.days_per_year}<span className="block text-[11.5px] text-[#5B6577]">{t.day_basis === "calendar" ? "calendar" : "working"} days</span></> : "—"}</td>
                        <td className="px-3 py-2.5">{t.paid ? "Yes" : "No"}</td>
                        <td className="px-3 py-2.5 text-[12.5px]">{t.requires_attachment ? (t.attachment_after_days ? `After ${t.attachment_after_days} day(s)` : "Required") : "—"}</td>
                        <td className="px-4 py-2.5 text-[12.5px] text-[#36435A]">{[t.description, t.deducts_annual && t.category !== "annual" ? "Taken from annual leave." : "", t.legal_reference].filter(Boolean).join(" ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] text-[#36435A]">
              {Number(settings?.leave_accrual_per_month) > 0 && <li>Annual leave builds up at <b>{settings.leave_accrual_per_month} day(s) per month</b> worked.</li>}
              {Number(settings?.leave_seniority_extra_days) > 0 && <li>Seniority: <b>+{settings.leave_seniority_extra_days} day(s)</b> every {settings.leave_seniority_every_years || 3} years of service{settings.leave_seniority_max_days ? `, up to ${settings.leave_seniority_max_days} extra days` : ""}.</li>}
              <li>Plan your annual leave for the year in the <WLink to="/dashboard/leave-plan">leave plan</WLink>{settings?.leave_plan_start_month ? ` (the plan year starts in ${MONTHS[(Number(settings.leave_plan_start_month) || 1) - 1]})` : ""}; requests follow the plan where possible.</li>
              <li>Ask early: your line manager needs to arrange the handover of your work.</li>
            </ul>
          </Section>

          <Section id="holidays" title={`Public holidays ${year}`} subtitle="Days off for everyone; they do not count as leave">
            {holidays.isLoading ? <Skeleton className="h-24 w-full" /> : !thisYear.length ? <p className="text-[13.5px] text-[#5B6577]">HR has not recorded this year's public holidays yet.</p> : (
              <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                {thisYear.map((h) => {
                  const d = toDate(h.date) as Date;
                  const past = format(d, "yyyy-MM-dd") < today;
                  return (
                    <li key={h.id} className={cn("flex items-center gap-3 border-b border-[#EDF0F5] py-2 text-[13.5px]", past && "text-[#8A94A6]")}>
                      <span className="w-[92px] shrink-0 font-semibold tabular-nums">{format(d, "EEE d MMM")}</span>
                      <span className="min-w-0 flex-1">{h.name}{!h.confirmed && <span className="ml-1.5 text-[12px] text-[#8A5A00]">(date to be confirmed)</span>}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section id="pay" title="Pay & deductions" subtitle="Your payslip shows each line; download it from My payslips">
            <p className="text-[13.5px] text-[#36435A]">Salaries are paid monthly once the payroll is approved. From your gross salary the law requires income tax (PAYE) and social security contributions; RALGA pays its own share on top.</p>
            <div className="mt-3 grid gap-4 xl:grid-cols-2">
              <div>
                <p className="mb-1.5 text-[13px] font-bold">Income tax (PAYE) on monthly taxable pay</p>
                {bands.isLoading ? <Skeleton className="h-24 w-full" /> : !regular.length ? <p className="text-[13px] text-[#5B6577]">Not configured.</p> : (
                  <table className="w-full text-[13.5px]">
                    <tbody>
                      {regular.map((b) => (
                        <tr key={b.id} className="border-b border-[#EDF0F5]">
                          <td className="py-2 tabular-nums">{b.max_amount ? `RWF ${num(b.min_amount)} – ${num(b.max_amount)}` : `Above RWF ${num(b.min_amount)}`}</td>
                          <td className="py-2 text-right font-bold tabular-nums">{b.rate}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
              <div>
                <p className="mb-1.5 text-[13px] font-bold">Contributions</p>
                {contributions.isLoading ? <Skeleton className="h-24 w-full" /> : (
                  <table className="w-full text-[13.5px]">
                    <thead><tr className="text-left text-[12px] text-[#5B6577]"><th className="pb-1 font-semibold" /><th className="pb-1 text-right font-semibold">You</th><th className="pb-1 text-right font-semibold">RALGA</th></tr></thead>
                    <tbody>
                      {((contributions.data || []) as any[]).filter((c) => c.active).map((c) => (
                        <tr key={c.id} className="border-b border-[#EDF0F5] align-top">
                          <td className="py-2">{c.name}<span className="block text-[12px] text-[#5B6577]">on {BASES[c.base] || c.base}{c.remit_to ? ` · paid to ${c.remit_to}` : ""}</span></td>
                          <td className="py-2 text-right font-bold tabular-nums">{c.employee_rate ? `${c.employee_rate}%` : "—"}</td>
                          <td className="py-2 text-right font-bold tabular-nums">{c.employer_rate ? `${c.employer_rate}%` : "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] text-[#36435A]">
              <li>Salary advances and other agreed deductions are taken from the net pay as approved.</li>
              <li>Changed bank account, RSSB number or TIN? Tell HR with a copy of the document before the payroll is prepared.</li>
            </ul>
          </Section>

          <Section id="requests" title="Requests & approvals" subtitle="Start any request from My workspace; follow it in My requests">
            <div className="overflow-x-auto rounded-xl border border-[#E3E8EF]">
              <table className="w-full min-w-[600px] text-[13.5px]">
                <thead><tr className="bg-[#F8FAFC] text-left text-[12.5px] text-[#5B6577]"><th className="px-4 py-2.5 font-bold">I need…</th><th className="px-3 py-2.5 font-bold">Request</th><th className="px-4 py-2.5 font-bold">Who decides</th></tr></thead>
                <tbody>
                  {[
                    ["Time off", "Leave request", "Your line manager, then HR", "/dashboard/my/leave"],
                    ["A day I could not clock in", "Attendance correction", "HR", "/dashboard/my/attendance"],
                    ["Money for an activity, paid back after", "Expense / salary advance", "Line manager and Finance", "/dashboard/my/expenses"],
                    ["Small cash for an urgent purchase", "Petty cash", "Finance", "/dashboard/my/expenses?tab=petty"],
                    ["A laptop, phone or other equipment", "Equipment request", "The asset officer", "/dashboard/my/equipment"],
                    ["Goods or services bought by RALGA", "Purchase requisition", "Head of department, budget check, then procurement", "/dashboard/procurement/requisitions"],
                    ["Approval of my work plan", "Work plan", "Your supervisor (head of department)", "/dashboard/my/plans"],
                  ].map(([need, req, who, link]) => (
                    <tr key={req} className="border-t border-[#EDF0F5]">
                      <td className="px-4 py-2.5">{need}</td>
                      <td className="px-3 py-2.5 font-semibold"><WLink to={link}>{req}</WLink></td>
                      <td className="px-4 py-2.5 text-[#36435A]">{who}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-[13.5px] text-[#36435A]">You get a notification at each decision. If a request is returned, correct it and send it again — the history stays with it.</p>
          </Section>

          <Section id="planning" title="Planning & reporting" subtitle="The public-service planning cycle, from the year down to the week">
            <ol className="grid gap-3 md:grid-cols-2">
              {[
                ["1", "Annual performance contract", "At the start of the fiscal year (July). 3 to 6 objectives linked to RALGA's strategic objectives, each with an indicator, baseline, target and weight; agreed with your supervisor. Assessed at year end."],
                ["2", "Quarterly plan", "Before each quarter (July, October, January, April): the outputs that move your annual objectives, with indicators and targets. Reported at quarter end."],
                ["3", "Monthly plan", "Before each month: activities with expected outputs and due dates, linked to the department plan."],
                ["4", "Weekly plan", "Each Monday: what you will do this week, day by day. On Friday update the progress and write the week's report."],
              ].map(([n, t, d]) => (
                <li key={n} className="flex gap-3 rounded-xl border border-[#E3E8EF] p-3.5">
                  <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#0B3A6F] text-[13px] font-extrabold text-white">{n}</span>
                  <span><span className="block text-[14px] font-bold">{t}</span><span className="mt-0.5 block text-[13px] text-[#36435A]">{d}</span></span>
                </li>
              ))}
            </ol>
            <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[13.5px] text-[#36435A]">
              <li>Each plan is sent to your supervisor, who approves it or returns it with comments. Heads of department send theirs to the Secretary General.</li>
              <li>Write SMART items: specific, measurable, achievable, relevant and time-bound. Say what will prove it (report, attendance list, publication).</li>
              <li>At the end of the period write the report — what was achieved, challenges, next steps — and rate yourself; your supervisor assesses it.</li>
              <li>Mission or activity reports go in <WLink to="/dashboard/my/plans?tab=reports">Reports</WLink>.</li>
            </ul>
            <p className="mt-2 text-[12.5px] text-[#5B6577]">The timing above is the usual rhythm; HR confirms RALGA's own deadlines each year.</p>
          </Section>

          <Section id="contacts" title="Who to contact" subtitle="For anything this page does not answer">
            <div className="grid gap-3 md:grid-cols-3">
              {[
                ["Human Resources", "Leave, attendance, pay, contracts, training", hr],
                ["Finance and Administration", "Advances, petty cash, payments", finance],
                ["ICT and Digital Services", "Your account, password, equipment, this system", ict],
              ].map(([title, what, d]: any) => (
                <div key={title} className="rounded-xl border border-[#E3E8EF] p-3.5">
                  <p className="text-[14px] font-bold">{d?.name || title}</p>
                  <p className="mt-0.5 text-[12.5px] text-[#5B6577]">{what}</p>
                  {d?.expand?.head && (
                    <p className="mt-2 text-[13px]">
                      <span className="font-semibold">{d.expand.head.name}</span>
                      {d.expand.head.email && <a href={`mailto:${d.expand.head.email}`} className="mt-0.5 flex items-center gap-1.5 text-[#1466C0] hover:underline"><Mail size={13} aria-hidden /> {d.expand.head.email}</a>}
                    </p>
                  )}
                </div>
              ))}
            </div>
            {BRAND.supportEmail && <p className="mt-3 text-[13.5px] text-[#36435A]">System support: <a className="font-semibold text-[#1466C0] hover:underline" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a></p>}
          </Section>

          <Section id="faq" title="Questions" subtitle="The ones staff ask most">
            <div className="divide-y divide-[#EDF0F5] rounded-xl border border-[#E3E8EF]">
              {[
                ["I forgot to clock in. What do I do?", "Open My attendance, choose the day and ask for a correction with a short explanation. HR approves it and the day is recorded with the normal hours."],
                ["The clock-in button asks for my location.", "Allow location for this site in your browser (the lock icon next to the address). Your position is recorded only when you clock in or out."],
                ["How many leave days do I have left?", "My workspace and My leave show your balance: the days you are entitled to, taken, planned and left."],
                ["My leave request is still waiting.", "My requests shows who has it now. Your line manager decides first, then HR; remind them if the date is close."],
                ["Who approves my plan?", "Your head of department. If you are a head of department, the Secretary General. You see the supervisor on the plan."],
                ["Can I change a plan after it is approved?", "You update the progress and the status of each item at any time. To change the content, ask your supervisor to return it, change it and send it again."],
                ["Where is my payslip?", "My payslips lists every approved month; open one to view or download the PDF. Amounts can be hidden on your workspace with the eye button."],
                ["I need to change my bank account.", "Send HR the new account details with a bank letter before the payroll is prepared for the month."],
              ].map(([q, a]) => (
                <details key={q} className="group px-4 py-3">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[14px] font-semibold [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="text-[18px] leading-none text-[#5B6577] transition-transform group-open:rotate-45">+</span>
                  </summary>
                  <p className="mt-2 text-[13.5px] text-[#36435A]">{a}</p>
                </details>
              ))}
            </div>
          </Section>
        </div>
      </div>
    </main>
  );
}

function Section({ id, title, subtitle, children }: { id: string; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section id={id} className="scroll-mt-4">
      <WCard>
        <WHead title={title} subtitle={subtitle} />
        <div className="mt-3">{children}</div>
      </WCard>
    </section>
  );
}

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid gap-3 sm:grid-cols-3">
      {items.map(([k, v]) => (
        <div key={k} className="rounded-xl bg-[#F4F6F9] px-3.5 py-3">
          <dt className="text-[12px] font-bold uppercase tracking-wider text-[#5B6577]">{k}</dt>
          <dd className="mt-1 text-[15px] font-bold">{v}</dd>
        </div>
      ))}
    </dl>
  );
}
