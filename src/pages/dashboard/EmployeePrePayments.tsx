/**
 * Someone's expense claims and salary advances — their own under My workspace → Expenses, or a colleague's on the
 * employee profile for HR and Finance. Requests go to the head of department, then the Director of Finance; the
 * Cashier pays them. Opening a row shows the request with its approvals, documents and payment.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { Plus, Receipt } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { EXPENSE_FINANCE, EXPENSE_KIND, EXPENSE_STATUS, EXPENSE_WORD, PAY_BY } from "@/lib/expenses";
import ExpenseRequestDialog from "@/components/expenses/ExpenseRequestDialog";
import { Button, Column, DataTable, DocNo, EmptyState, Num, StatusPill, TwoLine, fmtDate, fmtMoney } from "@/components/ims";

export default function EmployeePrePayments({ employeeId, autoOpen = false }: { employeeId: string; autoOpen?: boolean }) {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { can } = usePermissions();
  const isSelf = user?.id === employeeId;
  const [asking, setAsking] = React.useState(autoOpen && isSelf);
  const q = useQuery(["employee-expenses", employeeId], () =>
    pocketbase.collection("prepayments").getFullList({ filter: `employee = "${employeeId}" && status != "draft"`, sort: "-created", expand: "expenseCategory" }), { enabled: Boolean(employeeId) }
  );
  const rows = (q.data || []) as any[];
  const waiting = rows.filter((r) => r.status === "pending_approval" || r.status === "approved");
  const year = new Date().toISOString().slice(0, 4);
  const paidYear = rows.filter((r) => (r.status === "paid" || r.status === "recovered") && String(r.paid_at).slice(0, 4) === year);
  const open = (r: any) => {
    if (!r.number) return;
    if (isSelf) navigate(`/dashboard/my/expenses/${r.id}`);
    else if (can(EXPENSE_FINANCE)) navigate(`/dashboard/finance/staff-expenses/${r.id}`);
  };
  const columns: Column<any>[] = [
    { key: "number", header: "Request", nowrap: true, cell: (r) => <DocNo value={r.number || "—"} />, sub: (r) => EXPENSE_KIND[r.kind] || "Expense" },
    { key: "what", header: "What for", clamp: true, width: "40%", cell: (r) => <TwoLine main={r.description} sub={r.expand?.expenseCategory?.name} /> },
    { key: "date", header: "Date", nowrap: true, cell: (r) => fmtDate(r.date), sub: (r) => PAY_BY[r.pay_by] },
    { key: "amount", header: "Amount (RWF)", numeric: true, cell: (r) => <Num value={Math.round(r.amount)} /> },
    {
      key: "status", header: "Status", nowrap: true,
      cell: (r) => <StatusPill status={r.status} map={EXPENSE_WORD} sub={r.status === "returned" && isSelf ? "Correct and send again" : r.status === "paid" && r.kind === "advance" ? "Deducted from the next payslip" : EXPENSE_STATUS[r.status]?.note} />,
    },
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-t-section text-ims-text">{isSelf ? "My expenses and advances" : "Expenses and advances"}</h2>
          <p className="mt-0.5 text-t-small text-ims-muted">
            {waiting.length ? `${waiting.length} in progress (${fmtMoney(waiting.reduce((t, r) => t + Math.round(r.amount), 0))})` : "Nothing in progress"}
            {paidYear.length ? ` · ${fmtMoney(paidYear.reduce((t, r) => t + Math.round(r.amount), 0))} paid in ${year}` : ""}
          </p>
        </div>
        {isSelf && <Button variant="primary" icon={Plus} onClick={() => setAsking(true)}>Ask for money</Button>}
      </div>
      <div className="overflow-hidden rounded-card border border-ims-border">
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          onRowClick={isSelf || can(EXPENSE_FINANCE) ? open : undefined}
          loading={q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          minWidth={760}
          empty={<EmptyState icon={Receipt} text={isSelf ? "You have not asked for any reimbursement or advance yet." : "No expense claim or advance."} action={isSelf ? <Button variant="primary" icon={Plus} onClick={() => setAsking(true)}>Ask for money</Button> : undefined} />}
        />
      </div>
      {isSelf && <ExpenseRequestDialog open={asking} onClose={() => setAsking(false)} onSaved={(r) => { q.refetch(); navigate(`/dashboard/my/expenses/${r.id}`); }} />}
    </div>
  );
}
