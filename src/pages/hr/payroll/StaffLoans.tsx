/**
 * HR & payroll → Staff loans: loans to staff repaid by monthly instalments deducted in the payroll.
 * HR records a loan, Finance approves it (never the person who recorded it, never the borrower), and the
 * balance goes down each time a payroll that deducted an instalment is paid.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Coins, Plus, X, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth, usePermissions } from "@/context/auth.context";
import { LOAN_STATUS, LOAN_TYPES, MONTHS, loansApi } from "@/lib/hr";
import { errorMessage } from "@/lib/procurement";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import {
  Button,
  ConfirmDialog,
  DataTable,
  Details,
  DocNo,
  Field,
  KpiBand,
  Modal,
  MoneyInput,
  Num,
  Page,
  PageHeader,
  Person,
  Select,
  Textarea,
  fmtDate,
  fmtMoney,
  fmtMoneyShort,
  fmtNumber,
  statusText,
} from "@/components/ims";
import { cn } from "@/utils";

const monthLabel = (y: number, m: number) => `${MONTHS[(m - 1 + 12) % 12]} ${y}`;
/** "Nov 2027": the month of the last instalment, short, for the table. */
const shortMonth = (label: string) => label.replace(/^(w{3})w*/, "$1");
/** Month the last instalment falls in. */
const endOf = (l: { start_year: number; start_month: number; installments: number }) => {
  const k = l.start_year * 12 + (l.start_month - 1) + Math.max(1, l.installments) - 1;
  return monthLabel(Math.floor(k / 12), (k % 12) + 1);
};

function RepaidBar({ pct, className }: { pct: number; className?: string }) {
  return (
    <span className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-ims-subtle", className)} title={`${pct}% repaid`}>
      <span className="block h-full rounded-full bg-ims-success" style={{ width: `${pct}%` }} />
    </span>
  );
}

export default function StaffLoans() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [creating, setCreating] = React.useState(false);
  const [openId, setOpenId] = React.useState("");
  const [refresh, setRefresh] = React.useState(0);
  const approver = can("approve_payroll");
  const view = params.get("view") || (approver && !can("create_payroll") ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All loans" },
    { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
    { key: "active", label: "Being repaid", filter: 'status = "active"' },
    { key: "closed", label: "Closed", filter: 'status = "repaid" || status = "rejected" || status = "cancelled"' },
  ];
  const stats = useQuery(["staff-loan-stats", refresh], () => pocketbase.collection("staff_loans").getFullList({ fields: "status,balance,installment,principal,repaid" }));
  const all = (stats.data || []) as any[];
  const active = all.filter((l) => l.status === "active");
  const done = () => {
    setRefresh((n) => n + 1);
  };
  const canRecord = can("create_payroll");
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Payroll", to: "/dashboard/hr/payroll" }, { label: "Staff loans" }]}
        title="Staff loans"
        subtitle="Loans to staff, repaid by monthly instalments deducted in the payroll once Finance approves them."
        primary={canRecord ? { label: "Record a loan", icon: Plus, onClick: () => setCreating(true) } : undefined}
      />
      <KpiBand
        loading={stats.isLoading}
        items={[
          { label: "Being repaid", value: fmtNumber(active.length), sub: `${all.filter((l) => l.status === "repaid").length} repaid in full` },
          { label: "Outstanding", value: fmtMoneyShort(active.reduce((a, l) => a + l.balance, 0)), sub: "Balance still to recover" },
          { label: "Lent on running loans", value: fmtMoneyShort(active.reduce((a, l) => a + l.principal, 0)) },
          { label: "Recovered each month", value: fmtMoneyShort(active.reduce((a, l) => a + Math.min(l.installment, l.balance), 0)), sub: "Through the payroll", tone: "success" },
        ]}
      />
      <RecordTable<any>
        collection="staff_loans"
        expand="employee,employee.department,recorded_by"
        views={views}
        activeView={view}
        viewCounts={{ pending: stats.data ? all.filter((l) => l.status === "pending_approval").length : undefined }}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "purpose", "employee.name"]}
        searchPlaceholder="Search loan number, purpose or employee"
        filters={[{ field: "loan_type", label: "Type", options: Object.entries(LOAN_TYPES).map(([value, label]) => ({ value, label })) }]}
        defaultSort="-created"
        refreshKey={refresh}
        exportName="staff-loans"
        exportTitle="Staff loans"
        exportPermission={["export_payroll", "approve_payroll"]}
        onRowClick={(r) => setOpenId(r.id)}
        empty={{
          icon: Coins,
          title: "No staff loans.",
          text: "No staff loans yet. HR records a loan with its monthly instalment; Finance approves it and the payroll deducts it.",
          action: canRecord ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>Record a loan</Button> : undefined,
        }}
        columns={[
          { key: "number", header: "Loan", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => LOAN_TYPES[r.loan_type] || r.loan_type },
          {
            key: "employee", header: "Employee", className: "max-w-[200px]", csv: (r) => r.expand?.employee?.name || "",
            cell: (r) => <Person name={r.expand?.employee?.name} detail={r.expand?.employee?.expand?.department?.name || "—"} />,
          },
          {
            key: "purpose", header: "Purpose", clamp: true, className: "min-w-[150px] max-w-[200px]", csv: (r) => `${LOAN_TYPES[r.loan_type] || r.loan_type}: ${r.purpose}`,
            cell: (r) => r.purpose,
          },
          { key: "principal", header: "Amount (RWF)", sortField: "principal", align: "right", sum: "principal", format: "money", csv: (r) => r.principal, cell: (r) => <span className="font-semibold"><Num value={r.principal} /></span> },
          {
            key: "installment", header: "Instalment (RWF)", sortField: "installment", align: "right", csv: (r) => `${r.installment} x ${r.installments} from ${monthLabel(r.start_year, r.start_month)}`,
            cell: (r) => <Num value={r.installment} />,
            sub: (r) => <span title={`${monthLabel(r.start_year, r.start_month)} – ${endOf(r)}`}>{r.installments} months, to {shortMonth(endOf(r))}</span>,
          },
          {
            key: "balance", header: "Balance (RWF)", sortField: "balance", align: "right", sum: "balance", format: "money", csv: (r) => r.balance,
            cell: (r) => {
              const pct = r.principal ? Math.round((r.repaid / r.principal) * 100) : 0;
              return (
                <span className="block min-w-[110px]">
                  <span className="block font-semibold"><Num value={r.balance} /></span>
                  <RepaidBar pct={pct} className="mt-1" />
                </span>
              );
            },
          },
          { key: "by", header: "Recorded by", exportOnly: true, csv: (r) => r.expand?.recorded_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(LOAN_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={LOAN_STATUS} /> },
        ]}
      />
      {creating && <NewLoanDialog onClose={() => setCreating(false)} onSaved={(id) => { setCreating(false); done(); setOpenId(id); }} />}
      {openId && <LoanDialog id={openId} onClose={() => setOpenId("")} onChanged={done} />}
    </Page>
  );
}

function NewLoanDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const { user }: any = useAuth();
  const now = new Date();
  const months = Array.from({ length: 13 }, (_, i) => {
    const k = now.getFullYear() * 12 + now.getMonth() + i;
    return { y: Math.floor(k / 12), m: (k % 12) + 1 };
  });
  const [v, setV] = React.useState({ employee: "", loan_type: "staff_loan", purpose: "", principal: "" as number | "", installment: "" as number | "", start: `${months[1].y}-${months[1].m}` });
  const [busy, setBusy] = React.useState(false);
  const people = useQuery(["loan-people"], () => pocketbase.collection("users").getFullList({ filter: 'status = "Active"', sort: "name", fields: "id,name,department,expand.department.name", expand: "department" }), { staleTime: 300_000 });
  const context = useQuery(["loan-context", v.employee], async () => {
    const [slip, loans] = await Promise.all([
      pocketbase.collection("employees_payrolls").getList(1, 1, { filter: `employee = "${v.employee}"`, sort: "-created", fields: "net,loans,period_label" }).then((r) => r.items[0] as any).catch(() => null),
      pocketbase.collection("staff_loans").getFullList({ filter: `employee = "${v.employee}" && (status = "active" || status = "pending_approval")`, fields: "number,installment,balance,principal" }).catch(() => [] as any[]),
    ]);
    return { slip, running: (loans as any[]).reduce((a, l) => a + Math.min(l.installment, l.balance || l.principal), 0), loans: loans as any[] };
  }, { enabled: Boolean(v.employee) });
  const principal = Number(v.principal) || 0;
  const installment = Number(v.installment) || 0;
  const n = installment > 0 ? Math.ceil(principal / installment) : 0;
  const [sy, sm] = v.start.split("-").map(Number);
  const netBefore = context.data?.slip ? Math.round(context.data.slip.net + (context.data.slip.loans || 0)) : 0;
  const cap = netBefore ? Math.floor(netBefore / 2) - (context.data?.running || 0) : 0;
  const problems = [
    principal && principal < 1000 ? "Enter the amount of the loan, at least RWF 1,000." : "",
    installment && (installment < 1000 || installment > principal) ? "The instalment must be between RWF 1,000 and the amount of the loan." : "",
    n > 60 ? `At this instalment the loan takes ${n} months; the limit is 60. Raise the instalment.` : "",
    netBefore && installment > cap ? `All instalments together would be more than half of the last net pay (${fmtMoney(netBefore)}). Lower the instalment to at most ${fmtMoney(Math.max(0, cap))} a month.` : "",
  ].filter(Boolean);
  const ready = v.employee && principal >= 1000 && installment >= 1000 && v.purpose.trim().length >= 5 && !problems.length;
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x) => ({ ...x, [k]: e.target.value }));
  async function save() {
    setBusy(true);
    try {
      const r = await loansApi.create({ employee: v.employee, loan_type: v.loan_type, purpose: v.purpose.trim(), principal, installment, start_year: sy, start_month: sm });
      toast.success(`${r.number} recorded and sent to Finance for approval`);
      onSaved(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal
      open
      onClose={onClose}
      title="Record a staff loan"
      description="The instalment is deducted from the employee's payslip every month until the loan is repaid. Finance approves the loan before the first deduction."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={busy} disabled={!ready} onClick={save}>Record and send to Finance</Button>
        </>
      }
    >
      <Field
        label="Employee"
        required
        htmlFor="loan-employee"
        hint={context.data?.slip ? `Last net pay ${fmtMoney(netBefore)} (${context.data.slip.period_label})${context.data.running ? ` · already repaying ${fmtMoney(context.data.running)} a month` : ""}` : v.employee ? "No payslip yet for this employee" : undefined}
      >
        <Select id="loan-employee" value={v.employee} onChange={set("employee")}>
          <option value="">Choose the employee</option>
          {((people.data || []) as any[]).filter((p) => p.id !== user?.id).map((p) => <option key={p.id} value={p.id}>{p.name}{p.expand?.department?.name ? ` · ${p.expand.department.name}` : ""}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Type of loan" htmlFor="loan-type">
          <Select id="loan-type" value={v.loan_type} onChange={set("loan_type")}>{Object.entries(LOAN_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
        </Field>
        <Field label="First deduction" htmlFor="loan-start" hint="Payroll month of the first instalment">
          <Select id="loan-start" value={v.start} onChange={set("start")}>{months.map((x) => <option key={`${x.y}-${x.m}`} value={`${x.y}-${x.m}`}>{monthLabel(x.y, x.m)}</option>)}</Select>
        </Field>
      </div>
      <Field label="Purpose" required htmlFor="loan-purpose" hint="What the loan is for, as approved under the staff loan policy (at least 5 characters)">
        <Textarea id="loan-purpose" className="min-h-[72px]" value={v.purpose} maxLength={500} onChange={set("purpose")} />
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Amount lent" required htmlFor="loan-principal">
          <MoneyInput id="loan-principal" value={v.principal} onChange={(x) => setV((y) => ({ ...y, principal: x }))} />
        </Field>
        <Field label="Monthly instalment" required htmlFor="loan-installment" hint={cap > 0 ? `At most ${fmtMoney(cap)} for this employee` : undefined}>
          <MoneyInput id="loan-installment" value={v.installment} onChange={(x) => setV((y) => ({ ...y, installment: x }))} />
        </Field>
      </div>
      {n > 0 && principal >= 1000 && (
        <p className="rounded-control bg-ims-thead px-3 py-2 text-t-body text-ims-body">
          Repaid in <span className="font-semibold text-ims-text">{n} month{n === 1 ? "" : "s"}</span>: {monthLabel(sy, sm)} – {endOf({ start_year: sy, start_month: sm, installments: n })}
          {principal % installment ? <>, the last instalment {fmtMoney(principal - installment * (n - 1))}</> : null}.
        </p>
      )}
      {problems.map((p) => <p key={p} className="text-t-small text-ims-danger" role="alert">{p}</p>)}
    </Modal>
  );
}

function LoanDialog({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const { user }: any = useAuth();
  const { can } = usePermissions();
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [cancelling, setCancelling] = React.useState(false);
  const q = useQuery(["staff-loan", id], () => pocketbase.collection("staff_loans").getOne(id, { expand: "employee,employee.department,recorded_by,decided_by" }));
  const l: any = q.data;
  const decide = async (decision: "approve" | "reject") => {
    setBusy(true);
    try {
      await loansApi.act(id, "decide", { decision, comment: comment.trim() });
      toast.success(decision === "approve" ? `${l.number} approved. The payroll deducts it from ${monthLabel(l.start_year, l.start_month)}` : `${l.number} rejected`);
      q.refetch();
      onChanged();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const canDecide = l && l.status === "pending_approval" && can("approve_payroll") && l.recorded_by !== user?.id && l.employee !== user?.id;
  const canCancel = l && can("create_payroll") && (l.status === "pending_approval" || (l.status === "active" && !l.repaid));
  const pct = l?.principal ? Math.round((l.repaid / l.principal) * 100) : 0;

  if (!l) {
    return (
      <Modal open onClose={onClose} title="Staff loan" description={q.isError ? errorMessage(q.error) : "Loading…"} footer={<Button onClick={onClose}>Close</Button>} />
    );
  }
  return (
    <Modal
      open
      onClose={onClose}
      title={<span className="whitespace-nowrap">{l.number}</span>}
      description={`${l.expand?.employee?.name} · ${l.expand?.employee?.expand?.department?.name || "—"} · ${LOAN_TYPES[l.loan_type] || l.loan_type}`}
      footer={
        <>
          {canCancel && <Button variant="ghost" icon={XCircle} className="text-ims-danger hover:text-ims-danger sm:mr-auto" onClick={() => setCancelling(true)}>Cancel loan</Button>}
          <Button onClick={onClose}>Close</Button>
          {canDecide && (
            <>
              <Button icon={X} disabled={busy || comment.trim().length < 5} onClick={() => decide("reject")}>Reject</Button>
              <Button variant="primary" icon={Check} loading={busy} onClick={() => decide("approve")}>Approve</Button>
            </>
          )}
        </>
      }
    >
      <div className="flex flex-wrap items-start gap-3">
        <StatusBadge status={l.status} map={LOAN_STATUS} />
      </div>
      <p className="rounded-control border border-ims-divider bg-ims-thead px-3 py-2 text-t-body text-ims-body">{l.purpose}</p>
      <Details
        items={[
          { label: "Amount lent", value: <span className="font-semibold">{fmtMoney(l.principal)}</span> },
          { label: "Monthly instalment", value: <span className="font-semibold">{fmtMoney(l.installment)}</span> },
          { label: "Repayment", value: `${monthLabel(l.start_year, l.start_month)} – ${endOf(l)}` },
          { label: "Balance", value: <span className="font-semibold">{fmtMoney(l.balance)}</span> },
        ]}
      />
      <div>
        <div className="mb-1 flex justify-between text-t-small text-ims-muted"><span>Repaid {fmtMoney(l.repaid)}</span><span>{pct}%</span></div>
        <RepaidBar pct={pct} className="h-2" />
      </div>
      <div>
        <h3 className="mb-2 text-t-body font-bold text-ims-text">Repayments through the payroll</h3>
        {(l.repayments || []).length ? (
          <div className="overflow-hidden rounded-card border border-ims-border">
            <DataTable
              minWidth={0}
              rows={l.repayments as any[]}
              rowKey={(x: any) => x.payroll}
              caption="Repayments through the payroll"
              columns={[
                { key: "payroll", header: "Payroll", cell: (x: any) => x.period, sub: (x: any) => <DocNo value={x.number} /> },
                { key: "date", header: "Paid on", nowrap: true, cell: (x: any) => fmtDate(x.date) },
                { key: "amount", header: "Amount (RWF)", numeric: true, cell: (x: any) => <Num value={x.amount} />, total: <Num value={(l.repayments as any[]).reduce((a, x) => a + (Number(x.amount) || 0), 0)} /> },
              ]}
            />
          </div>
        ) : (
          <p className="text-t-body text-ims-muted">{l.status === "active" ? `The first instalment is deducted in the ${monthLabel(l.start_year, l.start_month)} payroll and recorded when that payroll is paid.` : "No repayments yet."}</p>
        )}
      </div>
      <div className="grid gap-1 text-t-small text-ims-body">
        <p>Recorded by <span className="font-semibold text-ims-text">{l.expand?.recorded_by?.name || "—"}</span> on {fmtDate(l.created)}</p>
        {l.decided_at && <p>{l.status === "rejected" ? "Rejected" : "Approved"} by <span className="font-semibold text-ims-text">{l.expand?.decided_by?.name || "—"}</span> on {fmtDate(l.decided_at)}{l.decision_comment ? `: “${l.decision_comment}”` : ""}</p>}
        {l.status === "cancelled" && <p>Cancelled{l.decision_comment ? `: “${l.decision_comment}”` : ""}</p>}
      </div>
      {canDecide && (
        <Field label="Comment" htmlFor="loan-comment" hint="Required to reject (at least 5 characters), optional to approve.">
          <Textarea id="loan-comment" className="min-h-[72px]" placeholder="A note for HR and the borrower" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      )}
      {l.status === "pending_approval" && !canDecide && can("approve_payroll") && <p className="text-t-small text-ims-muted">Separation of duties: the person who recorded the loan, and the borrower, cannot approve it.</p>}
      <ConfirmDialog
        open={cancelling}
        title={`Cancel ${l.number}?`}
        description="Nothing has been deducted yet; the loan is kept as cancelled."
        confirmLabel="Cancel loan"
        danger
        reason={{ min: 5, required: true, placeholder: "Why the loan is cancelled" }}
        onClose={() => setCancelling(false)}
        onConfirm={async (reason) => {
          try {
            await loansApi.act(id, "cancel", { reason });
            toast.success(`${l.number} cancelled`);
            setCancelling(false);
            q.refetch();
            onChanged();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </Modal>
  );
}
