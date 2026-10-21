import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { CalendarRange, Check, CornerUpLeft, Download, ListPlus, Lock, Package, Pencil, Send, Trash2, Wallet, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge, EmptyState, Panel, StatusBadge } from "@/components/enterprise/ui";
import { ActionDialog, ActionKind, ApprovalTracker } from "@/components/enterprise/Approval";
import { Chatter, ControlBar, DocumentPage, FieldGrid, Notebook, Sheet, SheetTitle, SmartButtons, Totals, toChatter } from "@/components/enterprise/DocumentLayout";
import { PLAN_METHODS, PLAN_STATUS, PRIORITY, errorMessage, money, phase5Api, procurementApi } from "@/lib/procurement";
import { MONTHS, MONTHS_SHORT } from "@/lib/hr";
import { Field, FormBlock, FormDialog, Progress, Segmented, inputCls } from "@/components/portal/kit";
import { cn } from "@/utils";
import { fyLabel, fyMonths, useFiscalYears } from "@/lib/fiscal";

const STEPS = [
  { key: "draft", label: "Draft" },
  { key: "pending_approval", label: "Approval" },
  { key: "approved", label: "Approved" },
  { key: "closed", label: "Closed" },
];
const EDITABLE = ["draft", "returned", "rejected"];

export default function PlanDetail() {
  const { planId } = useParams();
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState("lines");
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const [line, setLine] = React.useState<any>(null);
  const years = useFiscalYears();

  const q = useQuery(["plan", planId], async () => {
    const p: any = await pocketbase.collection("procurement_plans").getOne(planId!, { expand: "department,created_by,approval" });
    const [lines, progress, actions, audit] = await Promise.all([
      pocketbase.collection("procurement_plan_lines").getFullList({ filter: `plan = "${planId}"`, sort: "planned_month,sort", expand: "category,budget_line" }),
      phase5Api.planProgress(planId!).catch(() => ({ lines: {}, budget: null, coverage: [] })),
      pocketbase.collection("approval_actions").getFullList({ filter: `document_type = "procurement_plan" && document_id = "${planId}"`, sort: "created", expand: "actor,target_user" }).catch(() => [] as any[]),
      procurementApi.audit({ collection: "procurement_plans", record: planId, perPage: 100 }).then((x) => x.items).catch(() => []),
    ]);
    return { p, lines, progress, actions, audit };
  });
  const refresh = () => {
    queryClient.invalidateQueries(["plan", planId]);
    queryClient.invalidateQueries(["record-table"]);
  };
  const act = useMutation((a: "submit" | "close") => phase5Api.planAction(planId!, a), {
    onSuccess: (_, a) => {
      toast.success(a === "submit" ? "Plan sent for approval" : "Plan closed");
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  const del = useMutation((id: string) => pocketbase.collection("procurement_plan_lines").delete(id), {
    onSuccess: () => refresh(),
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  if (q.isLoading) return <div className="space-y-4 px-4 py-4 sm:px-6"><Skeleton className="h-12 w-80" /><Skeleton className="h-96 w-full" /></div>;
  if (!q.data) return <div className="p-4"><Panel><EmptyState icon={CalendarRange} title="Plan not available" text="It may be outside what your role can see." /></Panel></div>;
  const { p, lines, progress, actions, audit } = q.data;
  const approval = p.expand?.approval;
  const isApprover = approval?.status === "pending" && (approval.pending_approvers || "").split(",").includes(me?.id);
  const canEdit = canPerform("manage_procurement_plan") && EDITABLE.includes(p.status);
  const active = (lines as any[]).filter((l) => l.status !== "cancelled");
  const total = active.reduce((a, l) => a + l.estimated_total, 0);
  const requested = Object.values(progress.lines).reduce((a: number, x: any) => a + x.requested, 0);
  const ordered = Object.values(progress.lines).reduce((a: number, x: any) => a + x.ordered, 0);
  const coverage = progress.coverage || [];
  const overLines = coverage.filter((c) => c.over > 0);
  const unlinked = active.filter((l) => !l.budget_line).length;
  const fyRec = years.data?.find((f) => f.year === p.fiscal_year);
  const months = fyMonths(p.fiscal_year, fyRec?.startMonth);
  const byMonth = months.map((m) => active.filter((l) => l.planned_month === m.month).reduce((a, l) => a + l.estimated_total, 0));
  const maxMonth = Math.max(1, ...byMonth);

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["#", "Description", "Category", "Budget line", "Quantity", "Unit", "Unit cost", "Estimated total", "Month", "Priority", "Method", "Requested", "Ordered", "Status"], ...(lines as any[]).map((l, i) => [i + 1, l.description, l.expand?.category?.name || "", l.expand?.budget_line?.code || "", l.quantity, l.unit, l.estimated_unit_cost, l.estimated_total, MONTHS[l.planned_month - 1], l.priority, PLAN_METHODS[l.method] || l.method, progress.lines[l.id]?.requested || 0, progress.lines[l.id]?.ordered || 0, l.status])]), "Plan");
    XLSX.writeFile(wb, `${p.number}.xlsx`);
  }

  return (
    <DocumentPage chatter={<Chatter items={toChatter(actions, audit)} />}>
      <ControlBar
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Plans", link: "/dashboard/procurement/plans" }, { title: p.number }]}
        steps={STEPS}
        current={EDITABLE.includes(p.status) || p.status === "cancelled" ? "draft" : p.status}
        actions={
          <>
            {isApprover && (
              <>
                <Button size="sm" onClick={() => setDecision("approve")}><Check size={14} /> Approve</Button>
                <Button size="sm" variant="outline" onClick={() => setDecision("return")}><CornerUpLeft size={14} /> Send back</Button>
                <Button size="sm" variant="outline" className="text-red-700" onClick={() => setDecision("reject")}><XCircle size={14} /> Reject</Button>
              </>
            )}
            {canEdit && <Button size="sm" onClick={() => setLine({})}><ListPlus size={14} /> Add planned purchase</Button>}
            {canEdit && <Button size="sm" variant="outline" disabled={act.isLoading || !active.length} onClick={() => act.mutate("submit")}><Send size={14} /> Submit for approval</Button>}
            {canPerform("manage_procurement_plan") && p.status === "approved" && <Button size="sm" variant="ghost" onClick={() => act.mutate("close")}><Lock size={14} /> Close plan</Button>}
            <Button size="sm" variant="outline" onClick={exportExcel}><Download size={14} /> Excel</Button>
          </>
        }
      />
      <SmartButtons
        items={[
          { icon: Package, label: "Planned purchases", value: active.length },
          { icon: Wallet, label: "Estimated total", value: money(total) },
          { icon: Send, label: "Requested so far", value: money(requested) },
          { icon: Wallet, label: "Budget lines", value: overLines.length ? `${overLines.length} over budget` : unlinked ? `${unlinked} not linked` : `${coverage.length} covered`, tone: overLines.length ? ("danger" as const) : unlinked ? ("warning" as const) : ("default" as const), onClick: () => setTab("budget") },
        ]}
      />
      <Sheet ribbon={p.status === "approved" ? { label: "Approved", tone: "success" } : p.status === "closed" ? { label: "Closed", tone: "neutral" } : undefined}>
        <SheetTitle kicker={`Procurement plan · ${fyRec?.name || fyLabel(p.fiscal_year)}`} title={p.name} badges={<StatusBadge status={p.status} map={PLAN_STATUS} />} />
        <FieldGrid
          left={[
            { label: "Number", value: p.number },
            { label: "Department", value: p.expand?.department?.name },
            { label: "Prepared by", value: p.expand?.created_by?.name },
          ]}
          right={[
            { label: "Budget coverage", value: coverage.length ? `${coverage.length} budget line(s) · ${money(coverage.reduce((a, c) => a + c.budget, 0))}` : "No planned purchase is linked to a budget line yet", hint: overLines.length ? `${overLines.length} budget line(s) are planned above their budget` : undefined },
            { label: "Ordered so far", value: money(ordered) },
            { label: "Notes", value: p.notes },
          ]}
        />
        {overLines.length > 0 && <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-[12.5px] text-red-800">The plan is above the budget of {overLines.map((c) => c.code).join(", ")}. Reduce the plan or ask the Budget Officer for a budget revision — the plan cannot be submitted until it fits.</p>}
        {canEdit && unlinked > 0 && <p className="mt-3 rounded-md bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{unlinked} planned purchase(s) have no budget line yet. Every planned purchase must be charged to a budget line before the plan can be submitted.</p>}
        <Notebook active={tab} onChange={setTab} tabs={[{ key: "lines", label: "Planned purchases", count: lines.length }, { key: "budget", label: "Budget coverage", count: coverage.length }, { key: "calendar", label: "By month" }, ...(approval ? [{ key: "approval", label: "Approval" }] : [])]} />
        <div className="pt-4">
          {tab === "lines" && (
            !lines.length ? <EmptyState icon={Package} text="No planned purchase yet." action={canEdit && <Button size="sm" onClick={() => setLine({})}><ListPlus size={14} /> Add planned purchase</Button>} /> : (
              <>
                <div className="overflow-x-auto">
                  <table className="dnr-grid w-full min-w-[960px] text-[13px]">
                    <thead><tr className="border-y border-slate-200 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      <th className="w-8 px-3 py-2">#</th><th className="px-3 py-2">Planned purchase</th><th className="px-3 py-2 text-right">Qty</th><th className="px-3 py-2 text-right">Unit cost</th><th className="px-3 py-2 text-right">Estimated</th><th className="px-3 py-2">Budget line</th><th className="px-3 py-2">Month</th><th className="px-3 py-2">Priority</th><th className="px-3 py-2">Method</th><th className="w-32 px-3 py-2">Requested</th><th className="px-3 py-2">Status</th>{canEdit && <th className="w-16" />}
                    </tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {(lines as any[]).map((l, i) => {
                        const pr = progress.lines[l.id] || { requested: 0, ordered: 0, requisitions: [] };
                        return (
                          <tr key={l.id} className={cn(l.status === "cancelled" && "text-slate-400 line-through")}>
                            <td className="px-3 py-2.5 text-slate-500">{i + 1}</td>
                            <td className="px-3 py-2.5"><p className="font-medium text-slate-900">{l.description}</p><p className="text-[12px] text-slate-500">{l.expand?.category?.name}{l.project ? ` · project ${l.project}` : ""}</p></td>
                            <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums">{l.quantity} <span className="text-[12px] text-slate-500">{l.unit}</span></td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{Math.round(l.estimated_unit_cost).toLocaleString()}</td>
                            <td className="px-3 py-2.5 text-right font-medium tabular-nums">{Math.round(l.estimated_total).toLocaleString()}</td>
                            <td className="px-3 py-2.5">{l.expand?.budget_line ? <span className="font-mono text-[12px] text-slate-700">{l.expand.budget_line.code}</span> : <span className="text-[12px] font-medium text-amber-700">Not linked</span>}</td>
                            <td className="whitespace-nowrap px-3 py-2.5">{months.find((m) => m.month === l.planned_month)?.label || MONTHS[l.planned_month - 1]}</td>
                            <td className="px-3 py-2.5"><Badge tone={PRIORITY[l.priority]?.tone}>{PRIORITY[l.priority]?.label || l.priority}</Badge></td>
                            <td className="px-3 py-2.5 text-slate-600">{PLAN_METHODS[l.method] || l.method}</td>
                            <td className="px-3 py-2.5">
                              <Progress value={l.estimated_total ? (pr.requested / l.estimated_total) * 100 : 0} />
                              {pr.requisitions.map((r: any) => <Link key={r.id} to={`/dashboard/procurement/requisitions/${r.id}`} className="mr-2 text-[11.5px] text-primaryDark hover:underline">{r.number}</Link>)}
                            </td>
                            <td className="px-3 py-2.5 capitalize text-slate-600">{String(l.status).replace(/_/g, " ")}</td>
                            {canEdit && (
                              <td className="whitespace-nowrap px-2 py-2.5 text-right">
                                <button type="button" onClick={() => setLine(l)} className="rounded p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Edit"><Pencil size={14} /></button>
                                <button type="button" onClick={() => del.mutate(l.id)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 size={14} /></button>
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <Totals rows={[["Requested so far", money(requested)], ["Ordered so far", money(ordered)]]} total={["Estimated total", money(total)]} />
              </>
            )
          )}
          {tab === "budget" && (
            !coverage.length ? <EmptyState icon={Wallet} text="Link planned purchases to budget lines to see how the plan fits the budget." /> : (
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[720px]">
                  <thead><tr><th>Budget line</th><th className="text-right">Budget</th><th className="text-right">Planned in this plan</th><th className="text-right">Still available</th><th>Fit</th></tr></thead>
                  <tbody>
                    {coverage.map((c) => (
                      <tr key={c.id}>
                        <td><span className="block font-mono text-[12.5px] font-semibold text-slate-800">{c.code}</span><span className="block text-[12px] text-slate-500">{c.name}</span></td>
                        <td className="text-right tabular-nums">{money(c.budget)}</td>
                        <td className="text-right font-medium tabular-nums">{money(c.planned)}</td>
                        <td className="text-right tabular-nums text-slate-600">{money(c.available)}</td>
                        <td>{c.over > 0 ? <span className="inline-flex items-center gap-1 text-[12.5px] font-medium text-red-700"><XCircle size={13} /> {money(c.over)} over</span> : <span className="inline-flex items-center gap-1 text-[12.5px] text-emerald-700"><Check size={13} /> Fits ({c.budget ? Math.round((c.planned / c.budget) * 100) : 0}% of the line)</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          )}
          {tab === "calendar" && (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6 lg:grid-cols-12">
              {byMonth.map((v, i) => (
                <div key={i} className="rounded-lg border border-slate-200 p-2 text-center">
                  <p className="text-[11px] font-semibold uppercase text-slate-500">{MONTHS_SHORT[months[i].month - 1]}</p>
                  <div className="mx-auto my-1.5 flex h-20 w-6 items-end rounded bg-slate-100"><div className="w-full rounded bg-primary" style={{ height: `${(v / maxMonth) * 100}%` }} /></div>
                  <p className="text-[11.5px] font-medium tabular-nums">{v ? `${Math.round(v / 1e6 * 10) / 10}M` : "—"}</p>
                  <p className="text-[10.5px] text-slate-500">{active.filter((l) => l.planned_month === months[i].month).length} item(s)</p>
                </div>
              ))}
            </div>
          )}
          {tab === "approval" && <ApprovalTracker approval={approval} actions={actions} />}
        </div>
      </Sheet>
      <ActionDialog
        kind={decision}
        number={p.number}
        onClose={() => setDecision(null)}
        run={(kind, { comment, user }) => procurementApi.act(approval.id, { action: kind, comment, user })}
        onDone={() => {
          setDecision(null);
          refresh();
        }}
      />
      {line && <LineDialog plan={p} line={line.id ? line : null} onClose={() => setLine(null)} onDone={() => { setLine(null); refresh(); }} />}
    </DocumentPage>
  );
}

function LineDialog({ plan, line, onClose, onDone }: { plan: any; line: any | null; onClose: () => void; onDone: () => void }) {
  const [v, setV] = React.useState({
    description: line?.description || "", category: line?.category || "", quantity: line?.quantity ? String(line.quantity) : "", unit: line?.unit || "Each",
    estimated_unit_cost: line?.estimated_unit_cost ? String(line.estimated_unit_cost) : "", planned_month: line?.planned_month || new Date().getMonth() + 1,
    priority: line?.priority || "medium", method: line?.method || "rfq", project: line?.project || "", cost_center: line?.cost_center || "", notes: line?.notes || "",
    budget_line: line?.budget_line || "",
  });
  const years = useFiscalYears();
  // Active spending lines of the plan's department in the plan's fiscal year.
  const budgetLines = useQuery(["plan-budget-lines", plan.department, plan.fiscal_year], async () => {
    const fy = await pocketbase.collection("fiscal_years").getFirstListItem(`start_date >= "${plan.fiscal_year}-01-01 00:00:00" && start_date <= "${plan.fiscal_year}-12-31 23:59:59"`).catch(() => null);
    if (!fy) return [];
    return pocketbase.collection("budget_lines").getFullList({ filter: `status = "active" && kind != "revenue" && department = "${plan.department}" && fiscal_year = "${fy.id}"`, sort: "code", expand: "gl_account" });
  });
  const [tried, setTried] = React.useState(false);
  const cats = useQuery(["proc-categories"], () => pocketbase.collection("procurement_categories").getFullList({ sort: "name", fields: "id,name,expense_account" }));
  // Choosing a category proposes the department's budget line for that category's account.
  React.useEffect(() => {
    if (v.budget_line || !v.category) return;
    const account = (cats.data || []).find((c: any) => c.id === v.category)?.expense_account;
    const match = (budgetLines.data || []).find((b: any) => b.gl_account === account);
    if (match) setV((x) => ({ ...x, budget_line: match.id }));
  }, [v.category, cats.data, budgetLines.data]); // eslint-disable-line react-hooks/exhaustive-deps
  const total = (Number(v.quantity) || 0) * (Number(v.estimated_unit_cost) || 0);
  const errors = { description: v.description.trim().length < 3 && "Describe the purchase.", quantity: !(Number(v.quantity) > 0) && "Enter the quantity.", cost: !(Number(v.estimated_unit_cost) >= 0) || v.estimated_unit_cost === "" ? "Enter the estimated unit cost." : false, budget_line: !v.budget_line && "Choose the budget line." };
  const set = (k: keyof typeof v) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation(
    () => {
      const data = { ...v, plan: plan.id, quantity: Number(v.quantity), estimated_unit_cost: Number(v.estimated_unit_cost), planned_month: Number(v.planned_month) };
      return line ? pocketbase.collection("procurement_plan_lines").update(line.id, data) : pocketbase.collection("procurement_plan_lines").create(data);
    },
    {
      onSuccess: () => {
        toast.success(line ? "Planned purchase updated" : "Planned purchase added");
        onDone();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={ListPlus}
      title={line ? "Edit planned purchase" : "Add a planned purchase"}
      description={<>{plan.name}. <span className="text-red-600">*</span> required</>}
      submitLabel={`${line ? "Save" : "Add to plan"}${total ? ` · ${money(total)}` : ""}`}
      busy={save.isLoading}
      onSubmit={() => {
        setTried(true);
        if (!Object.values(errors).some(Boolean)) save.mutate();
      }}
    >
      <FormBlock icon={Package} title="What will be bought">
        <Field label="Description" required error={tried && errors.description}><input className={inputCls} value={v.description} onChange={set("description")} placeholder="e.g. Laptops for new staff" /></Field>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Quantity" required error={tried && errors.quantity}><input type="number" min={0} className={`${inputCls} text-right`} value={v.quantity} onChange={set("quantity")} /></Field>
          <Field label="Unit"><input className={inputCls} value={v.unit} onChange={set("unit")} /></Field>
          <Field label="Estimated unit cost (RWF)" required error={tried && errors.cost} className="col-span-2"><input type="number" min={0} className={`${inputCls} text-right`} value={v.estimated_unit_cost} onChange={set("estimated_unit_cost")} /></Field>
        </div>
        <Field label="Category"><select className={inputCls} value={v.category} onChange={set("category")}><option value="">Choose</option>{(cats.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Budget line" required error={tried && errors.budget_line} hint={!budgetLines.isLoading && !(budgetLines.data || []).length ? "No approved budget line for this department and fiscal year — ask the Budget Officer." : "The money for this purchase comes from this line."}>
          <select className={inputCls} value={v.budget_line} onChange={set("budget_line")}>
            <option value="">Choose the budget line…</option>
            {(budgetLines.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.code} — {b.expand?.gl_account?.name || b.name}</option>)}
          </select>
        </Field>
        {total > 0 && <p className="rounded-lg bg-slate-50 px-3 py-2 text-[13px]">Estimated total: <span className="font-semibold tabular-nums">{money(total)}</span></p>}
      </FormBlock>
      <FormBlock icon={CalendarRange} title="When and how">
        <Field label="Planned month" required>
          <select className={inputCls} value={v.planned_month} onChange={set("planned_month")}>{fyMonths(plan.fiscal_year, years.data?.find((f) => f.year === plan.fiscal_year)?.startMonth).map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}</select>
        </Field>
        <Field label="Priority"><Segmented value={v.priority} onChange={(p) => setV((x) => ({ ...x, priority: p }))} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }]} ariaLabel="Priority" /></Field>
        <Field label="Procurement method"><select className={inputCls} value={v.method} onChange={set("method")}>{Object.entries(PLAN_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Project"><input className={inputCls} value={v.project} onChange={set("project")} placeholder="Optional" /></Field>
          <Field label="Cost centre"><input className={inputCls} value={v.cost_center} onChange={set("cost_center")} placeholder="Optional" /></Field>
        </div>
      </FormBlock>
    </FormDialog>
  );
}
