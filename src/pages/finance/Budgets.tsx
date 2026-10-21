import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Download, Pencil, PiggyBank, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, CHART, EmptyState, MetricGroup, PageHeader, Panel } from "@/components/enterprise/ui";
import { BudgetUsage, compactMoney, errorMessage, financeApi, money } from "@/lib/procurement";
import { cn } from "@/utils";

const CONTROL = {
  none: { label: "Budget control off", tone: "neutral" as const },
  warn: { label: "Over-budget requests are flagged", tone: "warning" as const },
  block: { label: "Over-budget requests are blocked", tone: "danger" as const },
};
const selectCls = "h-[38px] w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20";

export default function Budgets() {
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_budgets");
  const thisYear = new Date().getFullYear();
  const [year, setYear] = React.useState(thisYear);
  const [editing, setEditing] = React.useState<Partial<BudgetUsage> | null>(null);
  const q = useQuery(["budget-usage", year], () => financeApi.budgetUsage(year), { keepPreviousData: true });
  const items = [...(q.data?.items || [])].sort((a, b) => a.department_name.localeCompare(b.department_name) || a.name.localeCompare(b.name));
  const sum = (k: keyof BudgetUsage) => items.reduce((a, b) => a + (Number(b[k]) || 0), 0);
  const total = { amount: sum("amount"), committed: sum("committed"), invoiced: sum("invoiced"), paid: sum("paid"), remaining: sum("remaining") };
  const pct = (v: number, of: number) => (of ? Math.round((v / of) * 100) : 0);
  const over = items.filter((b) => b.remaining < 0);

  const exportCsv = () => {
    const rows = [["Department", "Budget line", "Category", "Cost centre", "Budget", "Committed", "Actual (billed)", "Paid", "Available", "Used %"]];
    for (const b of items) rows.push([b.department_name, b.name, b.category_name, b.cost_center, b.amount, b.committed, b.invoiced, b.paid, b.remaining, pct(b.committed + b.invoiced, b.amount)].map(String));
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `budgets-${year}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Budgets"
        description="Annual budget per department: what is committed on open purchase orders, billed, paid and still available."
        breadcrumbs={[{ title: "Accounts payable", link: "/dashboard/finance/invoices" }, { title: "Budgets", link: "/dashboard/finance/budgets" }]}
        actions={
          <>
            <select className={cn(selectCls, "w-28")} value={year} onChange={(e) => setYear(Number(e.target.value))} aria-label="Fiscal year">
              {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>FY {y}</option>)}
            </select>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!items.length}><Download size={14} /> Export</Button>
            {canManage && <Button size="sm" onClick={() => setEditing({ fiscal_year: year })}><Plus size={14} /> New budget</Button>}
          </>
        }
      />

      {q.data && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-slate-600">
          <Badge tone={CONTROL[q.data.control].tone}>{CONTROL[q.data.control].label}</Badge>
          {over.length > 0 && <Badge tone="danger">{over.length} budget line{over.length > 1 ? "s" : ""} over budget</Badge>}
        </div>
      )}

      <MetricGroup
        title={`Fiscal year ${year}`}
        icon={PiggyBank}
        columns={4}
        loading={q.isLoading}
        metrics={[
          { label: "Approved budget", value: compactMoney(total.amount), sub: `${items.length} budget lines` },
          { label: "Committed (open POs)", value: compactMoney(total.committed), sub: `${pct(total.committed, total.amount)}% of budget` },
          { label: "Actual (billed)", value: compactMoney(total.invoiced), sub: `${compactMoney(total.paid)} paid` },
          { label: "Available", value: compactMoney(total.remaining), sub: `${pct(total.remaining, total.amount)}% left`, tone: total.remaining < 0 ? "danger" : "success" },
        ]}
      />

      <Panel
        title="Budget vs. actual"
        subtitle="Available = budget − committed − billed. Committed is the unbilled part of approved purchase orders."
        bodyClassName="px-0"
        action={
          <div className="flex items-center gap-3 text-[12px] text-slate-600" aria-label="Legend">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.series1 }} /> Billed</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART.series2 }} /> Committed</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-slate-200" /> Available</span>
          </div>
        }
      >
        {q.isLoading ? (
          <div className="px-4"><Skeleton className="h-48 w-full" /></div>
        ) : !items.length ? (
          <EmptyState icon={PiggyBank} title={`No budgets for ${year}`} text="Create a budget per department so requisitions and purchase orders are checked against it." action={canManage && <Button size="sm" onClick={() => setEditing({ fiscal_year: year })}><Plus size={14} /> New budget</Button>} />
        ) : (
          <div className="overflow-x-auto">
            <table className="dnr-grid w-full min-w-[1000px] text-[13px]">
              <thead>
                <tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2">Department / budget line</th>
                  <th className="px-3 py-2 text-right">Budget</th>
                  <th className="px-3 py-2 text-right">Committed</th>
                  <th className="px-3 py-2 text-right">Billed</th>
                  <th className="px-3 py-2 text-right">Paid</th>
                  <th className="px-3 py-2 text-right">Available</th>
                  <th className="w-56 px-3 py-2">Consumption</th>
                  {canManage && <th className="w-10 px-3 py-2" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {items.map((b) => {
                  const used = pct(b.committed + b.invoiced, b.amount);
                  const wb = Math.min(100, (b.invoiced / (b.amount || 1)) * 100);
                  const wc = Math.min(100 - wb, (b.committed / (b.amount || 1)) * 100);
                  return (
                    <tr key={b.id} className={cn("hover:bg-slate-50/60", b.remaining < 0 && "bg-red-50/40")}>
                      <td className="px-3 py-2.5">
                        <p className="font-medium text-slate-800">{b.department_name}</p>
                        <p className="text-[12px] text-slate-500">{[b.name.replace(`${b.department_name} — `, ""), b.category_name, b.cost_center && `CC ${b.cost_center}`].filter(Boolean).join(" · ")}{b.status === "closed" && " · closed"}</p>
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(b.amount)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">{money(b.committed)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">{money(b.invoiced)}</td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">{money(b.paid)}</td>
                      <td className={cn("whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums", b.remaining < 0 ? "text-red-600" : "text-slate-900")}>{money(b.remaining)}</td>
                      <td className="px-3 py-2.5">
                        <div className="flex h-2.5 overflow-hidden rounded-full bg-slate-200" title={`Billed ${money(b.invoiced)} · Committed ${money(b.committed)} · Available ${money(b.remaining)}`}>
                          <div style={{ width: `${wb}%`, background: CHART.series1 }} />
                          {wc > 0 && <div className="border-l-2 border-white" style={{ width: `${wc}%`, background: CHART.series2 }} />}
                        </div>
                        <p className={cn("mt-0.5 text-[11.5px] tabular-nums", used > 100 ? "font-medium text-red-600" : used >= 85 ? "text-amber-700" : "text-slate-500")}>{used}% used</p>
                      </td>
                      {canManage && (
                        <td className="px-3 py-2.5 text-right">
                          <button type="button" className="rounded p-1 text-slate-500 hover:bg-slate-100 hover:text-slate-800" onClick={() => setEditing(b)} aria-label={`Edit ${b.name}`}><Pencil size={14} /></button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                  <td className="px-3 py-2.5">Total</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(total.amount)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(total.committed)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(total.invoiced)}</td>
                  <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{money(total.paid)}</td>
                  <td className={cn("whitespace-nowrap px-3 py-2.5 text-right tabular-nums", total.remaining < 0 && "text-red-600")}>{money(total.remaining)}</td>
                  <td className="px-3 py-2.5 text-[12px] font-normal text-slate-500">{pct(total.committed + total.invoiced, total.amount)}% used</td>
                  {canManage && <td />}
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Panel>

      {editing && <BudgetDialog budget={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function BudgetDialog({ budget, onClose }: { budget: Partial<BudgetUsage>; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = React.useState({
    name: budget.name || "",
    department: budget.department || "",
    category: budget.category || "",
    fiscal_year: String(budget.fiscal_year || new Date().getFullYear()),
    amount: budget.amount ? String(budget.amount) : "",
    cost_center: budget.cost_center || "",
    status: budget.status || "active",
    notes: budget.notes || "",
  });
  const [tried, setTried] = React.useState(false);
  const refs = useQuery(["budget-refs"], async () => {
    const [departments, categories] = await Promise.all([
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("procurement_categories").getFullList({ sort: "name", fields: "id,name" }).catch(() => [] as any[]),
    ]);
    return { departments, categories };
  });
  const save = useMutation(
    () => {
      const data = { ...v, fiscal_year: Number(v.fiscal_year), amount: Number(v.amount), currency: "RWF" };
      return budget.id ? pocketbase.collection("budgets").update(budget.id, data) : pocketbase.collection("budgets").create(data);
    },
    {
      onSuccess: () => {
        toast.success(budget.id ? "Budget updated" : "Budget created");
        queryClient.invalidateQueries(["budget-usage"]);
        onClose();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  const errors = {
    name: !v.name.trim() && "Give the budget line a name.",
    department: !v.department && "Choose a department.",
    amount: !(Number(v.amount) > 0) && "Enter an amount greater than zero.",
    fiscal_year: !(Number(v.fiscal_year) >= 2000 && Number(v.fiscal_year) <= 2100) && "Enter a valid year.",
  };
  const invalid = Object.values(errors).some(Boolean);
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const err = (k: keyof typeof errors) => tried && errors[k] && <span className="mt-1 block text-[12px] text-red-600">{errors[k]}</span>;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl bg-white">
        <DialogHeader>
          <DialogTitle>{budget.id ? `Edit budget · ${budget.name}` : "New budget"}</DialogTitle>
          <DialogDescription>Leave the category empty for a department-wide budget. A category budget takes priority for purchases in that category.</DialogDescription>
        </DialogHeader>
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2"
          onSubmit={(e) => {
            e.preventDefault();
            setTried(true);
            if (!invalid) save.mutate();
          }}
        >
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">
            Budget line <span className="text-red-600">*</span>
            <Input className="mt-1" value={v.name} onChange={set("name")} placeholder="e.g. Capacity Building — training & workshops" />
            {err("name")}
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Department <span className="text-red-600">*</span>
            <select className={cn(selectCls, "mt-1")} value={v.department} onChange={set("department")}>
              <option value="">Select…</option>
              {refs.data?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
            {err("department")}
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Category
            <select className={cn(selectCls, "mt-1")} value={v.category} onChange={set("category")}>
              <option value="">All categories</option>
              {refs.data?.categories.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Fiscal year <span className="text-red-600">*</span>
            <Input type="number" className="mt-1" value={v.fiscal_year} onChange={set("fiscal_year")} />
            {err("fiscal_year")}
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Amount (RWF) <span className="text-red-600">*</span>
            <Input type="number" min={0} className="mt-1 text-right tabular-nums" value={v.amount} onChange={set("amount")} />
            {Number(v.amount) > 0 && <span className="mt-1 block text-[11.5px] text-slate-500">{money(Number(v.amount))}</span>}
            {err("amount")}
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Cost centre
            <Input className="mt-1" value={v.cost_center} onChange={set("cost_center")} />
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Status
            <select className={cn(selectCls, "mt-1")} value={v.status} onChange={set("status")}>
              <option value="active">Active</option>
              <option value="closed">Closed</option>
            </select>
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">
            Notes
            <Textarea className="mt-1 h-16" value={v.notes} onChange={set("notes")} />
          </label>
          <DialogFooter className="sm:col-span-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" disabled={save.isLoading}>{save.isLoading ? "Saving…" : "Save"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
