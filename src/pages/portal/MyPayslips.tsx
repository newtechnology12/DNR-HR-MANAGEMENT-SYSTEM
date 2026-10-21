import * as React from "react";
import { useQuery } from "react-query";
import { FileText, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { rwf } from "@/lib/hr";
import { PayslipDialog } from "@/pages/hr/payroll/Payslip";

/** The employee's payslips from approved and paid payrolls. */
export default function MyPayslips({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = React.useState<any>(null);
  const q = useQuery(["my-payslips", employeeId], () =>
    pocketbase.collection("employees_payrolls").getFullList({ filter: `employee = "${employeeId}" && (payroll.status = "approved" || payroll.status = "paid")`, sort: "-created", expand: "payroll" })
  );
  if (q.isLoading) return <Skeleton className="h-40 w-full rounded-xl" />;
  const rows = ((q.data || []) as any[]).sort((a, b) => (b.expand?.payroll?.year * 100 + b.expand?.payroll?.month) - (a.expand?.payroll?.year * 100 + a.expand?.payroll?.month));
  if (!rows.length)
    return (
      <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
        <Wallet size={26} className="text-slate-400" />
        <p className="text-[14px] font-medium text-slate-800">No payslip yet</p>
        <p className="max-w-sm text-[12.5px] text-slate-500">Your payslip appears here once the monthly payroll is approved.</p>
      </div>
    );
  const last = rows[0];
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          ["Last net pay", `RWF ${rwf(last.net)}`, last.expand?.payroll?.period_label],
          ["Gross salary", `RWF ${rwf(last.gross)}`, "Basic + allowances"],
          ["Tax and contributions", `RWF ${rwf(last.total_deductions)}`, "PAYE, RSSB, CBHI and other deductions"],
        ].map(([k, v, s]) => (
          <div key={k} className="rounded-xl border border-slate-200 bg-white px-3.5 py-3"><p className="text-[11.5px] text-slate-500">{k}</p><p className="text-[17px] font-semibold tabular-nums">{v}</p><p className="text-[11.5px] text-slate-400">{s}</p></div>
        ))}
      </div>
      <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">
        {rows.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(s)} className="flex w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-slate-50">
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primaryDark"><FileText size={18} /></span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-medium text-slate-900">{s.expand?.payroll?.period_label}</span>
                <span className="text-[12px] text-slate-500">Gross {rwf(s.gross)} · PAYE {rwf(s.paye)} · RSSB {rwf(s.pension_ee + s.maternity_ee)} · CBHI {rwf(s.cbhi)}</span>
              </span>
              <span className="text-right">
                <span className="block text-[15px] font-semibold tabular-nums">{rwf(s.net)}</span>
                <span className="text-[11.5px] text-slate-500">{s.expand?.payroll?.status === "paid" ? "Paid" : "Approved"}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      <PayslipDialog slip={open} payroll={open?.expand?.payroll} onClose={() => setOpen(null)} />
    </div>
  );
}
