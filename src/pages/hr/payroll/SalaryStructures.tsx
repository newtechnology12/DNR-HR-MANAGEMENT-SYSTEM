import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, MetricGroup, PageHeader } from "@/components/enterprise/ui";
import { compactMoney, errorMessage } from "@/lib/procurement";
import { EMPLOYMENT_TYPES, payrollApi, rwf } from "@/lib/hr";
import { Field, inputCls } from "@/components/portal/kit";
import { cn } from "@/utils";
import TableTools from "@/components/enterprise/TableTools";
import { IMPORTS } from "@/lib/importConfigs";

export default function SalaryStructures() {
  const { canPerform } = useRoles();
  const canEdit = canPerform("manage_salaries");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<{ user: any; structure: any } | null>(null);
  const q = useQuery(["salary-structures"], async () => {
    const [users, structures] = await Promise.all([
      pocketbase.collection("users").getFullList({ filter: 'status = "Active"', sort: "name", expand: "department,designation", fields: "id,name,email,salary,employment_type,bank_name,bank_account_number,expand" }),
      pocketbase.collection("salary_structures").getFullList(),
    ]);
    const byEmp = new Map(structures.map((s: any) => [s.employee, s]));
    return users.map((u: any) => ({ user: u, structure: byEmp.get(u.id) || null }));
  });
  const rows = (q.data || []).filter((r) => `${r.user.name} ${r.user.expand?.department?.name || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const gross = (s: any) => (s ? s.basic_salary + s.transport_allowance + s.housing_allowance + s.communication_allowance + (s.other_allowances || []).reduce((a: number, x: any) => a + (Number(x.amount) || 0), 0) : 0);
  const withS = (q.data || []).filter((r) => r.structure?.active);
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Salary structures"
        description="Basic salary, allowances and recurring deductions of each employee — the input of every payroll."
        breadcrumbs={[{ title: "Payroll", link: "/dashboard/hr/payroll" }, { title: "Salary structures", link: "/dashboard/hr/payroll/salaries" }]}
        actions={
          <TableTools
            importConfig={IMPORTS.salaryStructures}
            exportConfig={{
              title: "Salary structures", fileName: "salary-structures", what: "salary_structures", orientation: "landscape", permission: ["manage_salaries", "export_payroll"],
              rows: async () => (q.data || []).filter((r) => r.structure),
              totals: ["Basic salary", "Transport", "Housing", "Communication", "Gross"],
              columns: [
                { header: "Employee", value: (r: any) => r.user.name, width: 26 },
                { header: "Department", value: (r: any) => r.user.expand?.department?.name || "", width: 24 },
                { header: "Type", value: (r: any) => r.structure.employment_type || "" },
                { header: "Basic salary", value: (r: any) => r.structure.basic_salary || 0, format: "money" },
                { header: "Transport", value: (r: any) => r.structure.transport_allowance || 0, format: "money" },
                { header: "Housing", value: (r: any) => r.structure.housing_allowance || 0, format: "money" },
                { header: "Communication", value: (r: any) => r.structure.communication_allowance || 0, format: "money" },
                { header: "Gross", value: (r: any) => gross(r.structure), format: "money" },
                { header: "Paid by", value: (r: any) => r.structure.payment_method || "" },
              ],
            }}
          />
        }
      />
      <MetricGroup
        title="Monthly salary bill"
        icon={Users}
        columns={3}
        loading={q.isLoading}
        metrics={[
          { label: "Employees with a salary", value: `${withS.length} / ${(q.data || []).length}`, tone: withS.length < (q.data || []).length ? "warning" : "success" },
          { label: "Total gross per month", value: compactMoney(withS.reduce((a, r) => a + gross(r.structure), 0)) },
          { label: "Missing bank details", value: withS.filter((r) => !r.structure.bank_account).length },
        ]}
      />
      <input type="search" className={cn(inputCls, "sm:w-72")} placeholder="Search employee or department" value={search} onChange={(e) => setSearch(e.target.value)} />
      {q.isLoading ? <Skeleton className="h-96 w-full" /> : (
        <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-card">
          <table className="dnr-grid w-full min-w-[1100px] text-[13px]">
            <thead><tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Employee</th><th className="px-3 py-2">Type</th><th className="px-3 py-2 text-right">Basic</th><th className="px-3 py-2 text-right">Transport</th><th className="px-3 py-2 text-right">Housing</th><th className="px-3 py-2 text-right">Communication</th><th className="px-3 py-2 text-right">Other</th><th className="px-3 py-2 text-right">Gross</th><th className="px-3 py-2">Bank</th><th className="px-3 py-2">RSSB no.</th>{canEdit && <th className="w-10" />}
            </tr></thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(({ user: u, structure: s }) => (
                <tr key={u.id} className="hover:bg-slate-50">
                  <td className="px-3 py-2"><p className="font-medium">{u.name}</p><p className="text-[12px] text-slate-500">{u.expand?.department?.name}{u.expand?.designation?.name ? ` · ${u.expand.designation.name}` : ""}</p></td>
                  {s ? (
                    <>
                      <td className="px-3 py-2 capitalize">{s.employment_type}{!s.active && <Badge tone="neutral" className="ml-1">Inactive</Badge>}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rwf(s.basic_salary)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rwf(s.transport_allowance)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rwf(s.housing_allowance)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rwf(s.communication_allowance)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{rwf((s.other_allowances || []).reduce((a: number, x: any) => a + (Number(x.amount) || 0), 0))}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{rwf(gross(s))}</td>
                      <td className="px-3 py-2 text-[12px]">{s.bank_name || <span className="text-red-600">missing</span>}<span className="block text-slate-500">{s.bank_account}</span></td>
                      <td className="px-3 py-2 text-[12px] tabular-nums">{s.rssb_number || <span className="text-amber-700">—</span>}</td>
                    </>
                  ) : (
                    <td colSpan={9} className="px-3 py-2 text-[12.5px] text-amber-700">No salary structure{u.salary ? ` — profile salary RWF ${rwf(Number(u.salary))} is used as basic salary` : " — not included in payroll"}.</td>
                  )}
                  {canEdit && <td className="px-2 py-2"><button type="button" onClick={() => setEditing({ user: u, structure: s })} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label={`Edit ${u.name}`}>{s ? <Pencil size={14} /> : <Plus size={14} />}</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <StructureDialog user={editing.user} structure={editing.structure} onClose={() => setEditing(null)} />}
    </div>
  );
}

function StructureDialog({ user, structure, onClose }: { user: any; structure: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const init = structure || { employment_type: user.employment_type || "permanent", basic_salary: Number(user.salary) || 0, transport_allowance: 0, housing_allowance: 0, communication_allowance: 0, other_allowances: [], recurring_deductions: [], payment_method: "bank", bank_name: user.bank_name || "", bank_account: user.bank_account_number || "", active: true };
  const [v, setV] = React.useState<any>({ ...init, other_allowances: init.other_allowances || [], recurring_deductions: init.recurring_deductions || [] });
  const preview = useQuery(["salary-preview", JSON.stringify(v)], () => payrollApi.preview(v), { keepPreviousData: true, enabled: Number(v.basic_salary) > 0 });
  const save = useMutation(
    () => {
      const data = { ...v, employee: user.id, basic_salary: Number(v.basic_salary) || 0, transport_allowance: Number(v.transport_allowance) || 0, housing_allowance: Number(v.housing_allowance) || 0, communication_allowance: Number(v.communication_allowance) || 0 };
      return structure ? pocketbase.collection("salary_structures").update(structure.id, data) : pocketbase.collection("salary_structures").create(data);
    },
    {
      onSuccess: () => {
        toast.success("Salary structure saved");
        queryClient.invalidateQueries(["salary-structures"]);
        onClose();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const list = (key: "other_allowances" | "recurring_deductions") => (
    <div className="space-y-2">
      {v[key].map((a: any, i: number) => (
        <div key={i} className="grid grid-cols-[1fr_130px_auto] items-center gap-2">
          <input className={inputCls} value={a.name} placeholder="Name" onChange={(e) => setV((x: any) => ({ ...x, [key]: x[key].map((y: any, j: number) => (j === i ? { ...y, name: e.target.value } : y)) }))} />
          <input type="number" min={0} className={cn(inputCls, "text-right")} value={a.amount} onChange={(e) => setV((x: any) => ({ ...x, [key]: x[key].map((y: any, j: number) => (j === i ? { ...y, amount: Number(e.target.value) } : y)) }))} />
          <button type="button" onClick={() => setV((x: any) => ({ ...x, [key]: x[key].filter((_: any, j: number) => j !== i) }))} className="rounded p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 size={15} /></button>
          {key === "other_allowances" && (
            <div className="col-span-3 -mt-1 flex gap-4 pl-1 text-[12px] text-slate-600">
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.taxable !== false} onChange={(e) => setV((x: any) => ({ ...x, [key]: x[key].map((y: any, j: number) => (j === i ? { ...y, taxable: e.target.checked } : y)) }))} /> Taxable (PAYE)</label>
              <label className="flex items-center gap-1.5"><input type="checkbox" checked={a.pensionable !== false} onChange={(e) => setV((x: any) => ({ ...x, [key]: x[key].map((y: any, j: number) => (j === i ? { ...y, pensionable: e.target.checked } : y)) }))} /> Subject to RSSB</label>
            </div>
          )}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => setV((x: any) => ({ ...x, [key]: [...x[key], { name: "", amount: 0, taxable: true, pensionable: true }] }))}><Plus size={14} /> Add</Button>
    </div>
  );
  const p = preview.data;
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[100dvh] w-full max-w-4xl overflow-y-auto bg-white sm:max-h-[94vh]">
        <DialogHeader>
          <DialogTitle>Salary — {user.name}</DialogTitle>
          <DialogDescription>Monthly amounts in RWF. The payslip preview uses the current tax settings.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Employment type"><select className={inputCls} value={v.employment_type} onChange={set("employment_type")}>{EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</select></Field>
              <Field label="Basic salary" required><input type="number" min={0} className={cn(inputCls, "text-right")} value={v.basic_salary} onChange={set("basic_salary")} /></Field>
              <Field label="Transport allowance" hint="Not subject to RSSB pension"><input type="number" min={0} className={cn(inputCls, "text-right")} value={v.transport_allowance} onChange={set("transport_allowance")} /></Field>
              <Field label="Housing allowance"><input type="number" min={0} className={cn(inputCls, "text-right")} value={v.housing_allowance} onChange={set("housing_allowance")} /></Field>
              <Field label="Communication allowance"><input type="number" min={0} className={cn(inputCls, "text-right")} value={v.communication_allowance} onChange={set("communication_allowance")} /></Field>
            </div>
            <div><p className="mb-1.5 text-[13px] font-medium text-slate-700">Other allowances</p>{list("other_allowances")}</div>
            <div><p className="mb-1.5 text-[13px] font-medium text-slate-700">Recurring deductions</p><p className="mb-2 text-[12px] text-slate-500">e.g. staff savings, loan repayment, union fees</p>{list("recurring_deductions")}</div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Bank"><input className={inputCls} value={v.bank_name || ""} onChange={set("bank_name")} /></Field>
              <Field label="Account number"><input className={inputCls} value={v.bank_account || ""} onChange={set("bank_account")} /></Field>
              <Field label="RSSB number"><input className={inputCls} value={v.rssb_number || ""} onChange={set("rssb_number")} /></Field>
              <Field label="TIN"><input className={inputCls} value={v.tin || ""} onChange={set("tin")} /></Field>
            </div>
            <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4" checked={Boolean(v.active)} onChange={set("active")} /> Include in payroll</label>
          </div>
          <aside className="h-fit rounded-lg border border-slate-200 bg-slate-50 p-4 text-[12.5px]">
            <p className="mb-2 font-semibold text-slate-900">Payslip preview</p>
            {!p ? <p className="text-slate-500">Enter a basic salary.</p> : (
              <dl className="space-y-1">
                {[["Gross", p.gross, true], ["PAYE", -p.paye], ["Pension (employee)", -p.pension_ee], ["Maternity (employee)", -p.maternity_ee], ["CBHI", -p.cbhi], ...(p.medical_ee ? [["Medical", -p.medical_ee]] : []), ...(p.other_deductions?.length ? [["Other deductions", -p.other_deductions.reduce((a: number, d: any) => a + d.amount, 0)]] : [])].map(([k, n, b]: any) => (
                  <div key={k} className={cn("flex justify-between", b && "font-semibold")}><dt>{k}</dt><dd className="tabular-nums">{rwf(n)}</dd></div>
                ))}
                <div className="flex justify-between border-t border-slate-300 pt-1 text-[14px] font-bold"><dt>Net pay</dt><dd className="tabular-nums">{rwf(p.net)}</dd></div>
                <div className="flex justify-between pt-2 text-slate-600"><dt>Employer contributions</dt><dd className="tabular-nums">{rwf(p.employer_cost - p.gross)}</dd></div>
                <div className="flex justify-between font-semibold"><dt>Total cost</dt><dd className="tabular-nums">{rwf(p.employer_cost)}</dd></div>
              </dl>
            )}
          </aside>
        </div>
        <DialogFooter><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!(Number(v.basic_salary) > 0) || save.isLoading} onClick={() => save.mutate()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
