import * as React from "react";
import { useQuery } from "react-query";
import { Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Skeleton } from "@/components/ui/skeleton";
import { PayslipDialog, byPeriodDesc, payrollOf } from "@/pages/hr/payroll/Payslip";
import { Column, DataTable, EmptyState, KpiBand, Num, StatusPill, fmtDate, fmtMoney } from "@/components/ims";

const sum = (rows: any[], f: (s: any) => number) => rows.reduce((a, s) => a + (Number(f(s)) || 0), 0);
const rssb = (s: any) => (Number(s.pension_ee) || 0) + (Number(s.maternity_ee) || 0);
const other = (s: any) => (Number(s.loans) || 0) + (Number(s.advances) || 0);

/** The employee's payslips from approved and paid payrolls. */
export default function MyPayslips({ employeeId }: { employeeId: string }) {
  const [open, setOpen] = React.useState<any>(null);
  const q = useQuery(["my-payslips", employeeId], () =>
    pocketbase.collection("employees_payrolls").getFullList({ filter: `employee = "${employeeId}" && (payroll.status = "approved" || payroll.status = "paid")`, sort: "-created", expand: "payroll" })
  );
  if (q.isLoading) return <div className="space-y-3"><Skeleton className="h-24 w-full rounded-card" /><Skeleton className="h-40 w-full rounded-card" /></div>;
  const rows = ((q.data || []) as any[]).sort(byPeriodDesc);
  if (!rows.length) return <EmptyState icon={Wallet} text="No payslip yet. A payslip appears here once the monthly payroll is approved." />;

  const last = rows[0];
  const year = Number(payrollOf(last)?.year) || new Date().getFullYear();
  const thisYear = rows.filter((s) => Number(payrollOf(s)?.year) === year);
  const columns: Column<any>[] = [
    { key: "period", header: "Period", nowrap: true, cell: (s) => <span className="font-semibold text-ims-text">{payrollOf(s)?.period_label || "—"}</span>, sub: (s) => payrollOf(s)?.number },
    { key: "gross", header: "Gross (RWF)", numeric: true, cell: (s) => <Num value={s.gross} />, total: <Num value={sum(rows, (s) => s.gross)} /> },
    { key: "paye", header: "PAYE (RWF)", numeric: true, cell: (s) => <Num value={s.paye} />, total: <Num value={sum(rows, (s) => s.paye)} /> },
    { key: "rssb", header: "RSSB (RWF)", numeric: true, cell: (s) => <Num value={rssb(s)} />, total: <Num value={sum(rows, rssb)} /> },
    { key: "cbhi", header: "CBHI (RWF)", numeric: true, cell: (s) => <Num value={s.cbhi} />, total: <Num value={sum(rows, (s) => s.cbhi)} /> },
    { key: "other", header: "Loans and advances (RWF)", numeric: true, cell: (s) => (other(s) ? <Num value={other(s)} /> : <span className="text-ims-faint">—</span>), total: sum(rows, other) ? <Num value={sum(rows, other)} /> : "—" },
    { key: "net", header: "Net pay (RWF)", numeric: true, className: "font-bold", cell: (s) => <Num value={s.net} />, total: <Num value={sum(rows, (s) => s.net)} /> },
    {
      key: "status",
      header: "Status",
      cell: (s) => {
        const p = payrollOf(s);
        return p?.status === "paid" ? <StatusPill status="Completed" sub={p?.paid_at ? `Paid ${fmtDate(p.paid_at)}` : "Paid"} /> : <StatusPill status="Approved" sub="To be paid" />;
      },
    },
  ];

  return (
    <div className="min-w-0 space-y-4">
      <KpiBand
        items={[
          { label: "Last net pay", value: fmtMoney(last.net), sub: payrollOf(last)?.period_label, onClick: () => setOpen(last) },
          { label: "Gross salary", value: fmtMoney(last.gross), sub: "Basic and allowances" },
          { label: "Tax and contributions", value: fmtMoney(last.total_deductions), sub: "PAYE, RSSB, CBHI and others" },
          { label: "Payslips", value: rows.length, sub: `${thisYear.length} in ${year}` },
        ]}
      />
      <div className="overflow-hidden rounded-control border border-ims-border">
        <DataTable columns={columns} rows={rows} rowKey={(s) => s.id} onRowClick={(s) => setOpen(s)} minWidth={900} caption="Payslips" />
      </div>
      <PayslipDialog slip={open} payroll={payrollOf(open)} onClose={() => setOpen(null)} />
    </div>
  );
}
