import { useQuery } from "react-query";
import { Printer } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button, Modal, fmtMoney, fmtNumber } from "@/components/ims";
import { cn } from "@/utils";

/** Printable payslip with the full Rwanda statutory breakdown. */
/** The payroll run of a payslip: expanded for HR, otherwise the copy kept on the payslip (staff cannot read runs). */
export const payrollOf = (slip: any) =>
  slip?.expand?.payroll || (slip ? { period_label: slip.period_label, number: slip.payroll_number, status: slip.payroll_status, year: slip.period_year, month: slip.period_month, paid_at: slip.paid_at } : null);
/** Newest period first. */
export const byPeriodDesc = (a: any, b: any) => {
  const k = (s: any) => { const p = payrollOf(s); return (Number(p?.year) || 0) * 100 + (Number(p?.month) || 0); };
  return k(b) - k(a);
};

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
    ["PAYE (income tax)", slip.paye, `Taxable income ${fmtMoney(slip.taxable_income)}`],
    ...((slip.contributions || []) as any[]).filter((c) => c.ee > 0).map((c) => [`${c.name} (${c.ee_rate}%)`, c.ee, `Base ${fmtMoney(c.base)}`] as [string, number, string]),
    ...((slip.other_deductions || []) as any[]).map((d) => [d.name, d.amount] as [string, number]),
    ...(slip.advances ? [["Salary advance recovered", slip.advances] as [string, number]] : []),
    ...(((slip.loan_deductions || []) as any[]).length
      ? (slip.loan_deductions as any[]).map((l) => [`Staff loan instalment (${l.number})`, l.amount] as [string, number])
      : slip.loans ? [["Staff loan instalment", slip.loans] as [string, number]] : []),
  ];
  const employer = ((slip.contributions || []) as any[]).filter((c) => c.er > 0);
  const row = "flex justify-between gap-3 py-1";
  return (
    <div className="payslip mx-auto max-w-3xl bg-ims-card text-t-small text-ims-text">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b-2 border-ims-text pb-3">
        <div>
          <p className="text-[16px] font-bold text-ims-text">{org.company_name || "Organisation"}</p>
          <p className="text-ims-body">{org.company_address}</p>
          {org.payroll_employer_tin && <p className="text-ims-body">TIN {org.payroll_employer_tin}{org.payroll_rssb_number ? ` · RSSB ${org.payroll_rssb_number}` : ""}</p>}
        </div>
        <div className="text-right">
          <p className="text-[18px] font-bold text-ims-text">Payslip</p>
          <p className="font-medium">{payroll?.period_label}</p>
          <p className="whitespace-nowrap font-mono text-ims-muted">{payroll?.number}</p>
        </div>
      </header>
      <section className="grid grid-cols-2 gap-x-6 gap-y-2 border-b border-ims-border py-3 sm:grid-cols-4">
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
          <div key={k}><p className="text-t-hint text-ims-muted">{k}</p><p className="font-medium capitalize">{v || "—"}</p></div>
        ))}
        {slip.working_days && slip.working_days < 28 && <p className="col-span-full text-t-hint text-ims-warning">Prorated: {slip.working_days} days of the month (joined during the period).</p>}
      </section>
      <section className="grid gap-6 py-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 border-b border-ims-field pb-1 text-t-label">Earnings (RWF)</h3>
          {earnings.map(([k, v]) => <div key={k} className={row}><span>{k}</span><span className="tabular-nums">{fmtNumber(v)}</span></div>)}
          <div className={cn(row, "mt-1 border-t border-ims-field font-bold")}><span>Gross salary</span><span className="tabular-nums">{fmtNumber(slip.gross)}</span></div>
        </div>
        <div>
          <h3 className="mb-1 border-b border-ims-field pb-1 text-t-label">Deductions (RWF)</h3>
          {deductions.map(([k, v, hint]) => (
            <div key={k} className={row}><span>{k}{hint && <span className="block text-t-hint text-ims-muted">{hint}</span>}</span><span className="tabular-nums">{fmtNumber(v)}</span></div>
          ))}
          <div className={cn(row, "mt-1 border-t border-ims-field font-bold")}><span>Total deductions</span><span className="tabular-nums">{fmtNumber(slip.total_deductions)}</span></div>
        </div>
      </section>
      <section className="flex items-center justify-between rounded-control bg-ims-primary px-4 py-3 text-white">
        <span className="text-t-body font-semibold">Net pay</span>
        <span className="text-[20px] font-bold tabular-nums">{fmtMoney(slip.net)}</span>
      </section>
      <section className="grid gap-6 py-3 sm:grid-cols-2">
        <div>
          <h3 className="mb-1 text-t-hint font-bold text-ims-muted">PAYE calculation (RWF)</h3>
          {((slip.paye_breakdown || []) as any[]).map((b, i) => (
            <div key={i} className="flex justify-between gap-2 text-t-hint text-ims-body">
              <span>{fmtNumber(b.from)} – {b.to ? fmtNumber(b.to) : "above"} at {b.rate}%</span>
              <span className="tabular-nums">{fmtNumber(b.amount)} → {fmtNumber(b.tax)}</span>
            </div>
          ))}
        </div>
        <div>
          <h3 className="mb-1 text-t-hint font-bold text-ims-muted">Paid by the employer, not deducted (RWF)</h3>
          {employer.map((c) => <div key={c.code} className="flex justify-between text-t-hint text-ims-body"><span>{c.name} ({c.er_rate}%)</span><span className="tabular-nums">{fmtNumber(c.er)}</span></div>)}
          <div className="mt-1 flex justify-between border-t border-ims-border pt-1 text-t-hint font-semibold"><span>Total cost to the employer</span><span className="tabular-nums">{fmtNumber(slip.employer_cost)}</span></div>
        </div>
      </section>
      <footer className="border-t border-ims-border pt-2 text-t-hint text-ims-muted">
        Computer-generated payslip. The employer declares PAYE to the Rwanda Revenue Authority and contributions to the Rwanda Social Security Board.
      </footer>
    </div>
  );
}

export function PayslipDialog({ slip, payroll, onClose }: { slip: any | null; payroll: any; onClose: () => void }) {
  return (
    <Modal
      open={Boolean(slip)}
      onClose={onClose}
      size="lg"
      title={`Payslip · ${slip?.employee_name || ""}`}
      description={payroll?.period_label}
      footer={
        <>
          <Button onClick={onClose} className="print:hidden">Close</Button>
          <Button variant="primary" icon={Printer} onClick={() => window.print()} className="print:hidden">Print or save as PDF</Button>
        </>
      }
    >
      {slip && <PayslipView slip={slip} payroll={payroll} />}
    </Modal>
  );
}
