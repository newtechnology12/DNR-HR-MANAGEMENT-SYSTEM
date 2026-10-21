/**
 * Bank & cash → Salary payments (Cashier). Approved payrolls to pay, with the total to transfer to each bank;
 * once the bank has executed the transfer the Cashier records the payment from the account used. Who is paid
 * what (the bank file) is payroll data: only HR & Payroll, the DAF, the SG and the Internal Auditor get it.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { Banknote, CheckCircle2, FileDown, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { rwf, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { PayDialog } from "@/pages/hr/payroll/PayrollRun";

interface Run {
  id: string; number: string; period_label: string; status: string; headcount: number; total_net: number; approved_at: string; paid_at: string;
  payment_reference: string; payment_account: { id: string; code: string; name: string } | null; paid_by: string; prepared_by: string; prepared_by_name: string;
}
interface Transfers {
  number: string; period_label: string; total_net: number;
  banks: { bank: string; count: number; total: number }[];
  other: { count: number; total: number };
  /** The bank file — null for people who may not see payroll data. */
  rows: { employee_name: string; payment_method: string; bank_name: string; bank_account: string; net: number }[] | null;
}

const api = {
  queue: () => (pocketbase.send("/api/ims/salary-payments", {}) as Promise<{ items: Run[] }>).then((r) => r.items),
  transfers: (id: string) => pocketbase.send(`/api/ims/salary-payments/${id}/transfers`, {}) as Promise<Transfers>,
};
const refOf = (period: string) => `SALARY ${String(period || "").toUpperCase()}`;

async function exportTransfers(t: Transfers, format: ExportFormat, bank?: string) {
  const rows = (t.rows || []).filter((r) => r.payment_method === "bank" && (!bank || (r.bank_name || "No bank recorded") === bank));
  await exportReport({
    title: `Salary transfers${bank ? ` — ${bank}` : ""} — ${t.period_label}`, subtitle: `${t.number} · reference "${refOf(t.period_label)}"`, rows, format, what: `payroll_bank_file:${t.number}`,
    fileName: `${t.number}-bank${bank ? `-${bank.toLowerCase().replace(/[^a-z0-9]+/g, "-")}` : ""}`, totals: ["Amount"],
    columns: [
      { header: "Beneficiary", value: (r) => r.employee_name, width: 26 }, { header: "Bank", value: (r) => r.bank_name || "", width: 20 },
      { header: "Account number", value: (r) => r.bank_account || "", width: 18 }, { header: "Amount", value: (r) => r.net, format: "money" },
      { header: "Currency", value: () => "RWF", width: 7 }, { header: "Reference", value: () => refOf(t.period_label), width: 22 },
    ],
  });
}

export default function SalaryPayments() {
  const { user }: any = useAuth();
  const { can } = usePermissions();
  const [paying, setPaying] = React.useState<Run | null>(null);
  const q = useQuery(["salary-payments"], api.queue);
  const runs = q.data || [];
  const due = runs.filter((r) => r.status === "approved");
  const paid = runs.filter((r) => r.status === "paid");
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Salary payments"
        description="Approved payrolls to pay, with the amount to transfer to each bank. Once the bank has executed the transfer, record the payment: the cash book and the general ledger are updated and staff can see their payslips."
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Salary payments", link: "/dashboard/treasury/salaries" }]}
      />
      {q.isLoading ? <ListSkeleton rows={4} /> : q.isError ? <p className="text-[13px] text-red-700">{errorMessage(q.error)}</p> : (
        <>
          {due.length ? due.map((r) => <DueCard key={r.id} run={r} canPay={can("mark_payroll_paid") && r.prepared_by !== user?.id} onPay={() => setPaying(r)} />) : (
            <EmptyState icon={CheckCircle2} title="Nothing to pay" text="Payrolls appear here once their approval is complete." />
          )}
          <Panel title="Paid salaries" subtitle="The last payrolls paid, with the account and the bank reference.">
            {paid.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-[13px]">
                  <thead><tr className="border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500"><th className="py-2 pr-3">Payroll</th><th className="py-2 pr-3">Paid on</th><th className="py-2 pr-3">From</th><th className="py-2 pr-3">Reference</th><th className="py-2 pr-3">Paid by</th><th className="py-2 text-right">Net pay</th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {paid.map((r) => (
                      <tr key={r.id}>
                        <td className="py-2 pr-3"><span className="block font-medium">{r.period_label}</span><span className="font-mono text-[11.5px] text-slate-500">{r.number} · {r.headcount} employees</span></td>
                        <td className="py-2 pr-3">{showDay(r.paid_at)}</td>
                        <td className="py-2 pr-3">{r.payment_account ? `${r.payment_account.code} · ${r.payment_account.name}` : "—"}</td>
                        <td className="py-2 pr-3 font-mono text-[12px]">{r.payment_reference || "—"}</td>
                        <td className="py-2 pr-3">{r.paid_by || "—"}</td>
                        <td className="py-2 text-right font-semibold tabular-nums">{rwf(r.total_net)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-[13px] text-slate-500">No salaries paid yet.</p>}
          </Panel>
        </>
      )}
      {paying && <PayDialog payroll={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); q.refetch(); }} />}
    </div>
  );
}

function DueCard({ run, canPay, onPay }: { run: Run; canPay: boolean; onPay: () => void }) {
  const t = useQuery(["salary-transfers", run.id], () => api.transfers(run.id));
  const file = Boolean(t.data?.rows);
  const other = t.data?.other || { count: 0, total: 0 };
  return (
    <section className="rounded-lg border border-amber-200 bg-white shadow-card">
      <div className="flex flex-col gap-3 border-b border-amber-100 bg-amber-50/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-800"><Wallet size={18} /></span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold text-slate-900">{run.period_label} salaries <span className="ml-1 font-mono text-[12px] font-normal text-slate-500">{run.number}</span></p>
            <p className="text-[12.5px] text-slate-500">{run.headcount} employees · approved {showDay(run.approved_at)} · prepared by {run.prepared_by_name || "HR"}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="mr-2 text-[20px] font-semibold tabular-nums text-slate-900">{rwf(run.total_net)}</p>
          {file && <ExportMenu label="Bank file" permission={["export_payroll", "view_payroll_details"]} onExport={(f) => exportTransfers(t.data!, f)} />}
          {canPay ? <Button size="sm" onClick={onPay}><Banknote size={14} /> Record payment</Button> : <span className="text-[12px] text-slate-500">The person who prepared the payroll cannot pay it.</span>}
        </div>
      </div>
      <div className="grid gap-2 px-4 py-3 sm:grid-cols-2 lg:grid-cols-4">
        {t.isLoading ? <ListSkeleton rows={1} /> : t.isError ? <p className="text-[12.5px] text-red-700">{errorMessage(t.error)}</p> : (t.data?.banks || []).map((b) => (
          <div key={b.bank} className="rounded-md border border-slate-200 px-3 py-2">
            <p className="truncate text-[12.5px] font-medium">{b.bank}</p>
            <p className="text-[15px] font-semibold tabular-nums">{rwf(b.total)}</p>
            <p className="flex items-center justify-between text-[11.5px] text-slate-500">{b.count} transfer{b.count === 1 ? "" : "s"}
              {file && <button type="button" onClick={() => exportTransfers(t.data!, "csv", b.bank)} className="inline-flex items-center gap-1 font-medium text-primaryDark hover:underline"><FileDown size={12} /> CSV</button>}
            </p>
          </div>
        ))}
        {other.count > 0 && <p className="text-[12px] text-slate-500 sm:col-span-2 lg:col-span-4">{other.count} employee{other.count === 1 ? " is" : "s are"} paid by mobile money or cash ({rwf(other.total)}) — not part of the bank transfer.</p>}
      </div>
      <p className="border-t border-slate-100 px-4 py-2 text-[12px] text-slate-500">
        Reference on every transfer: <b className="font-mono">{refOf(run.period_label)}</b>.{" "}
        {file ? "Record the payment once the bank has executed the transfer." : "The bank file with each employee's account comes from HR & Payroll — payroll details are visible only to HR, the DAF, the SG and the Internal Auditor. Check the bank's debit against the totals above, then record the payment."}
      </p>
    </section>
  );
}
