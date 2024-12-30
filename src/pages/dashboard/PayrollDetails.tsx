import BreadCrumb from "@/components/breadcrumb";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { mkConfig, generateCsv, download } from "export-to-csv";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import pocketbase from "@/lib/pocketbase";
import { Download } from "lucide-react";
import { useMemo, useState } from "react";
import { ArrowLeft } from "react-feather";
import { useQuery } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";

export default function PayrollDetails() {
  const getPayrollReport = async () => {
    const data = await pocketbase.collection("payrolls").getOne(payrollId, {
      expand:
        "payslips,payslips.employee,created_by,payslips.employee.department,branch,prepayments",
    });
    return data;
  };

  const payrollId = useParams()?.payrollId;

  const { data: payroll } = useQuery(
    ["payrolls", payrollId],
    getPayrollReport,
    {
      enabled: Boolean(payrollId),
    }
  );

  const report_status = useMemo(() => {
    return [
      {
        name: "total_employees",
        title: "Total employees",
        value: payroll?.payslips ? payroll?.payslips?.length : "---",
      },
      {
        name: "total_gross_salaries",
        title: "Total gross salaries",
        value: payroll?.total_gross
          ? Number(payroll?.total_gross).toLocaleString() + " FRW"
          : "---",
      },
      {
        name: "created_by",
        title: "Created by",
        value: payroll ? payroll?.expand?.created_by?.name : "---",
      },
      {
        name: "period",
        title: "Period",
        value: payroll ? `${payroll?.month}/${payroll?.year}` : "---",
      },
      {
        name: "branch",
        title: "Branch",
        value: payroll?.expand?.branch?.name || "---",
      },
    ];
  }, [payroll]);

  const navigate = useNavigate();

  const [payrollToShowCredits, setpayrollToShowCredits] = useState(undefined);

  const generatePayroll = async () => {
    const csvConfig = mkConfig({
      useKeysAsHeaders: true,
      filename: `Payroll_${payroll?.month}_${payroll?.year}`,
    });

    const report_data = payroll.expand.payslips.map((e) => {
      const objs = {
        Employee: e.expand.employee.name,
        Department: e?.expand?.employee.expand?.department?.name,
        "Net sallary": e.net_sallary,
        "Gross salary": e.gross_salary,
        "Total deductions": e.deductions.reduce((acc, e) => acc + e.amount, 0),
      };
      e.deductions.forEach((deduction) => {
        objs[deduction.name] = deduction.amount;
      });

      return objs;
    });

    const last_row = {
      Employee: "TOTAL",
      Department: "",
      "Net sallary": report_data.reduce((acc, e) => acc + e["Net sallary"], 0),
      "Gross salary": report_data.reduce(
        (acc, e) => acc + e["Gross salary"],
        0
      ),
      "Total deductions": report_data.reduce(
        (acc, e) => acc + e["Total deductions"],
        0
      ),
    };

    // update last row with deductions
    payroll.expand.payslips[0].deductions.forEach((deduction) => {
      last_row[deduction.name] = report_data.reduce(
        (acc, e) => acc + e[deduction.name],
        0
      );
    });

    const rows = [...report_data, last_row];

    const csv = generateCsv(csvConfig)(rows);
    download(csvConfig)(csv);
  };

  const payslips = payroll?.expand?.payslips || [];

  const prepayments_covered = payslips
    ?.map((e) => {
      return (e?.prepayments || [])?.reduce((acc, e) => acc + e.amount, 0);
    })
    ?.reduce((acc, e) => acc + e, 0);

  const total_net_sallaries = payslips?.reduce(
    (acc, e) => acc + e?.net_sallary,
    0
  );

  const total_gross_sallaries = payslips?.reduce(
    (acc, e) => acc + e?.gross_salary,
    0
  );

  function truncateWithEllipsis(text: string, maxLength: number) {
    return text.length > maxLength
      ? text.substring(0, maxLength) + "..."
      : text;
  }

  return (
    <>
      <div className="px-4">
        <div className="flex items-start justify-between space-y-2">
          <div className="flex items-start gap-2 flex-col">
            <h2 className="text-lg font-semibold tracking-tight">
              Payroll Details
            </h2>
            <BreadCrumb
              items={[{ title: "Payroll Details", link: "/dashboard" }]}
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
            <div className="border-t border-dashed">
              <ScrollArea className="w-full whitespace-nowrap">
                <table className="w-full">
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
                    {payslips[0]?.deductions?.map((deduction, i) => {
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
                  {payroll?.expand?.payslips?.map((e) => {
                    const total_prepayments = (e?.prepayments || [])?.reduce(
                      (acc, e) => acc + e.amount,
                      0
                    );
                    return (
                      <tr>
                        <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-[14px] border-b">
                          {e?.expand?.employee?.name}
                        </td>
                        <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-[14px] border-b">
                          {e?.expand?.employee?.expand?.department?.name}
                        </td>
                        <td className="font-medium px-5 text-slate-600 capitalize  text-[13px] py-[14px] border-b">
                          {Number(e.gross_salary)?.toLocaleString()} FRW
                        </td>
                        <td className="font-medium px-5 text-slate-600  capitalize  text-[13px] py-[14px] border-b">
                          {Number(total_prepayments)?.toLocaleString()} FRW
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
                  {payroll?.expand?.payslips?.length !== 0 && (
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
                      {payslips[0]?.deductions?.map((deduction, i) => {
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
                </table>
                <ScrollBar orientation="horizontal" />
              </ScrollArea>
            </div>
            <div className="pb-4 mt-5 px-5">
              <div className="max-w-xl ml-auto flex flex-col justify-end items-end space-y-3">
                {payroll?.notes && (
                  <div className="px-2- max-w-sm  w-full mt-3-">
                    <Label className="text-[13px] mb-2 block text-slate-800">
                      Closing Note (Optional)
                    </Label>
                    <span className="text-[13px] mb-2 block text-slate-500">
                      {payroll?.notes}
                    </span>
                  </div>
                )}

                <div className="max-w-sm bg-slate-200- w-full space-y-5 pb-4 ml-auto px-5-">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Total net payroll</h4>
                    <span className="text-sm font-medium">
                      {Number(total_net_sallaries).toLocaleString()} FRW
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium">Total gross payroll</h4>
                    <span className="text-sm font-medium">
                      <span>
                        {" "}
                        {Number(total_gross_sallaries).toLocaleString()} FRW
                      </span>
                    </span>
                  </div>
                </div>
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full px-3"
                    onClick={() => {
                      generatePayroll();
                    }}
                  >
                    <Download size={16} className="mr-2" />
                    Download Payroll
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
