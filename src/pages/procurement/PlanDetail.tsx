import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { Link, useParams } from "react-router-dom";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import { AlertTriangle, CalendarRange, Check, Clock, CornerUpLeft, Download, ListPlus, Lock, Package, Pencil, Send, Trash2, Wallet, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { ActionDialog, ActionKind, Activity, ApprovalTracker } from "@/components/enterprise/Approval";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  ConfirmDialog,
  DataTable,
  DetailHeader,
  Details,
  EmptyState,
  Field,
  Input,
  KpiBand,
  MenuItem,
  Modal,
  MoneyInput,
  MoreMenu,
  Num,
  Page,
  Priority,
  Select,
  StatusPill,
  StatusWord,
  Tabs,
  TwoLine,
  fmtMoney,
  fmtNumber,
} from "@/components/ims";
import { PLAN_METHODS, PLAN_STATUS, errorMessage, phase5Api, procurementApi } from "@/lib/procurement";
import { MONTHS, MONTHS_SHORT } from "@/lib/hr";
import { Progress, Segmented } from "@/components/portal/kit";
import { cn } from "@/utils";
import { fyLabel, fyMonths, useFiscalYears } from "@/lib/fiscal";

const EDITABLE = ["draft", "returned", "rejected"];
const LIST = "/dashboard/procurement/plans";
type TabKey = "details" | "lines" | "budget" | "approvals" | "activity";

/** A planned purchase in the status glossary: a draft until the plan is approved, then approved to buy. */
function lineStatus(status: string, planStatus: string): { word: StatusWord; note?: string } {
  if (status === "in_progress") return { word: "In progress", note: "Requisition raised" };
  if (status === "completed") return { word: "Completed" };
  if (status === "cancelled") return { word: "Cancelled" };
  return { word: ["approved", "closed"].includes(planStatus) ? "Approved" : "Draft", note: "Not requested" };
}

export default function PlanDetail() {
  const { planId } = useParams();
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const me = pocketbase.authStore.model as any;
  const [tab, setTab] = React.useState<TabKey>("lines");
  const [decision, setDecision] = React.useState<ActionKind | null>(null);
  const [line, setLine] = React.useState<any>(null);
  const [removing, setRemoving] = React.useState<any>(null);
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
      const n = q.data?.p?.number || "Plan";
      toast.success(a === "submit" ? `${n} sent for approval` : `${n} closed`);
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

  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState icon={CalendarRange} text="This plan is not available. It may have been deleted, or your role cannot see it." action={<ButtonLink to={LIST}>Back to plans</ButtonLink>} />
        </Card>
      </Page>
    );
  }
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
  const stepName = approval?.status === "pending" ? approval.steps?.[approval.current_level]?.name : null;

  function exportExcel() {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([["#", "Description", "Category", "Budget line", "Quantity", "Unit", "Unit cost", "Estimated total", "Month", "Priority", "Method", "Requested", "Ordered", "Status"], ...(lines as any[]).map((l, i) => [i + 1, l.description, l.expand?.category?.name || "", l.expand?.budget_line?.code || "", l.quantity, l.unit, l.estimated_unit_cost, l.estimated_total, MONTHS[l.planned_month - 1], l.priority, PLAN_METHODS[l.method] || l.method, progress.lines[l.id]?.requested || 0, progress.lines[l.id]?.ordered || 0, l.status])]), "Plan");
    XLSX.writeFile(wb, `${p.number}.xlsx`);
  }

  // The next step is the primary button; at most two secondary buttons; the rest go under "More".
  const addLine = () => setLine({});
  const primary = isApprover ? (
    <Button variant="primary" icon={Check} onClick={() => setDecision("approve")}>Approve</Button>
  ) : canEdit && active.length ? (
    <Button variant="primary" icon={Send} loading={act.isLoading} onClick={() => act.mutate("submit")}>Submit for approval</Button>
  ) : canEdit ? (
    <Button variant="primary" icon={ListPlus} onClick={addLine}>Add planned purchase</Button>
  ) : null;
  const secondary = isApprover ? (
    <>
      <Button icon={CornerUpLeft} onClick={() => setDecision("return")}>Return</Button>
      <Button icon={XCircle} onClick={() => setDecision("reject")}>Reject</Button>
    </>
  ) : (
    <>
      <Button icon={Download} onClick={exportExcel}>Export to Excel</Button>
    </>
  );
  const more: MenuItem[] = [
    { label: "Export to Excel", icon: Download, onSelect: exportExcel, hidden: !isApprover },
    { label: "Close plan", icon: Lock, onSelect: () => act.mutate("close"), hidden: !(canPerform("manage_procurement_plan") && p.status === "approved") },
  ];

  const lineColumns: Column<any>[] = [
    {
      key: "description",
      header: "Planned purchase",
      className: "min-w-[230px]",
      cell: (l) => (
        <span className={cn("block", l.status === "cancelled" && "text-ims-faint line-through")}>
          <TwoLine
            main={l.description}
            sub={
              <>
                {[l.expand?.category?.name, l.project ? `project ${l.project}` : ""].filter(Boolean).join(" · ")}
                {(l.expand?.category?.name || l.project) && " · "}
                {l.expand?.budget_line ? <span className="font-mono text-[12px] text-ims-body">{l.expand.budget_line.code}</span> : <span className="font-semibold text-ims-warning">No budget line</span>}
              </>
            }
          />
        </span>
      ),
    },
    { key: "qty", header: "Quantity", numeric: true, cell: (l) => <>{fmtNumber(l.quantity, true)} <span className="text-t-small text-ims-muted">{l.unit}</span></> },
    { key: "unit_cost", header: "Unit cost (RWF)", numeric: true, cell: (l) => <Num value={l.estimated_unit_cost} /> },
    { key: "estimated", header: "Estimated (RWF)", numeric: true, cell: (l) => <span className="font-semibold"><Num value={l.estimated_total} /></span>, total: <Num value={total} /> },
    { key: "month", header: "Month", nowrap: true, cell: (l) => months.find((m) => m.month === l.planned_month)?.label || MONTHS[l.planned_month - 1], sub: (l) => PLAN_METHODS[l.method] || l.method },
    { key: "priority", header: "Priority", cell: (l) => <Priority value={l.priority} /> },
    {
      key: "requested",
      header: "Requested",
      width: "140px",
      cell: (l) => {
        const pr = progress.lines[l.id] || { requested: 0, ordered: 0, requisitions: [] };
        return (
          <>
            <Progress value={l.estimated_total ? (pr.requested / l.estimated_total) * 100 : 0} />
            {pr.requisitions.length > 0 && (
              <span className="mt-1 flex flex-wrap gap-x-2">
                {pr.requisitions.map((r: any) => <Link key={r.id} to={`/dashboard/procurement/requisitions/${r.id}`} className="whitespace-nowrap font-mono text-[12px] text-ims-link hover:underline">{r.number}</Link>)}
              </span>
            )}
          </>
        );
      },
    },
    {
      key: "status",
      header: "Status",
      nowrap: true,
      cell: (l) => {
        const s = lineStatus(l.status, p.status);
        return <StatusPill status={s.word} sub={s.note} />;
      },
    },
  ];
  const coverageColumns: Column<any>[] = [
    { key: "line", header: "Budget line", cell: (c) => <TwoLine main={<span className="font-mono text-[12.5px]">{c.code}</span>} sub={c.name} /> },
    { key: "budget", header: "Budget (RWF)", numeric: true, cell: (c) => <Num value={c.budget} />, total: <Num value={coverage.reduce((a, c) => a + c.budget, 0)} /> },
    { key: "planned", header: "Planned in this plan (RWF)", numeric: true, cell: (c) => <span className="font-semibold"><Num value={c.planned} /></span>, total: <Num value={coverage.reduce((a, c) => a + c.planned, 0)} /> },
    { key: "available", header: "Still available (RWF)", numeric: true, cell: (c) => <Num value={c.available} />, total: <Num value={coverage.reduce((a, c) => a + c.available, 0)} /> },
    {
      key: "fit",
      header: "Fit",
      nowrap: true,
      cell: (c) =>
        c.over > 0 ? (
          <span className="inline-flex items-center gap-1 text-t-small font-semibold text-ims-danger"><XCircle size={14} aria-hidden /> {fmtMoney(c.over)} over</span>
        ) : (
          <span className="inline-flex items-center gap-1 text-t-small font-semibold text-ims-success"><Check size={14} aria-hidden /> Fits · {c.budget ? Math.round((c.planned / c.budget) * 100) : 0}% of the line</span>
        ),
    },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to plans", to: LIST }}
        number={p.number}
        type={`Procurement plan · ${fyRec?.name || fyLabel(p.fiscal_year)}`}
        status={PLAN_STATUS[p.status]?.label || p.status}
        statusNote={stepName ? `At “${stepName}”` : PLAN_STATUS[p.status]?.note}
        title={p.name}
        facts={[
          p.expand?.department?.name,
          p.expand?.created_by?.name ? { label: "Prepared by", value: p.expand.created_by.name } : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary}
            {primary}
          </>
        }
      />

      {isApprover && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <Clock size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>Waiting for your decision{stepName ? ` at step “${stepName}”` : ""}. Approve it, return it for changes, or reject it.</span>
        </p>
      )}
      {overLines.length > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-card border border-ims-danger/30 bg-ims-danger-bg px-4 py-3 text-t-body text-ims-danger">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>The plan is above the budget of {overLines.map((c) => c.code).join(", ")}. Reduce the plan or ask the Budget Officer for a budget revision; the plan cannot be submitted until it fits.</span>
        </p>
      )}
      {canEdit && unlinked > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>{unlinked} planned purchase{unlinked === 1 ? " has" : "s have"} no budget line yet. Charge every planned purchase to a budget line before you submit the plan.</span>
        </p>
      )}

      <KpiBand
        items={[
          { label: "Estimated total", value: fmtMoney(total) },
          { label: "Requested so far", value: fmtMoney(requested) },
          { label: "Ordered so far", value: fmtMoney(ordered) },
          {
            label: "Budget lines",
            value: overLines.length ? `${overLines.length} over budget` : unlinked ? `${unlinked} not linked` : `${coverage.length} covered`,
            tone: overLines.length ? "danger" : unlinked ? "warning" : "default",
            onClick: () => setTab("budget"),
          },
        ]}
      />

      <Tabs
        label="Plan sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "details", label: "Details" },
          { key: "lines", label: "Planned purchases", count: lines.length },
          { key: "budget", label: "Budget coverage", count: coverage.length },
          { key: "approvals", label: "Approvals" },
          { key: "activity", label: "Activity" },
        ]}
      />

      {tab === "details" && (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <Card>
            <CardHeader title="Plan" />
            <Details
              columns={1}
              items={[
                { label: "Fiscal year", value: fyRec?.name || fyLabel(p.fiscal_year) },
                { label: "Department", value: p.expand?.department?.name },
                { label: "Prepared by", value: p.expand?.created_by?.name },
                {
                  label: "Budget coverage",
                  value: coverage.length ? `${coverage.length} budget line${coverage.length === 1 ? "" : "s"} · ${fmtMoney(coverage.reduce((a, c) => a + c.budget, 0))}` : "No planned purchase is linked to a budget line yet",
                  hint: overLines.length ? `${overLines.length} budget line${overLines.length === 1 ? " is" : "s are"} planned above budget` : undefined,
                },
                { label: "Notes", value: p.notes ? <span className="whitespace-pre-line">{p.notes}</span> : null },
              ]}
            />
          </Card>
          <Card className="xl:col-span-2">
            <CardHeader title="By month" subtitle="Estimated value of the planned purchases in each month of the fiscal year (RWF)." />
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {byMonth.map((v, i) => {
                const count = active.filter((l) => l.planned_month === months[i].month).length;
                return (
                  <div key={i} className="min-w-0 rounded-control border border-ims-divider p-2 text-center" title={`${months[i].label}: ${fmtMoney(v)} · ${count} item${count === 1 ? "" : "s"}`}>
                    <p className="text-t-small font-semibold text-ims-muted">{MONTHS_SHORT[months[i].month - 1]}</p>
                    <div className="mx-auto my-1.5 flex h-20 w-6 items-end overflow-hidden rounded bg-ims-subtle">
                      <div className="w-full rounded bg-ims-link" style={{ height: `${(v / maxMonth) * 100}%` }} />
                    </div>
                    <p className="text-[12px] font-semibold tabular-nums text-ims-text">{v ? `${Math.round((v / 1e6) * 10) / 10}M` : "—"}</p>
                    <p className="text-[11.5px] text-ims-muted">{count} item{count === 1 ? "" : "s"}</p>
                  </div>
                );
              })}
            </div>
          </Card>
        </div>
      )}

      {tab === "lines" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader
              title="Planned purchases"
              subtitle="What will be bought, when, how and from which budget line."
              action={canEdit && lines.length > 0 ? <Button size="sm" icon={ListPlus} onClick={addLine}>Add planned purchase</Button> : undefined}
            />
          </div>
          <DataTable
            columns={lineColumns}
            rows={lines as any[]}
            rowKey={(l) => l.id}
            rowActions={canEdit ? () => [
              { label: "Edit", icon: Pencil, onSelect: (l: any) => setLine(l) },
              { label: "Remove", icon: Trash2, danger: true, onSelect: (l: any) => setRemoving(l) },
            ] : undefined}
            minWidth={1040}
            caption="Planned purchases"
            totalLabel="Total"
            empty={<EmptyState compact icon={Package} text="No planned purchase yet." action={canEdit ? <Button variant="primary" icon={ListPlus} onClick={addLine}>Add planned purchase</Button> : undefined} />}
          />
        </Card>
      )}

      {tab === "budget" && (
        <Card padded={false}>
          <div className="px-5 pt-5">
            <CardHeader title="Budget coverage" subtitle="Planned total per budget line against what the line still holds." />
          </div>
          <DataTable
            columns={coverageColumns}
            rows={coverage}
            rowKey={(c) => c.id}
            minWidth={760}
            caption="Budget coverage"
            empty={<EmptyState compact icon={Wallet} text="Link planned purchases to budget lines to see how the plan fits the budget." />}
          />
        </Card>
      )}

      {tab === "approvals" && <ApprovalTracker approval={approval} actions={actions} />}

      {tab === "activity" && <Activity actions={actions} audit={audit} loading={false} />}

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
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title="Remove this planned purchase?"
        description={removing ? `“${removing.description}” is taken out of ${p.number}.` : ""}
        confirmLabel="Remove"
        danger
        onConfirm={() => del.mutateAsync(removing.id).catch(() => undefined)}
      />
      {line && <LineDialog plan={p} line={line.id ? line : null} onClose={() => setLine(null)} onDone={() => { setLine(null); refresh(); }} />}
    </Page>
  );
}

/** Numbered block inside a dialog: "1 · What will be bought". */
function DialogSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-ims-divider pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[15px] font-bold text-ims-text">
        {n}<span className="px-1.5 text-ims-faint">·</span>{title}
      </h3>
      {children}
    </section>
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
  const errors = { description: v.description.trim().length < 3 && "Describe the purchase (at least 3 characters).", quantity: !(Number(v.quantity) > 0) && "Enter a quantity above 0.", cost: !(Number(v.estimated_unit_cost) >= 0) || v.estimated_unit_cost === "" ? "Enter the estimated unit cost." : false, budget_line: !v.budget_line && "Choose the budget line the money comes from." };
  const set = (k: keyof typeof v) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const save = useMutation(
    () => {
      const data = { ...v, plan: plan.id, quantity: Number(v.quantity), estimated_unit_cost: Number(v.estimated_unit_cost), planned_month: Number(v.planned_month) };
      return line ? pocketbase.collection("procurement_plan_lines").update(line.id, data) : pocketbase.collection("procurement_plan_lines").create(data);
    },
    {
      onSuccess: () => {
        toast.success(line ? "Planned purchase updated" : `Planned purchase added to ${plan.number}`);
        onDone();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  const submit = () => {
    setTried(true);
    if (!Object.values(errors).some(Boolean)) save.mutate();
  };
  const err = (m: string | boolean) => (tried && typeof m === "string" && m ? m : null);
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={line ? "Edit planned purchase" : "Add a planned purchase"}
      description={plan.name}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} onClick={submit}>{line ? "Save" : "Add to plan"}</Button>
        </>
      }
    >
      <DialogSection n={1} title="What will be bought">
        <Field label="Description" required htmlFor="pl-desc" error={err(errors.description)}>
          <Input id="pl-desc" invalid={Boolean(err(errors.description))} value={v.description} onChange={set("description")} placeholder="e.g. Laptops for new staff" />
        </Field>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="Quantity" required htmlFor="pl-qty" error={err(errors.quantity)}>
            <Input id="pl-qty" type="number" min={0} invalid={Boolean(err(errors.quantity))} className="text-right tabular-nums" value={v.quantity} onChange={set("quantity")} />
          </Field>
          <Field label="Unit" htmlFor="pl-unit">
            <Input id="pl-unit" value={v.unit} onChange={set("unit")} />
          </Field>
          <Field label="Estimated unit cost" required htmlFor="pl-cost" error={err(errors.cost)} className="col-span-2">
            <MoneyInput id="pl-cost" invalid={Boolean(err(errors.cost))} value={v.estimated_unit_cost === "" ? "" : Number(v.estimated_unit_cost)} onChange={(n) => setV((x) => ({ ...x, estimated_unit_cost: n === "" ? "" : String(n) }))} />
          </Field>
        </div>
        <Field label="Category" htmlFor="pl-cat">
          <Select id="pl-cat" value={v.category} onChange={set("category")}>
            <option value="">Choose a category</option>
            {(cats.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field
          label="Budget line"
          required
          htmlFor="pl-budget"
          error={err(errors.budget_line)}
          hint={!budgetLines.isLoading && !(budgetLines.data || []).length ? "No approved budget line for this department and fiscal year. Ask the Budget Officer." : "The money for this purchase comes from this line."}
        >
          <Select id="pl-budget" invalid={Boolean(err(errors.budget_line))} value={v.budget_line} onChange={set("budget_line")}>
            <option value="">Choose the budget line</option>
            {(budgetLines.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.code} · {b.expand?.gl_account?.name || b.name}</option>)}
          </Select>
        </Field>
        {total > 0 && (
          <p className="rounded-control bg-ims-subtle px-3 py-2 text-t-body text-ims-body">
            Estimated total: <span className="font-bold tabular-nums text-ims-text">{fmtMoney(total)}</span>
          </p>
        )}
      </DialogSection>
      <DialogSection n={2} title="When and how">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Planned month" required htmlFor="pl-month">
            <Select id="pl-month" value={v.planned_month} onChange={set("planned_month")}>
              {fyMonths(plan.fiscal_year, years.data?.find((f) => f.year === plan.fiscal_year)?.startMonth).map((m) => <option key={m.month} value={m.month}>{m.label}</option>)}
            </Select>
          </Field>
          <Field label="Procurement method" htmlFor="pl-method">
            <Select id="pl-method" value={v.method} onChange={set("method")}>{Object.entries(PLAN_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
        </div>
        <Field label="Priority">
          <Segmented value={v.priority} onChange={(pr) => setV((x) => ({ ...x, priority: pr }))} options={[{ value: "low", label: "Low" }, { value: "medium", label: "Medium" }, { value: "high", label: "High" }, { value: "urgent", label: "Urgent" }]} ariaLabel="Priority" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Project" htmlFor="pl-project">
            <Input id="pl-project" value={v.project} onChange={set("project")} placeholder="Optional" />
          </Field>
          <Field label="Cost centre" htmlFor="pl-cc">
            <Input id="pl-cc" value={v.cost_center} onChange={set("cost_center")} placeholder="Optional" />
          </Field>
        </div>
      </DialogSection>
    </Modal>
  );
}
