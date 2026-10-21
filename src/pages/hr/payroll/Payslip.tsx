import * as React from "react";
import { useQuery } from "react-query";
import { Printer } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { rwf } from "@/lib/hr";
import { cn } from "@/utils";

/** Printable payslip with the full Rwanda statutory breakdown. */
export function PayslipView({ slip, payroll }: { slip: any; payroll: any }) {
  const settings = useQuery(["settings-record"], () => pocketbase.collection("settings").getList(1, 1).then((r) => r.items[0]), { staleTime: 5 * 60_000 });
  const org: any = settings.data || {};
  const earnings: [string, number][] = [
    ["Basic salary", slip.basic],
    ["Transport allowance", slip.transport],
    ["Housing allowance", slip.housing],
    ["Communication allowance", slip.communication],
    ...((slip.allowances || []) as any[]).map((a) => [a.name, a.amount] as [string, number]),
  ].filter(([, v]) => Number(v) > 0) as [string, number][];
  const deductions: [string, number, string?][] = [
    ["PAYE (income tax)", slip.paye, `Taxable income ${rwf(slip.taxable_income)}`],
    ...((slip.contributions || []) as any[]).filter((c) => c.ee > 0).map((c) => [`${c.name} (${c.ee_rate}%)`, c.ee, `Base ${rwf(c.base)}`] as [string, number, string]),
    ...((slip.other_deductions || []) as any[]).map((d) => [d.name, d.amount] as [string, number]),
    ...(slip.advances ? [["Salary advance recovered", slip.advances] as [string, number]] : []),
  ];
  const employer = ((slip.contributions || []) as any[]).filter((c) => c.er > 0);
  const row = "flex justify-between gap-3 py-1";
  return (
    <div className="payslip mx-auto max-w-3xl bg-white text-[12.5px] text-slate-800">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-slate-800 pb-3">
        <div>
          <p className="text-[16px] font-bold uppercase tracking-wide text-slate-900">{org.company_name || "Organisation"}</p>
          <p className="text-slate-600">{org.company_address}</p>
          {org.payroll_employer_tin && <p className="text-slate-600">TIN {org.payroll_employer_tin}{org.payroll_rssb_number ? ` · RSSB ${org.payroll_rssb_number}` : ""}</p>}
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold text-slate-900">PAYSLIP</p>
          <p className="font-medium">{payroll?.period_label}</p>
          <p className="text-slate-500">{payroll?.number}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-x-6 gap-y-1 border-b border-slate-200 py-3 sm:grid-cols-4">
        {[
          ["Employee", slip.employee_name],
          ["Department", slip.department_name],
          ["Position", slip.designation_name],
          ["Employment", slip.employment_type],
          ["RSSB number", slip.rssb_number],
          ["TIN", slip.tin],
          ["Bank", slip.bank_name],
          ["Account", slip.bank_account],
        ].map(([k, v]) => (
          <div key={k}><p className="text-[11px] uppercase tracking-wide text-slate-500">{k}</p><p className="font-medium capitalize">{v || "—"}</p></div>
        ))}
        {slip.working_days && slip.working_days < 28 && <p className="col-span-full text-[11.5px] text-amber-700">Prorated: {slip.working_days} days of the month (joined during the period).</p>}
      </section>
      <section className="grid gap-6 py-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 border-b border-slate-300 pb-1 text-[12px] font-bold uppercase tracking-wide">Earnings</h3>
          {earnings.map(([k, v]) => <div key={k} className={row}><span>{k}</span><span className="tabular-nums">{rwf(v)}</span></div>)}
          <div className={cn(row, "mt-1 border-t border-slate-300 font-bold")}><span>Gross salary</span><span className="tabular-nums">{rwf(slip.gross)}</span></div>
        </div>
        <div>
          <h3 className="mb-1 border-b border-slate-300 pb-1 text-[12px] font-bold uppercase tracking-wide">Deductions</h3>
          {deductions.map(([k, v, hint]) => (
            <div key={k} className={row}><span>{k}{hint && <span className="block text-[10.5px] text-slate-500">{hint}</span>}</span><span className="tabular-nums">{rwf(v)}</span></div>
          ))}
          <div className={cn(row, "mt-1 border-t border-slate-300 font-bold")}><span>Total deductions</span><span className="tabular-nums">{rwf(slip.total_deductions)}</span></div>
        </div>
      </section>
      <section className="flex items-center justify-between rounded-md bg-ralga-ink px-4 py-3 text-white">
        <span className="text-[13px] font-semibold uppercase tracking-wide">Net pay</span>
        <span className="text-[20px] font-bold tabular-nums">RWF {rwf(slip.net)}</span>
      </section>
      <section className="grid gap-6 py-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">PAYE calculation</h3>
          {((slip.paye_breakdown || []) as any[]).map((b, i) => (
            <div key={i} className="flex justify-between gap-2 text-[11.5px] text-slate-600">
              <span>{rwf(b.from)} – {b.to ? rwf(b.to) : "above"} at {b.rate}%</span>
              <span className="tabular-nums">{rwf(b.amount)} → {rwf(b.tax)}</span>
            </div>
          ))}
        </div>
        <div>
          <h3 className="mb-1 text-[11.5px] font-bold uppercase tracking-wide text-slate-500">Paid by the employer (not deducted)</h3>
          {employer.map((c) => <div key={c.code} className="flex justify-between text-[11.5px] text-slate-600"><span>{c.name} ({c.er_rate}%)</span><span className="tabular-nums">{rwf(c.er)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-slate-200 pt-1 text-[11.5px] font-semibold"><span>Total cost to employer</span><span className="tabular-nums">{rwf(slip.employer_cost)}</span></div>
        </div>
      </section>
      <footer className="border-t border-slate-200 pt-2 text-[10.5px] text-slate-500">
        Computer-generated payslip. PAYE is declared to the Rwanda Revenue Authority and contributions to the Rwanda Social Security Board by the employer.
      </footer>
    </div>
  );
}

export function PayslipDialog({ slip, payroll, onClose }: { slip: any | null; payroll: any; onClose: () => void }) {
  return (
    <Dialog open={Boolean(slip)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[100dvh] w-full max-w-3xl overflow-y-auto bg-white sm:max-h-[94vh]">
        <DialogHeader className="print:hidden">
          <DialogTitle>Payslip — {slip?.employee_name}</DialogTitle>
          <DialogDescription>{payroll?.period_label}</DialogDescription>
        </DialogHeader>
        {slip && <PayslipView slip={slip} payroll={payroll} />}
        <div className="flex justify-end print:hidden">
          <Button variant="outline" onClick={() => window.print()}><Printer size={15} /> Print / save PDF</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
