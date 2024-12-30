import { cn } from "@/utils/cn";
import { Check, MoreHorizontal, PlusCircle, X } from "react-feather";
import { Fragment, useState } from "react";
import { useQuery } from "react-query";
import Avatar from "@/components/shared/Avatar";
import Loader from "@/components/icons/Loader";
import pocketbase from "@/lib/pocketbase";
import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import useSettings from "@/hooks/useSettings";
import AsyncSelectField from "@/components/AsyncSelectField";
import cleanObject from "@/utils/cleanObject";

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
        avatar: e.avatar,
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

        console.log(isNotWorkingDay);

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

  return (
    <>
      {" "}
      <div className="px-4">
        <div className="flex mb-2 items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-[16px] font-semibold tracking-tight">
              Employee Attendance Logs
            </h2>
            <BreadCrumb
              items={[{ title: "Attendance logs", link: "/dashboard" }]}
            />
          </div>
          {/* <div className="space-x-2">
            <Button
              onClick={() => {
                // newRecordModal.open();
              }}
              size="sm"
              className="hover:bg-white"
              variant="outline"
            >
              <PlusCircle size={16} className="mr-2" />
              <span>Bulk upload</span>
            </Button>
            <Button
              onClick={() => {
                // newRecordModal.open();
              }}
              size="sm"
            >
              <PlusCircle size={16} className="mr-2" />
              <span>Create new attendace.</span>
            </Button>
          </div> */}
        </div>
        <div className="border rounded-[4px] border-slate-200 bg-white">
          <div>
            <div className="py-2 px-3">
              <div className="flex items-center gap-3">
                <div className="w-[280px]">
                  <AsyncSelectField
                    placeholder="Choose employee"
                    defaultOptions={true}
                    onChange={(e) => {
                      setemployee(e.value);
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
                <select
                  value={year}
                  onChange={(e: any) => setyear(e.target.value)}
                  className="px-3 border outline-none  cursor-pointer rounded-[4px] py-2 w-[250px] text-[13px] font-medium text-slate-500 border-slate-200"
                  name=""
                  id=""
                >
                  <option selected disabled value="">
                    Choose year
                  </option>
                  <option value="2021">2021</option>
                  <option value="2022">2022</option>
                  <option value="2023">2023</option>
                  <option value="2024">2024</option>
                  <option value="2025">2025</option>
                  <option value="2026">2026</option>
                  <option value="2027">2027</option>
                  <option value="2029">2029</option>
                  <option value="2030">2030</option>
                </select>

                <select
                  value={month}
                  onChange={(e: any) => setmonth(e.target.value)}
                  className="px-3 border cursor-pointer outline-none rounded-[4px]  py-2 w-[250px] text-[13px] font-medium text-slate-500 border-slate-200"
                  name=""
                  id=""
                >
                  <option selected disabled value="">
                    Choose Month
                  </option>
                  <option value="1">January</option>
                  <option value="2">February</option>
                  <option value="3">March</option>
                  <option value="4">April</option>
                  <option value="5">May</option>
                  <option value="6">June</option>
                  <option value="7">July</option>
                  <option value="8">August</option>
                  <option value="9">September</option>
                  <option value="10">October</option>
                  <option value="11">November</option>
                  <option value="12">December</option>
                </select>

                <a
                  onClick={() => {
                    setyear(new Date().getFullYear());
                    setmonth(new Date().getMonth() + 1);
                    setemployee(undefined);
                  }}
                  className="text-[13px] cursor-pointer flex items-center gap-2 hover:bg-slate-100 px-2 py-1 rounded-md text-slate-500 font-medium"
                >
                  <span>Reset</span>
                  <X className="text-slate-500" size={14} />
                </a>
                {isFetching && (
                  <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
                )}
              </div>
            </div>
          </div>
          <div className="flex border-t overflow-hidden min-h-[200px] rounded-md">
            {status === "loading" && (
              <div className="w-full flex items-center justify-center h-[300px]">
                <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
              </div>
            )}
            {status === "error" && (
              <div className="w-full flex items-center justify-center h-[300px]">
                <span className="text-slate-500 font-medium">
                  {error["message"] || " Failed to load data"}
                </span>
              </div>
            )}
            {status === "success" && report && (
              <Fragment>
                <div className="w-full no-scrollbar overflow-x-auto">
                  <table className="w-full ">
                    <tr>
                      <td className="border-b font-medium text-[13px] text-slate-600 bg-slate-50 border-r px-3">
                        Employee
                      </td>
                      {report.daysOfMonth.map((_, i) => {
                        return (
                          <td className="text-[13px] border-r border-b  bg-slate-50 border-slate-200 text-slate-500 font-medium">
                            <span className="w-[50px] flex h-8 items-center justify-center">
                              {i + 1}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                    {report.employees.map((employeeReport, i) => {
                      return (
                        <tr key={i}>
                          <td className="border-b border-r px-3">
                            <div className="flex items-center gap-3">
                              <div>
                                <Avatar
                                  path={employeeReport.avatar}
                                  textClass={"!text-[8px]"}
                                  className={"h-5 w-5 !text-[10px]"}
                                  name={employeeReport.name}
                                />
                              </div>
                              <div>
                                <h4 className="text-slate-700 capitalize  truncate leading-5 text-[12px] font-medium">
                                  {employeeReport.name}
                                </h4>
                              </div>
                            </div>
                          </td>
                          {employeeReport.attendances.map(
                            (attendance, index) => {
                              return (
                                <td
                                  key={index}
                                  className="text-[13px] border-b border-t border-r text-slate-500 font-medium"
                                >
                                  <span
                                    className={cn(
                                      "w-[50px] hover:bg-slate-50 border-transparent hover:border-slate-200 border cursor-pointer flex h-[38px] items-center justify-center",
                                      {
                                        "pointer-events-none select-none":
                                          !status,
                                      }
                                    )}
                                  >
                                    {attendance.status === "present" && (
                                      <Check
                                        className="text-green-500"
                                        strokeWidth={3}
                                        size={14}
                                      />
                                    )}
                                    {attendance.status === "absent" && (
                                      <X
                                        className="text-red-500"
                                        strokeWidth={3}
                                        size={14}
                                      />
                                    )}
                                    {(attendance.status === "off_day" ||
                                      attendance.status === "future") && (
                                      <MoreHorizontal
                                        className="text-slate-300"
                                        strokeWidth={3}
                                        size={14}
                                      />
                                    )}

                                    {!status && "--"}
                                  </span>
                                </td>
                              );
                            }
                          )}
                        </tr>
                      );
                    })}
                  </table>
                </div>
              </Fragment>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
