import BreadCrumb from "@/components/breadcrumb";
import Loader from "@/components/icons/Loader";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth.context";
import pocketbase from "@/lib/pocketbase";
import { AlertCircleIcon, ArrowLeft } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "react-query";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import useSettings from "@/hooks/useSettings";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export default function NewPayroll() {
  const { state } = useLocation();

  useEffect(() => {
    if (!state?.branch || !state?.period_month || !state?.period_year) {
      navigate("/dashboard/hr/payrolls");
    }
  }, [state]);

  const navigate = useNavigate();

  const payrollsQuery = useQuery({
    queryKey: [
      "payroll_employees",
      state.branch,
      state.period_month,
      state.period_year,
    ],
    queryFn: async () => {
      const month_prepayments = await pocketbase
        .collection("prepayments")
        .getFullList({
          filter: `employee!="" && status!="paid" && employee.branch="${state.branch}" && deduction_month="${state.period_year}.${state.period_month}"`,
        });

      const branch = await pocketbase
        .collection("branches")
        .getOne(state.branch);

      const deductions = await pocketbase
        .collection("deductions")
        .getFullList();

      const pay_slips = await pocketbase
        .collection("users")
        .getFullList({
          expand: "department",
          filter: `branch="${state.branch}"`,
        })
        .then((e) => {
          return e?.map((e) => {
            const prepayments = month_prepayments.filter(
              (p) => p.employee === e.id
            );
            const total_prepayment = prepayments.reduce(
              (acc, e) => acc + e.amount,
              0
            );

            const deducts = deductions.map((deduction) => {
              console.log(e.salary * deduction.percentage, deduction.name);
              return {
                name: deduction.name,
                amount: (e.salary * deduction.percentage) / 100,
              };
            });

            const total_deductions = deducts.reduce(
              (acc, e) => acc + e.amount,
              0
            );

            const net_sallary = e.salary - total_deductions - total_prepayment;

            return {
              id: e.id,
              name: e.name,
              avatar: e.avatar,
              department: e.expand?.department?.name,
              salary: e.salary || 0,
              prepayment: total_prepayment,
              net_sallary: net_sallary,
              deductions: deducts,
            };
          });
        });

      return {
        pay_slips,
        branch,
        deductions,
      };
    },
    enabled: true,
  });

  const { user } = useAuth();

  const [payslips, setpaysplips] = useState(undefined);

  useEffect(() => {
    if (payrollsQuery.data) {
      setpaysplips(
        payrollsQuery.data?.pay_slips?.map((e) => {
          return {
            ...e,
          };
        })
      );
    } else {
      setpaysplips([]);
    }
  }, [payrollsQuery.data]);

  const report_status = useMemo(() => {
    const total_payroll = payrollsQuery.data?.pay_slips?.reduce(
      (acc, e) => acc + e.salary,
      0
    );

    return [
      {
        name: "total_employees",
        title: "Total employees",
        value: payrollsQuery.data
          ? payrollsQuery.data?.pay_slips?.length
          : "---",
      },
      {
        name: "total_gross_salaries",
        title: "Total gross salaries",
        value: payrollsQuery.data
          ? Number(total_payroll).toLocaleString() + " FRW"
          : "---",
      },
      {
        name: "created_by",
        title: "Created by",
        value: payrollsQuery.data ? user.names : "---",
      },
      {
        name: "Branch",
        title: "Branch",
        value: payrollsQuery.data ? payrollsQuery?.data?.branch?.name : "---",
      },
      {
        name: "period",
        title: "Period",
        value: `${state?.period_month}/${state?.period_year}`,
      },
    ];
  }, [payrollsQuery.data, state?.period_month, state?.period_year]);

  const [closing_notes, setclosing_notes] = useState("");

  const prepayments_covered = payslips?.reduce(
    (acc, e) => acc + e.prepayment,
    0
  );

  const total_net_sallaries = payslips?.reduce(
    (acc, e) => acc + e?.net_sallary,
    0
  );

  const total_gross_sallaries = payslips?.reduce(
    (acc, e) => acc + e?.salary,
    0
  );

  const payPrepayment = async (prepayment, payroll) => {
    return pocketbase.collection("prepayment").update(prepayment.id, {
      status: "paid",
      payroll: payroll.id,
    });
  };

  const [error, seterror] = useState(undefined);

  const createEmployeePaysleep = async (employee_payroll, payroll) => {
    const new_employee_payroll = await pocketbase
      .collection("employees_payrolls")
      .create({
        employee: employee_payroll.id,
        net_sallary: employee_payroll.net_sallary,
        deductions_amount: employee_payroll.deductions.reduce(
          (acc, e) => acc + e.amount,
          0
        ),
        prepayments: [],
        deductions: employee_payroll.deductions,
        payroll: payroll.id,
        gross_salary: employee_payroll.salary,
      });

    const prepayments = employee_payroll?.prepayments
      ? await Promise.all(
          employee_payroll.prepayments.map((prepayment) =>
            payPrepayment(prepayment, new_employee_payroll)
          )
        )
      : [];

    await pocketbase
      .collection("employees_payrolls")
      .update(new_employee_payroll.id, {
        prepayments: prepayments.map((e) => e.id),
      });

    return new_employee_payroll;
  };

  const { settings } = useSettings();

  function truncateWithEllipsis(text: string, maxLength: number) {
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }

  const createPayrollMutation = useMutation({
    mutationFn: async () => {
      seterror(undefined);
      // check if the period is not yet reached
      if (new Date(state?.period_year, state?.period_month - 1) > new Date()) {
        throw new Error("You cannot create a payroll for a future period");
      }
      // check if there is existing payroll existing checking month and year
      const existing_payroll = await pocketbase
        .collection("payrolls")
        .getFullList({
          filter: `month="${state?.period_month}" && year="${state?.period_year}"`,
        });

      if (existing_payroll[0]?.id)
        throw new Error("Payroll already exists for this period");

      console.log(state?.period_month);
      const payroll_data = {
        total_gross: total_gross_sallaries,
        total_net: total_net_sallaries,
        month: Number(state?.period_month),
        year: state?.period_year,
        date: new Date().getDate(),
        period_cycle: settings?.payroll_period_cycle || "monthly",
        notes: closing_notes,
        created_by: user.id,
        prepayments_covered: prepayments_covered,
        employees_payrolls: [],
        branch: state?.branch,
      };
      const payroll = await pocketbase
        .collection("payrolls")
        .create(payroll_data);

      const employees_payrolls = await Promise.all(
        payslips.map((e) => createEmployeePaysleep(e, payroll))
      );

      return pocketbase.collection("payrolls").update(payroll.id, {
        payslips: employees_payrolls.map((e) => e.id),
      });
    },
    onSuccess: (e) => {
      console.log(e);
      toast.success("You have successfully generated a payroll.");
      navigate(`/dashboard/hr/payroll/${e.id}`);
    },
    onError: (error: any) => {
      console.log({ error });
      seterror(error.message);
      // toast.error("Failed to generate payroll");
    },
  });

  return (
    <>
      {" "}
      <div className="px-4">
        <div className="flex items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              Create a new payroll
            </h2>
            <BreadCrumb
              items={[{ title: "Create a new Payroll", link: "/dashboard" }]}
            />
          </div>
        </div>
        <div>
          <Card className="rounded-[4px] overflow-hidden">
            <div className="mt-1">
              <div className="px-3 py-3">
                <Button
                  onClick={() => {
                    navigate(-1);
                  }}
                  size="sm"
                  className="gap-3 rounded-full text-primary hover:underline"
                  variant="secondary"
                >
                  <ArrowLeft size={16} />
                  <span>Go back to payrolls</span>
                </Button>
              </div>
            </div>
            <div className="border-b px-5  border-dashed">
              <div className="grid gap-4  pb-3 grid-cols-2 sm:grid-cols-5">
                {report_status.map((status, i) => (
                  <div key={i}>
                    <h1 className="px-2- capitalize py-1 text-base sm:text-[14.5px] font-semibold">
                      {status.value}
                    </h1>
                    <div className="px-2- py-1 text-sm text-slate-500">
                      {status.title}
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="border-t w-full border-dashed">
              <ScrollArea className="w-full whitespace-nowrap">
                <table className="w-full table-auto">
                  <tr className="text-left">
                    <th className="font-medium px-5  capitalize  text-sm py-2 bg-slate-50 border-b">
                      Employee
                    </th>
                    <th className="font-medium px-5  capitalize  text-sm py-2 bg-slate-50 border-b">
                      Department
                    </th>
                    <th className="font-medium px-5  capitalize  text-sm py-2 bg-slate-50 border-b">
                      Gross Sallary
                    </th>
                    <th className="font-medium px-5  capitalize  text-sm py-2 bg-slate-50 border-b">
                      Prepayments
                    </th>
                    {payrollsQuery?.data?.deductions?.map((deduction, i) => {
                      return (
                        <th
                          key={i}
                          className="font-medium px-5  capitalize  text-sm py-2 bg-slate-50 border-b"
                        >
                          {truncateWithEllipsis(deduction.name, 15)}
                        </th>
                      );
                    })}

                    <th className="font-medium px-5  capitalize  text-sm py-2 bg-slate-50 border-b">
                      Net Sallary
                    </th>
                  </tr>
                  {payslips?.map((e, i) => {
                    return (
                      <tr key={i}>
                        <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-[14px] border-b">
                          {e.name}
                        </td>
                        <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-[14px] border-b">
                          {e?.department}
                        </td>
                        <td className="font-medium px-5 text-slate-600 capitalize  text-[13px] py-[14px] border-b">
                          {Number(e.salary)?.toLocaleString()} FRW
                        </td>
                        <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-[14px] border-b">
                          {Number(e.prepayment)?.toLocaleString()} FRW
                        </td>
                        {e.deductions.map((deduction, i) => {
                          return (
                            <td
                              key={i}
                              className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-[14px] border-b"
                            >
                              {Number(deduction.amount)?.toLocaleString()} FRW
                            </td>
                          );
                        })}
                        <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-[14px] border-b">
                          {
                            <span className="text-green-500">
                              {Number(e.net_sallary)?.toLocaleString()} FRW
                            </span>
                          }
                        </td>
                      </tr>
                    );
                  })}
                  {payslips?.length !== 0 && (
                    <tr>
                      <td className="font-semibold px-5 text-slate-900  capitalize  text-[13px] py-2 border-b">
                        Total
                      </td>
                      <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-2 border-b">
                        ---
                      </td>
                      <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-2 border-b">
                        {Number(total_gross_sallaries).toLocaleString()}
                        FRW
                      </td>
                      <td className="font-semibold px-5 text-slate-900  capitalize  text-[13px] py-2 border-b">
                        {prepayments_covered?.toLocaleString()} FRW
                      </td>
                      {payrollsQuery?.data?.deductions?.map((deduction, i) => {
                        return (
                          <td
                            key={i}
                            className="font-semibold px-5 text-slate-900  capitalize  text-[13px] py-2 border-b"
                          >
                            {Number(
                              payslips?.reduce(
                                (acc, e) =>
                                  acc +
                                  e?.deductions?.find(
                                    (d) => d.name === deduction.name
                                  )?.amount,
                                0
                              )
                            ).toLocaleString()}{" "}
                            FRW
                          </td>
                        );
                      })}

                      <td className="font-semibold px-5 text-slate-900  capitalize  text-[13px] py-2 border-b">
                        {Number(total_net_sallaries).toLocaleString()} FRW
                      </td>
                    </tr>
                  )}

                  {payslips?.length === 0 && (
                    <tr>
                      <td
                        colSpan={
                          5 + (payrollsQuery?.data?.deductions?.length || 0)
                        }
                        className="border-b"
                      >
                        <div className="text-center py-10 bg-slate-700- w-full items-center flex justify-center text-[13px] font-medium text-slate-500">
                          <span>No employees available.</span>
                        </div>
                      </td>
                    </tr>
                  )}
                </table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
            <div className="pb-4 mt-4 px-5">
              <div className="max-w-xl ml-auto flex flex-col justify-end items-end space-y-3">
                <div className="px-2- w-full mt-3-">
                  <Label className="text-[13px] mb-2 block text-slate-500">
                    Closing Note (Optional)
                  </Label>
                  <Textarea
                    rows={2}
                    onChange={(e) => setclosing_notes(e.target?.value)}
                    value={closing_notes}
                    className="w-full"
                    placeholder="Add closing note."
                  />
                </div>

                <div className="max-w-sm bg-slate-200- w-full space-y-5 pb-4 ml-auto px-5-">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Total net sallaries</h4>
                    <span className="text-sm font-medium">
                      {Number(total_net_sallaries).toLocaleString()} FRW
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">
                      Total gross sallaries
                    </h4>
                    <span className="text-sm font-medium">
                      <span>
                        {" "}
                        {Number(total_gross_sallaries).toLocaleString()} FRW
                      </span>
                    </span>
                  </div>
                  {error && (
                    <Alert
                      variant="destructive"
                      className="py-2 -mt-2 rounded-[4px] flex items-center"
                    >
                      <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                      <AlertTitle className="text-[13px] font-medium fon !m-0">
                        {error}
                      </AlertTitle>
                    </Alert>
                  )}
                </div>

                <div className="flex items-center gap-2 ">
                  <Button
                    onClick={() => {
                      setpaysplips(
                        payslips.map((e) => {
                          return {
                            ...e,
                            credits_to_apply: [],
                            credits_covered: 0,
                            credits_left: e.credits_amount,
                            recievable: e.salary,
                          };
                        })
                      );
                    }}
                    className="w-fit !text-primary"
                    size="sm"
                    variant="secondary"
                  >
                    Reset payroll
                  </Button>

                  <Button
                    onClick={() => createPayrollMutation.mutate()}
                    disabled={
                      createPayrollMutation.isLoading || !payslips?.length
                    }
                    className="w-fit"
                    size="sm"
                  >
                    {createPayrollMutation.isLoading && (
                      <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                    )}
                    Generate payroll
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}
