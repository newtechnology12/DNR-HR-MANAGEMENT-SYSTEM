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
import { errorMessage } from "@/lib/procurement";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { Skeleton } from "@/components/ui/skeleton";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Button, Card, CardHeader, Column, DataTable, DocNo, EmptyState, ErrorState, Num, Page, PageHeader, StatusPill, fmtDate, fmtMoney, fmtNumber } from "@/components/ims";
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

  const paidColumns: Column<Run>[] = [
    { key: "payroll", header: "Payroll", cell: (r) => <span className="font-semibold text-ims-text">{r.period_label}</span>, sub: (r) => <><DocNo value={r.number} className="text-t-small text-ims-muted" /> · {fmtNumber(r.headcount)} employees</> },
    { key: "paid_at", header: "Paid on", nowrap: true, cell: (r) => fmtDate(r.paid_at) },
    { key: "from", header: "From", cell: (r) => (r.payment_account ? r.payment_account.code : "—"), sub: (r) => r.payment_account?.name },
    { key: "ref", header: "Reference", nowrap: true, cell: (r) => (r.payment_reference ? <span className="font-mono text-t-small">{r.payment_reference}</span> : "—") },
    { key: "by", header: "Paid by", cell: (r) => r.paid_by || "—" },
    { key: "net", header: "Net pay (RWF)", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.total_net} /></span>, total: <Num value={paid.reduce((s, r) => s + (r.total_net || 0), 0)} /> },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Bank & cash", to: "/dashboard/treasury" }, { label: "Salary payments" }]}
        title="Salary payments"
        subtitle="Approved payrolls to pay and the amount for each bank, recorded once the bank has paid."
      />
      {q.isLoading ? (
        <>
          <Skeleton className="h-48 w-full rounded-card" />
          <Skeleton className="h-40 w-full rounded-card" />
        </>
      ) : q.isError ? (
        <Card>
          <ErrorState text="The salary payments could not be loaded." detail={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </Card>
      ) : (
        <>
          {due.length ? (
            due.map((r) => <DueCard key={r.id} run={r} canPay={can("mark_payroll_paid") && r.prepared_by !== user?.id} onPay={() => setPaying(r)} />)
          ) : (
            <Card>
              <EmptyState icon={CheckCircle2} text="Nothing to pay. Payrolls appear here once their approval is complete." />
            </Card>
          )}
          <Card padded={false} className="overflow-hidden">
            <div className="px-5 pt-5">
              <CardHeader title="Paid salaries" subtitle="The last payrolls paid, with the account and the bank reference." />
            </div>
            <DataTable
              columns={paidColumns}
              rows={paid}
              rowKey={(r) => r.id}
              minWidth={760}
              caption="Paid salaries"
              empty={<EmptyState compact icon={Wallet} text="No salaries paid yet." />}
            />
          </Card>
        </>
      )}
      {paying && <PayDialog payroll={paying} onClose={() => setPaying(null)} onDone={() => { setPaying(null); q.refetch(); }} />}
    </Page>
  );
}

function DueCard({ run, canPay, onPay }: { run: Run; canPay: boolean; onPay: () => void }) {
  const t = useQuery(["salary-transfers", run.id], () => api.transfers(run.id));
  const file = Boolean(t.data?.rows);
  const other = t.data?.other || { count: 0, total: 0 };
  const banks = t.data?.banks || [];

  const columns: Column<{ bank: string; count: number; total: number }>[] = [
    { key: "bank", header: "Bank", cell: (b) => <span className="font-semibold text-ims-text">{b.bank}</span> },
    { key: "count", header: "Transfers", numeric: true, cell: (b) => fmtNumber(b.count), total: fmtNumber(banks.reduce((s, b) => s + b.count, 0)) },
    { key: "total", header: "Amount (RWF)", numeric: true, cell: (b) => <Num value={b.total} />, total: <Num value={banks.reduce((s, b) => s + b.total, 0)} /> },
    ...(file
      ? [{
          key: "csv",
          header: "Bank file",
          width: "120px",
          cell: (b: { bank: string }) => (
            <button type="button" onClick={() => exportTransfers(t.data!, "csv", b.bank)} className="inline-flex items-center gap-1 text-t-small font-bold text-ims-link hover:underline">
              <FileDown size={13} aria-hidden /> CSV
            </button>
          ),
        }]
      : []),
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="flex flex-col gap-3 px-5 pb-4 pt-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2">
            <DocNo value={run.number} />
            <StatusPill status="Approved" />
            <span className="text-t-small text-ims-muted">To pay</span>
          </p>
          <h2 className="mt-1 text-t-section text-ims-text">{run.period_label} salaries</h2>
          <p className="mt-0.5 text-t-small text-ims-muted">
            {fmtNumber(run.headcount)} employees · approved {fmtDate(run.approved_at)} · prepared by {run.prepared_by_name || "HR"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <span className="mr-2 text-t-kpi tabular-nums text-ims-text">{fmtMoney(run.total_net)}</span>
          {file && <ExportMenu label="Bank file" permission={["export_payroll", "view_payroll_details"]} onExport={(f) => exportTransfers(t.data!, f)} size="default" />}
          {canPay ? (
            <Button variant="primary" icon={Banknote} onClick={onPay}>Record payment</Button>
          ) : (
            <span className="text-t-small text-ims-muted">The person who prepared the payroll cannot pay it.</span>
          )}
        </div>
      </div>
      {t.isError ? (
        <p role="alert" className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-danger">{errorMessage(t.error)}</p>
      ) : (
        <DataTable
          columns={columns}
          rows={banks}
          rowKey={(b) => b.bank}
          loading={t.isLoading}
          totalLabel="Total by bank transfer"
          minWidth={480}
          caption={`Bank transfers for ${run.period_label}`}
          empty={<EmptyState compact text="No employee is paid by bank transfer." />}
        />
      )}
      <div className="space-y-1 border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">
        {other.count > 0 && (
          <p>
            {fmtNumber(other.count)} employee{other.count === 1 ? " is" : "s are"} paid by mobile money or cash ({fmtMoney(other.total)}), not part of the bank transfer.
          </p>
        )}
        <p>
          Reference on every transfer: <b className="font-mono text-ims-text">{refOf(run.period_label)}</b>.{" "}
          {file
            ? "Record the payment once the bank has executed the transfer."
            : "The bank file with each employee's account comes from HR & Payroll: payroll details are visible only to HR, the DAF, the SG and the Internal Auditor. Check the bank's debit against the totals above, then record the payment."}
        </p>
      </div>
    </Card>
  );
}
