import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Banknote, Plus, Settings2, Users, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RecordTable, { RecordColumn } from "@/components/enterprise/RecordTable";
import { MetricGroup, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { compactMoney, errorMessage } from "@/lib/procurement";
import { MONTHS, PAYROLL_STATUS, payrollApi, rwf } from "@/lib/hr";
import { Field, inputCls } from "@/components/portal/kit";

export default function PayrollRuns() {
  const navigate = useNavigate();
  const { canPerform } = useRoles();
  const [creating, setCreating] = React.useState(false);
  const year = new Date().getFullYear();
  const all = useQuery(["payroll-summary", year], () => pocketbase.collection("payrolls").getFullList({ filter: `year = ${year} && status != "cancelled"`, sort: "-month" }));
  const rows = (all.data || []) as any[];
  const paid = rows.filter((p) => p.status === "paid");
  const sum = (xs: any[], k: string) => xs.reduce((a, p) => a + (Number(p.totals?.[k]) || 0), 0);
  const inApproval = rows.filter((p) => p.status === "pending_approval");

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Payroll", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number || "—"}</span> },
    { key: "period", header: "Period", sortField: "year", cell: (r) => <span className="whitespace-nowrap">{r.period_label || `${MONTHS[(r.month || 1) - 1]} ${r.year}`}</span>, csv: (r) => r.period_label },
    { key: "branch", header: "Office", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.branch?.name || "All offices"}</span>, csv: (r) => r.expand?.branch?.name || "All" },
    { key: "staff", header: "Staff", align: "right", cell: (r) => <span className="tabular-nums">{r.headcount || "—"}</span>, csv: (r) => r.headcount },
    { key: "gross", header: "Gross", sortField: "total_gross", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums">{rwf(r.total_gross)}</span>, csv: (r) => r.total_gross },
    { key: "paye", header: "PAYE (RRA)", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums text-slate-600">{rwf(r.totals?.paye)}</span>, csv: (r) => r.totals?.paye },
    { key: "rssb", header: "RSSB", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums text-slate-600">{rwf(r.totals?.rssb)}</span>, csv: (r) => r.totals?.rssb },
    { key: "net", header: "Net pay", sortField: "total_net", align: "right", cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{rwf(r.total_net)}</span>, csv: (r) => r.total_net },
    { key: "cost", header: "Employer cost", sortField: "total_employer_cost", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums">{rwf(r.total_employer_cost)}</span>, csv: (r) => r.total_employer_cost },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status || "draft"} map={PAYROLL_STATUS} />, csv: (r) => PAYROLL_STATUS[r.status]?.label },
  ];

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Payroll"
        description="Monthly payroll calculated with Rwanda PAYE and RSSB contributions, approved in several steps — the preparer never approves."
        breadcrumbs={[{ title: "HR", link: "/dashboard/hr/employees" }, { title: "Payroll", link: "/dashboard/hr/payroll" }]}
        actions={
          <>
            {canPerform("manage_salaries") && <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/hr/payroll/salaries")}><Users size={14} /> Salary structures</Button>}
            {canPerform("manage_payroll_settings") && <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/settings/general-settings/payroll")}><Settings2 size={14} /> Tax settings</Button>}
            {canPerform("create_payroll") && <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> New payroll</Button>}
          </>
        }
      />
      <MetricGroup
        title={`Year ${year}`}
        icon={Wallet}
        columns={4}
        loading={all.isLoading}
        metrics={[
          { label: "Net salaries paid", value: compactMoney(sum(paid, "net")), sub: `${paid.length} payroll${paid.length === 1 ? "" : "s"} paid` },
          { label: "PAYE to RRA", value: compactMoney(sum(paid, "paye")), sub: "Declared and due by the 15th of the following month" },
          { label: "Contributions to RSSB", value: compactMoney(sum(paid, "rssb")), sub: "Pension, maternity, occupational hazards, CBHI" },
          { label: "In approval", value: inApproval.length, sub: inApproval.map((p) => p.period_label).join(", ") || "Nothing waiting", tone: inApproval.length ? "warning" : "default" },
        ]}
      />
      <RecordTable
        collection="payrolls"
        columns={columns}
        expand="branch"
        defaultSort="-year,-month"
        searchFields={["number", "period_label"]}
        exportName="payrolls"
        onRowClick={(r) => navigate(`/dashboard/hr/payroll/${r.id}`)}
        empty={{ icon: Banknote, title: "No payroll yet", text: "Create the first payroll for a month; it is calculated from the salary structures and the tax settings." }}
      />
      {creating && <NewPayrollDialog onClose={() => setCreating(false)} />}
    </div>
  );
}

function NewPayrollDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const now = new Date();
  const [v, setV] = React.useState({ year: now.getFullYear(), month: now.getMonth() + 1, branch: "", notes: "" });
  const branches = useQuery(["branches-simple"], () => pocketbase.collection("branches").getFullList({ sort: "name", fields: "id,name" }));
  const create = useMutation(
    async () => {
      const p = await payrollApi.create(v);
      await payrollApi.action(p.id, "compute");
      return p;
    },
    {
      onSuccess: (p) => {
        toast.success(`${p.number} created and calculated`);
        navigate(`/dashboard/hr/payroll/${p.id}`);
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>New payroll</DialogTitle>
          <DialogDescription>Every active employee with a salary is included. The payroll is calculated immediately; you can review it before sending it for approval.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Month" required>
            <select className={inputCls} value={v.month} onChange={(e) => setV((x) => ({ ...x, month: Number(e.target.value) }))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Year" required>
            <select className={inputCls} value={v.year} onChange={(e) => setV((x) => ({ ...x, year: Number(e.target.value) }))}>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </Field>
          <Field label="Office" hint="Leave on “All offices” for one payroll for the whole organisation." className="col-span-2">
            <select className={inputCls} value={v.branch} onChange={(e) => setV((x) => ({ ...x, branch: e.target.value }))}>
              <option value="">All offices</option>
              {(branches.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Notes" className="col-span-2">
            <input className={inputCls} value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} placeholder="Optional" />
          </Field>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={create.isLoading} onClick={() => create.mutate()}>{create.isLoading ? "Calculating…" : "Create and calculate"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
