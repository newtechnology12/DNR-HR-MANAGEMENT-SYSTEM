/**
 * Attendance → Attendance report: one row per employee and one column per day of the month, showing
 * who was present, absent, off (not a working day) or not yet (future days).
 */
import { ReactNode, useState } from "react";
import { useQuery } from "react-query";
import { format } from "date-fns";
import { Check, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import Avatar from "@/components/shared/Avatar";
import useSettings from "@/hooks/useSettings";
import AsyncSelectField from "@/components/AsyncSelectField";
import cleanObject from "@/utils/cleanObject";
import { MONTHS } from "@/lib/hr";
import { Card, EmptyState, ErrorState, FilterSelect, Page, PageHeader } from "@/components/ims";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";

function daysOfWeekToNumbers(days) {
  const dayMap = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };

  return days.map((day) => dayMap[day.toLowerCase()]);
}

const generateDaysOfMonth = (year, month) => {
  const days = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
};

function areSameDay(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

async function fetchData(e) {
  const month = e.queryKey[1]?.month;
  const year = e.queryKey[1]?.year;
  const working_days = e.queryKey[1]?.working_days;
  const employee = e.queryKey[1]?.employee;

  let beginTime: any = new Date(year, month - 1, 1);
  beginTime.setHours(0, 0, 0, 0);
  beginTime = beginTime.toISOString().replace("T", " ");

  let stopTime: any = new Date(year, month, 0);
  stopTime.setHours(23, 59, 59, 999);
  stopTime = stopTime.toISOString().replace("T", " ");

  const dateQ = `date >= "${beginTime}" && date < "${stopTime}"`;

  const employees = await pocketbase
    .collection("users")
    .getFullList({
      filter: employee ? `id="${employee}"` : "",
    })
    .then((e) =>
      e.map((e) => ({
        name: e.name,
        id: e.id,
        phone: e.phone,
        avatar: e.avatar ? pocketbase.files.getUrl(e, e.avatar) : "",
      }))
    );

  const attendances = await pocketbase.collection("attendance").getFullList({
    filter: dateQ,
    sort: "-created",
  });

  const daysOfMonth = generateDaysOfMonth(year, month);

  const report = employees.map((e) => {
    return {
      ...e,
      attendances: daysOfMonth.map((day) => {
        const dayAttendance = attendances.find((a) => {
          const thisDate = new Date(day);
          const attDate = new Date(a.date);
          return areSameDay(thisDate, attDate) && a.employee === e.id;
        });

        const number_working_days = daysOfWeekToNumbers(working_days);

        const isNotWorkingDay = !number_working_days.includes(
          new Date(day).getDay()
        );

        const isInTheFuture = new Date(day) > new Date();

        return {
          status: isInTheFuture
            ? "future"
            : isNotWorkingDay
            ? "off_day"
            : dayAttendance
            ? "present"
            : "absent",
          dayAttendance,
        };
      }),
    };
  });

  return {
    daysOfMonth,
    employees: report,
  };
}

const YEARS = [2021, 2022, 2023, 2024, 2025, 2026, 2027, 2028, 2029, 2030];
const LEGEND: [string, ReactNode][] = [
  ["Present", <Check key="p" size={14} strokeWidth={3} className="text-ims-success" aria-hidden />],
  ["Absent", <X key="a" size={14} strokeWidth={3} className="text-ims-danger" aria-hidden />],
  ["Not a working day, or still to come", <span key="o" className="h-1.5 w-1.5 rounded-full bg-ims-field" aria-hidden />],
];
const CELL_LABEL: Record<string, string> = { present: "Present", absent: "Absent", off_day: "Not a working day", future: "Still to come" };

export default function AttendanceReport() {
  const [year, setyear] = useState(new Date().getFullYear());
  const [month, setmonth] = useState(new Date().getMonth() + 1);
  const [employee, setemployee] = useState(undefined);

  const { settings } = useSettings();

  const {
    data: report,
    status,
    isFetching,
    error,
    refetch,
  } = useQuery(
    [
      "attendance-report",
      { year, month, working_days: settings?.working_days, employee },
    ],
    fetchData,
    {
      keepPreviousData: true,
      retry: false,
      staleTime: Infinity,
      enabled: Boolean(settings?.working_days),
    }
  );

  const changed = Boolean(employee) || year !== new Date().getFullYear() || month !== new Date().getMonth() + 1;
  const reset = () => {
    setyear(new Date().getFullYear());
    setmonth(new Date().getMonth() + 1);
    setemployee(undefined);
  };
  const today = new Date();

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Attendance report" }]}
        title="Attendance report"
        subtitle="Who was present on each working day of the month."
      />
      <Card padded={false} className="overflow-hidden">
        <div className="flex flex-col gap-3 px-4 py-3.5 sm:px-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <div className="w-full sm:w-[280px]">
              <AsyncSelectField
                placeholder="All employees"
                aria-label="Employee"
                defaultOptions={true}
                className="!min-h-[40px] !rounded-control !shadow-none"
                onChange={(e) => {
                  setemployee(e?.value);
                }}
                value={employee}
                name="employees"
                loader={({ search }) => {
                  return pocketbase
                    .collection("users")
                    .getFullList(
                      cleanObject({
                        filter: search ? `name~"${search}"` : "",
                      })
                    )
                    .then((e) =>
                      e.map((e) => ({ label: e.name, value: e.id }))
                    );
                }}
              />
            </div>
            <FilterSelect label="Year" all={false} value={String(year)} onChange={(v) => setyear(Number(v))} options={YEARS.map((y) => ({ value: String(y), label: String(y) }))} className="[&_select]:w-[120px]" />
            <FilterSelect label="Month" all={false} value={String(month)} onChange={(v) => setmonth(Number(v))} options={MONTHS.map((m, i) => ({ value: String(i + 1), label: m }))} className="[&_select]:w-[160px]" />
            {changed && (
              <button type="button" onClick={reset} className="h-9 px-1.5 text-t-body font-bold text-ims-link hover:underline">
                Reset
              </button>
            )}
          </div>
          <ul className="flex flex-wrap items-center gap-x-4 gap-y-1 text-t-small text-ims-muted" aria-label="Legend">
            {LEGEND.map(([label, icon]) => (
              <li key={label} className="inline-flex items-center gap-1.5">
                <span className="flex h-4 w-4 items-center justify-center">{icon}</span>
                {label}
              </li>
            ))}
          </ul>
        </div>

        <div className={cn("border-t border-ims-divider", isFetching && status === "success" && "opacity-60 transition-opacity")}>
          {status === "loading" && (
            <div className="space-y-2 p-5">
              {Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
            </div>
          )}
          {status === "error" && <ErrorState text="The attendance report could not be loaded." detail={(error as any)?.message} onRetry={() => refetch()} />}
          {status === "success" && report && report.employees.length === 0 && <EmptyState text="No employees to show." />}
          {status === "success" && report && report.employees.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full border-separate border-spacing-0 text-t-body text-ims-text">
                <caption className="sr-only">Attendance for {MONTHS[month - 1]} {year}</caption>
                <thead>
                  <tr className="bg-ims-thead">
                    <th scope="col" className="sticky left-0 z-10 h-11 min-w-[200px] border-b border-r border-ims-divider bg-ims-thead px-3.5 text-left text-t-small font-semibold text-ims-muted">
                      Employee
                    </th>
                    {report.daysOfMonth.map((d, i) => {
                      const isToday = areSameDay(d, today);
                      return (
                        <th key={i} scope="col" className={cn("h-11 w-9 min-w-[36px] border-b border-r border-ims-divider px-0 text-center text-t-small font-semibold tabular-nums", isToday ? "bg-ims-info-bg text-ims-primary" : "text-ims-muted")}>
                          <span className="block leading-4">{i + 1}</span>
                          <span className="block text-t-hint font-normal leading-4 text-ims-faint">{format(d, "EEEEE")}</span>
                        </th>
                      );
                    })}
                    <th scope="col" className="h-11 border-b border-ims-divider px-3 text-right text-t-small font-semibold text-ims-muted">Present</th>
                  </tr>
                </thead>
                <tbody>
                  {report.employees.map((employeeReport, i) => {
                    const present = employeeReport.attendances.filter((a) => a.status === "present").length;
                    const due = employeeReport.attendances.filter((a) => a.status === "present" || a.status === "absent").length;
                    return (
                      <tr key={i} className="group">
                        <td className="sticky left-0 z-[1] h-11 border-b border-r border-ims-divider bg-ims-card px-3.5 group-hover:bg-ims-hover">
                          <div className="flex items-center gap-2.5">
                            <Avatar path={employeeReport.avatar} textClass={"!text-[8px]"} className={"h-6 w-6 !text-t-hint"} name={employeeReport.name} />
                            <span className="truncate text-t-body font-semibold text-ims-text">{employeeReport.name}</span>
                          </div>
                        </td>
                        {employeeReport.attendances.map((attendance, index) => (
                          <td
                            key={index}
                            title={`${employeeReport.name} · ${format(report.daysOfMonth[index], "d MMM")}: ${CELL_LABEL[attendance.status]}`}
                            className={cn("h-11 border-b border-r border-ims-divider p-0 text-center group-hover:bg-ims-hover", attendance.status === "off_day" && "bg-ims-thead")}
                          >
                            <span className="flex h-full items-center justify-center">
                              {attendance.status === "present" && <Check className="text-ims-success" strokeWidth={3} size={14} aria-label="Present" />}
                              {attendance.status === "absent" && <X className="text-ims-danger" strokeWidth={3} size={14} aria-label="Absent" />}
                              {(attendance.status === "off_day" || attendance.status === "future") && <span className="h-1.5 w-1.5 rounded-full bg-ims-field" aria-hidden />}
                            </span>
                          </td>
                        ))}
                        <td className="h-11 whitespace-nowrap border-b border-ims-divider px-3 text-right tabular-nums group-hover:bg-ims-hover">
                          {present}
                          <span className="text-ims-faint"> / {due}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </Card>
    </Page>
  );
}
