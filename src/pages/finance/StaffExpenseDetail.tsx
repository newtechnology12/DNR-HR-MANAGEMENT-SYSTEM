/**
 * One staff expense claim or salary advance: what was asked and why, its approval (head of department → DAF), the
 * payment by the Cashier with its cash book entry and journal, and — for an advance — the payroll that recovered it.
 * Opened by finance from Payables → Staff expenses and by the member of staff from My workspace → Expenses.
 */
import * as React from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { Banknote, Pencil, Receipt, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { EXPENSE_KIND, EXPENSE_STATUS, EXPENSE_WORD, PAY_BY, expensesApi } from "@/lib/expenses";
import { ApprovalTracker } from "@/components/enterprise/Approval";
import { DecisionButtons, useApprovalTrail } from "@/components/enterprise/useApprovalTrail";
import DocumentUploads from "@/components/enterprise/Attachments";
import { Chatter, toChatter } from "@/components/enterprise/DocumentLayout";
import { ListSkeleton } from "@/components/enterprise/ui";
import ExpenseRequestDialog from "@/components/expenses/ExpenseRequestDialog";
import PayExpenseDialog from "@/components/expenses/PayExpenseDialog";
import { Button, Card, ConfirmDialog, DetailHeader, Details, EmptyState, Page, Tabs, fmtDate, fmtDateTime, fmtMoney, notify } from "@/components/ims";

export default function StaffExpenseDetail() {
  const { expenseId } = useParams();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const { can } = usePermissions();
  const mine = pathname.startsWith("/dashboard/my/");
  const [tab, setTab] = React.useState("details");
  const [paying, setPaying] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const q = useQuery(["staff-expense", expenseId], () =>
    pocketbase.collection("prepayments").getOne(expenseId!, { expand: "employee,department,expenseCategory,gl_account,budget_line,funding_source,paid_from,paid_by,journal,approval,recovered_in" })
  );
  const trail = useApprovalTrail("staff_expense", "prepayments", expenseId);
  const refresh = () => {
    q.refetch();
    trail.refresh();
  };
  const back = mine ? { label: "Back to my expenses", to: "/dashboard/my/expenses" } : { label: "Back to staff expenses", to: "/dashboard/finance/staff-expenses" };
  if (q.isLoading) return <Page><ListSkeleton rows={6} /></Page>;
  if (!q.data) return <Page><EmptyState icon={Receipt} text="This request does not exist, or it is not yours to see." /></Page>;
  const r: any = q.data;
  const x = r.expand || {};
  const own = r.employee === user?.id;
  const advance = r.kind === "advance";
  const status = EXPENSE_STATUS[r.status];
  const finance = can("approve_or_reject_expense") && can("view_expenses");
  const canCancel = (["pending_approval", "returned"].includes(r.status) && (own || finance)) || (r.status === "approved" && finance);
  const note = r.status === "pending_approval" ? (r.pending_approvers || "").split(",").includes(user?.id) ? "Waiting for you" : "Waiting for approval" : status?.note;

  return (
    <Page>
      <DetailHeader
        back={back}
        number={r.number}
        type={EXPENSE_KIND[r.kind] || "Request"}
        status={r.status}
        statusMap={EXPENSE_WORD}
        statusNote={note}
        title={r.description}
        facts={[
          { label: "Staff", value: x.employee?.name },
          x.department && { label: "Department", value: x.department.name },
          { label: "Amount", value: <span className="tabular-nums">{fmtMoney(r.amount)}</span> },
          { label: advance ? "Asked" : "Spent", value: fmtDate(r.date) },
        ]}
        actions={
          <>
            {own && r.status === "returned" && <Button icon={Pencil} onClick={() => setEditing(true)}>Correct and send again</Button>}
            {canCancel && <Button icon={XCircle} className="text-ims-danger" onClick={() => setCancelling(true)}>{own && r.status !== "approved" ? "Withdraw" : "Cancel request"}</Button>}
            <DecisionButtons approval={x.approval} number={r.number} onDone={refresh} />
            {r.status === "approved" && can("record_payments") && !own && <Button variant="primary" icon={Banknote} onClick={() => setPaying(true)}>Pay</Button>}
          </>
        }
      />
      {r.status === "returned" && own && (
        <p className="rounded-card border border-ims-warning/40 bg-ims-warning-bg px-5 py-3 text-t-body text-ims-warning">
          Returned to you for a change — see the comment under Approvals, then use <strong>Correct and send again</strong>.
        </p>
      )}
      <Card padded={false} className="overflow-hidden">
        <Tabs inset active={tab} onChange={setTab} tabs={[{ key: "details", label: "Details" }, { key: "approvals", label: "Approvals" }, { key: "documents", label: "Documents", count: (r.attachments || []).length }, { key: "activity", label: "Activity" }]} />
        {tab === "details" && (
          <div className="space-y-6 px-5 py-5">
            <Details
              columns={3}
              items={[
                { label: "Category", value: x.expenseCategory?.name },
                { label: "Amount", value: fmtMoney(r.amount) },
                { label: advance ? "Date of the request" : "Date of the expense", value: fmtDate(r.date) },
                { label: "To be paid by", value: PAY_BY[r.pay_by], hint: r.pay_by === "mobile_money" && r.momoNumber ? `${r.momoNumber}${r.momoName ? ` · ${r.momoName}` : ""}` : undefined },
                advance
                  ? { label: "Recovered", value: x.recovered_in ? `${x.recovered_in.period_label || x.recovered_in.number} payroll` : r.status === "paid" ? "From the next payslip" : "", hint: r.recovered_at ? fmtDate(r.recovered_at) : undefined }
                  : { label: "Budget line", value: x.budget_line ? `${x.budget_line.code}` : "", hint: x.budget_line?.name },
                { label: "Charged to", value: x.gl_account ? `${x.gl_account.code} ${x.gl_account.name}` : "", hint: x.funding_source ? `Funding: ${x.funding_source.code}` : undefined },
                { label: "Sent", value: fmtDateTime(r.submitted_at || r.created) },
                ...(r.cancel_reason ? [{ label: "Cancelled because", value: r.cancel_reason }] : []),
              ]}
            />
            <div>
              <h3 className="mb-3 text-t-label font-semibold text-ims-text">Payment</h3>
              {r.paid_at ? (
                <Details
                  columns={3}
                  items={[
                    { label: "Paid", value: fmtDate(r.paid_at), hint: x.paid_by ? `by ${x.paid_by.name}` : undefined },
                    { label: "From", value: x.paid_from ? `${x.paid_from.code} · ${x.paid_from.name}` : "" },
                    { label: "Method", value: PAY_BY[r.payment_method], hint: r.payment_reference || undefined },
                    // the ledger is for the finance team (staff cannot open it)
                    ...(can(["view_journals", "approve_journals", "export_ledger"]) ? [{ label: "Journal", value: x.journal ? <Link className="font-mono text-ims-link hover:underline" to={`/dashboard/finance/journals/${r.journal}`}>{x.journal.number}</Link> : "" }] : []),
                  ]}
                />
              ) : (
                <p className="text-t-body text-ims-muted">{r.status === "approved" ? "Approved — waiting for the Cashier." : ["rejected", "cancelled"].includes(r.status) ? "Not paid." : "Paid once approved by the head of department and the Director of Finance."}</p>
              )}
            </div>
          </div>
        )}
        {tab === "approvals" && <div className="px-5 py-5"><ApprovalTracker approval={x.approval} actions={trail.actions} /></div>}
        {tab === "documents" && (
          <div className="px-5 py-5">
            <DocumentUploads collection="prepayments" record={r} canAdd={own || can("record_payments")} canRemove={own && ["pending_approval", "returned"].includes(r.status)} onChange={refresh} hint={advance ? "Any document that supports the request" : "Receipts, tickets or the trip details"} />
          </div>
        )}
        {tab === "activity" && <div className="p-3"><Chatter items={toChatter(trail.actions, trail.audit)} /></div>}
      </Card>
      {paying && <PayExpenseDialog request={r} onClose={() => setPaying(false)} onPaid={() => { setPaying(false); refresh(); }} />}
      <ExpenseRequestDialog open={editing} request={r} onClose={() => setEditing(false)} onSaved={refresh} />
      <ConfirmDialog
        open={cancelling}
        onClose={() => setCancelling(false)}
        title={own && r.status !== "approved" ? `Withdraw ${r.number}?` : `Cancel ${r.number}?`}
        description={r.status === "approved" ? "It will not be paid, and its amount goes back to the budget line." : "It leaves the approvers' lists and will not be paid."}
        confirmLabel={own && r.status !== "approved" ? "Withdraw" : "Cancel request"}
        danger
        reason={{ label: "Why", min: 5, required: true }}
        onConfirm={async (reason) => {
          try {
            await expensesApi.cancel(r.id, reason);
            notify.success(`${r.number} cancelled.`);
            refresh();
          } catch (e) {
            notify.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </Page>
  );
}
