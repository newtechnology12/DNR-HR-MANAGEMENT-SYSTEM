import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, GitBranch, Pencil, Play, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";
import { Badge, EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import { APPROVER_TYPES, ApprovalStep, errorMessage, money, procurementApi } from "@/lib/procurement";

const inputCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

const DOCUMENT_TYPES: Record<string, string> = {
  purchase_requisition: "Purchase requisitions",
  purchase_order: "Purchase orders",
  supplier_invoice: "Supplier invoices (vendor bills)",
  payroll: "Payroll",
  supplier: "Supplier registrations",
  purchase_return: "Purchase returns",
  contract: "Contracts",
  procurement_plan: "Procurement plans",
  budget: "Budgets",
  budget_revision: "Budget revisions",
  payment_voucher: "Payment vouchers",
  journal_entry: "Journal entries",
  asset_disposal: "Asset disposals",
  bank_reconciliation: "Bank reconciliations",
};

const blank = () => ({
  id: "",
  name: "",
  description: "",
  document_type: "purchase_requisition",
  active: true,
  priority: 10,
  min_amount: 0,
  max_amount: 0,
  departments: [] as string[],
  categories: [] as string[],
  branches: [] as string[],
  funding_sources: [] as string[],
  overdue_hours: 48,
  allow_self_approval: false,
  steps: [{ name: "Department head", approver_type: "department_head" }] as ApprovalStep[],
});

/** `embedded`: rendered as a tab inside Settings (no page header). */
export default function ApprovalWorkflows({ embedded = false }: { embedded?: boolean }) {
  const queryClient = useQueryClient();
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_approval_workflows");
  const [editing, setEditing] = React.useState<ReturnType<typeof blank> | null>(null);
  const [toDelete, setToDelete] = React.useState<any>(null);

  const ref = useQuery(["workflow-reference"], async () => {
    const [workflows, roles, departments, categories, users, funding, limits] = await Promise.all([
      pocketbase.collection("approval_workflows").getFullList({ sort: "document_type,min_amount" }),
      pocketbase.collection("roles").getFullList({ sort: "sort_order,name", fields: "id,name,code" }),
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name,head" }),
      pocketbase.collection("procurement_categories").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("users").getFullList({ filter: `status = "Active"`, sort: "name", fields: "id,name" }),
      pocketbase.collection("funding_sources").getFullList({ sort: "code", fields: "id,name,code" }),
      pocketbase.collection("approval_limits").getFullList({ filter: "active = true", fields: "id,role,document_type,max_amount" }),
    ]);
    return { workflows, roles, departments, categories, users, funding, limits };
  });
  const nameOf = (list: any[] | undefined, id?: string) => list?.find((x) => x.id === id)?.name || "?";

  const remove = useMutation((id: string) => pocketbase.collection("approval_workflows").delete(id), {
    onSuccess: () => {
      toast.success("Workflow deleted");
      setToDelete(null);
      queryClient.invalidateQueries(["workflow-reference"]);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  const describe = (s: ApprovalStep) =>
    s.approver_type === "department_head"
      ? "Department head"
      : s.approver_type === "user"
      ? nameOf(ref.data?.users, s.user)
      : `${nameOf(ref.data?.roles, s.role)}${s.same_department ? " (same dept.)" : ""}`;

  const headsMissing = (ref.data?.departments || []).filter((d: any) => !d.head);
  const conditionOf = (s: ApprovalStep, documentType: string) => {
    const parts: string[] = [];
    if (s.min_amount) parts.push(`from ${money(s.min_amount)}`);
    if (s.max_amount) parts.push(`up to ${money(s.max_amount)}`);
    if (s.above_limit_of) {
      const limit = (ref.data?.limits || []).find((l: any) => l.role === s.above_limit_of && (l.document_type === documentType || !l.document_type));
      parts.push(`above the ${nameOf(ref.data?.roles, s.above_limit_of)} limit${limit ? ` (${limit.max_amount ? money(limit.max_amount) : "unlimited"})` : ""}`);
    }
    return parts.join(", ");
  };

  return (
    <div className={embedded ? "space-y-4 p-4" : "space-y-4 px-4 py-4 sm:px-6"}>
      {!embedded && <PageHeader
        title="Approval workflows"
        description="Who approves what. The most specific active workflow matching a document's amount, department and category is used."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Approval workflows", link: "#" }]}
        actions={canManage && <Button onClick={() => setEditing(blank())}><Plus size={15} /> New workflow</Button>}
      />}

      {headsMissing.length > 0 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          {headsMissing.length} department(s) have no head assigned ({headsMissing.map((d: any) => d.name).join(", ")}). “Department head” steps will use their fallback role, or block submission.
        </div>
      )}

      <RouteTester reference={ref.data} />

      {ref.isLoading ? (
        <Panel><ListSkeleton rows={4} /></Panel>
      ) : !ref.data?.workflows.length ? (
        <Panel>
          <EmptyState icon={GitBranch} title="No approval workflows" text="Requisitions cannot be submitted until at least one workflow exists." action={canManage && <Button size="sm" onClick={() => setEditing(blank())}><Plus size={14} /> Create workflow</Button>} />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ref.data.workflows.map((w: any) => (
            <Panel
              key={w.id}
              title={<span className="flex items-center gap-2">{w.name} {!w.active && <Badge>Inactive</Badge>}</span>}
              subtitle={`${DOCUMENT_TYPES[w.document_type] || w.document_type} · ${money(w.min_amount)} – ${w.max_amount ? money(w.max_amount) : "no limit"} · priority ${w.priority}`}
              action={
                canManage && (
                  <div className="flex gap-1">
                    <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${w.name}`} onClick={() => setEditing({ ...blank(), ...w, steps: w.steps || [] })}><Pencil size={14} /></Button>
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600" aria-label={`Delete ${w.name}`} onClick={() => setToDelete(w)}><Trash2 size={14} /></Button>
                  </div>
                )
              }
            >
              <ol className="space-y-1.5">
                {(w.steps || []).map((s: ApprovalStep, i: number) => (
                  <li key={i} className="flex items-start gap-2 text-[13px]">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-medium text-slate-800">{s.name}</span>
                      <span className="block text-[12.5px] text-slate-500">{describe(s)}{s.fallback_role ? `, else ${nameOf(ref.data?.roles, s.fallback_role)}` : ""}</span>
                      {conditionOf(s, w.document_type) && <Badge tone="warning" className="mt-1 whitespace-normal">only {conditionOf(s, w.document_type)}</Badge>}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-3 flex flex-wrap gap-1.5">
                {w.departments?.length ? w.departments.map((id: string) => <Badge key={id} tone="info">{nameOf(ref.data?.departments, id)}</Badge>) : <Badge>All departments</Badge>}
                {w.categories?.length ? w.categories.map((id: string) => <Badge key={id} tone="violet">{nameOf(ref.data?.categories, id)}</Badge>) : <Badge>All categories</Badge>}
                {(w.funding_sources || []).map((id: string) => <Badge key={id} tone="success">{nameOf(ref.data?.funding, id)}</Badge>)}
                {w.overdue_hours > 0 && <Badge>Escalates after {w.overdue_hours} h</Badge>}
                {w.allow_self_approval && <Badge tone="warning">Self-approval allowed</Badge>}
              </div>
            </Panel>
          ))}
        </div>
      )}

      {editing && ref.data && (
        <WorkflowEditor
          value={editing}
          reference={ref.data}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            queryClient.invalidateQueries(["workflow-reference"]);
          }}
        />
      )}

      <Dialog open={Boolean(toDelete)} onOpenChange={(o) => !o && setToDelete(null)}>
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle>Delete “{toDelete?.name}”?</DialogTitle>
            <DialogDescription>Approvals already running keep their route. New submissions in this range will need another workflow.</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setToDelete(null)}>Cancel</Button>
            <Button variant="danger" disabled={remove.isLoading} onClick={() => remove.mutate(toDelete.id)}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RouteTester({ reference }: { reference?: any }) {
  const [amount, setAmount] = React.useState("750000");
  const [department, setDepartment] = React.useState("");
  const [category, setCategory] = React.useState("");
  const [documentType, setDocumentType] = React.useState("purchase_requisition");
  const [funding, setFunding] = React.useState("");
  const test = useMutation(() => procurementApi.preview({ document_type: documentType, amount: Number(amount) || 0, department: department || undefined, category, funding_source: funding }));
  return (
    <Panel title="Test a route" subtitle="See which workflow and which people would approve a request">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-6 sm:items-end">
        <label className="block text-[12.5px] font-medium text-slate-700">
          Document
          <select className={cn(inputCls, "mt-1")} value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {Object.entries(DOCUMENT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
        <label className="block text-[12.5px] font-medium text-slate-700">
          Amount (RWF)
          <input type="number" min={0} className={cn(inputCls, "mt-1")} value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label className="block text-[12.5px] font-medium text-slate-700">
          Department
          <select className={cn(inputCls, "mt-1")} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">My department</option>
            {reference?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="block text-[12.5px] font-medium text-slate-700">
          Category
          <select className={cn(inputCls, "mt-1")} value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Any</option>
            {reference?.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <label className="block text-[12.5px] font-medium text-slate-700">
          Funding source
          <select className={cn(inputCls, "mt-1")} value={funding} onChange={(e) => setFunding(e.target.value)}>
            <option value="">Any</option>
            {reference?.funding?.map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" onClick={() => test.mutate()} disabled={test.isLoading}><Play size={14} /> Test route</Button>
      </div>
      {test.data && (
        <div className="mt-4 rounded-md bg-slate-50 px-3 py-2.5 text-[13px]">
          {!test.data.workflow ? (
            <p className="text-red-700">No workflow matches — a requisition like this could not be submitted.</p>
          ) : (
            <>
              <p className="mb-1.5 text-slate-600">Workflow <span className="font-semibold text-slate-900">{test.data.workflow.name}</span>:</p>
              <ol className="list-decimal space-y-0.5 pl-5">
                {test.data.steps.map((s, i) => (
                  <li key={i} className={cn(s.applies === false && "text-slate-400")}>
                    <span className="font-medium">{s.name}</span> — {s.rule}
                    {s.condition && <span className="text-amber-700"> (only {s.condition})</span>}:{" "}
                    {s.applies === false ? (
                      <span className="italic">skipped for this amount</span>
                    ) : (
                      <span className={s.approvers.length ? "text-slate-700" : "font-medium text-red-700"}>{s.approvers.length ? s.approvers.join(", ") : "nobody eligible"}</span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </Panel>
  );
}

function MultiPick({ label, options, value, onChange, emptyLabel }: { label: string; options: any[]; value: string[]; onChange: (v: string[]) => void; emptyLabel: string }) {
  return (
    <fieldset>
      <legend className="mb-1 text-[12.5px] font-medium text-slate-700">{label}</legend>
      <p className="mb-1.5 text-[11.5px] text-slate-500">{value.length ? `${value.length} selected` : emptyLabel}</p>
      <div className="flex max-h-28 flex-wrap gap-1.5 overflow-y-auto">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
              className={cn("rounded-full border px-2.5 py-1 text-[12px]", on ? "border-primary bg-primary/10 text-primaryDark" : "border-slate-200 text-slate-600 hover:bg-slate-50")}
            >
              {o.name}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function WorkflowEditor({ value, reference, onClose, onSaved }: { value: ReturnType<typeof blank>; reference: any; onClose: () => void; onSaved: () => void }) {
  const [w, setW] = React.useState(value);
  const set = (patch: Partial<typeof w>) => setW((x) => ({ ...x, ...patch }));
  const setStep = (i: number, patch: Partial<ApprovalStep>) => set({ steps: w.steps.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });
  const move = (i: number, d: number) => {
    const steps = [...w.steps];
    [steps[i], steps[i + d]] = [steps[i + d], steps[i]];
    set({ steps });
  };

  const save = useMutation(
    () => {
      const problems: string[] = [];
      if (!w.name.trim()) problems.push("a name");
      if (!w.steps.length) problems.push("at least one step");
      w.steps.forEach((s, i) => {
        if (!s.name?.trim()) problems.push(`a name for step ${i + 1}`);
        if (s.approver_type === "role" && !s.role) problems.push(`a role for step ${i + 1}`);
        if (s.approver_type === "user" && !s.user) problems.push(`a person for step ${i + 1}`);
      });
      if (w.max_amount && Number(w.max_amount) < Number(w.min_amount)) problems.push("a maximum amount above the minimum");
      if (problems.length) throw new Error(`Please provide ${problems.join(", ")}.`);
      const body = {
        name: w.name.trim(), description: w.description, document_type: w.document_type, active: w.active, priority: Number(w.priority) || 0,
        min_amount: Number(w.min_amount) || 0, max_amount: Number(w.max_amount) || 0, departments: w.departments, categories: w.categories,
        branches: w.branches, funding_sources: w.funding_sources || [], overdue_hours: Number(w.overdue_hours) || 0, allow_self_approval: w.allow_self_approval,
        steps: w.steps.map(({ rule, condition, ...s }) => ({
          ...s, role: s.approver_type === "role" ? s.role : undefined, user: s.approver_type === "user" ? s.user : undefined,
          min_amount: Number(s.min_amount) || 0, max_amount: Number(s.max_amount) || 0, above_limit_of: s.above_limit_of || undefined, skip_if_already_approved: !!s.skip_if_already_approved,
        })),
      };
      return w.id ? pocketbase.collection("approval_workflows").update(w.id, body) : pocketbase.collection("approval_workflows").create(body);
    },
    {
      onSuccess: () => {
        toast.success("Workflow saved");
        onSaved();
      },
      onError: (e) => {
      toast.error(errorMessage(e));
    },
    }
  );

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>{w.id ? `Edit “${value.name}”` : "New approval workflow"}</DialogTitle>
          <DialogDescription>Changes apply to documents submitted from now on. Running approvals keep their route.</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">
            Name *
            <input className={cn(inputCls, "mt-1")} value={w.name} onChange={(e) => set({ name: e.target.value })} />
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700 sm:col-span-2">
            Applies to *
            <select className={cn(inputCls, "mt-1")} value={w.document_type} onChange={(e) => set({ document_type: e.target.value })}>
              {Object.entries(DOCUMENT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Minimum amount (RWF)
            <input type="number" min={0} className={cn(inputCls, "mt-1")} value={w.min_amount} onChange={(e) => set({ min_amount: Number(e.target.value) })} />
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Maximum amount (RWF) — 0 for no limit
            <input type="number" min={0} className={cn(inputCls, "mt-1")} value={w.max_amount} onChange={(e) => set({ max_amount: Number(e.target.value) })} />
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Priority (higher wins when several match)
            <input type="number" className={cn(inputCls, "mt-1")} value={w.priority} onChange={(e) => set({ priority: Number(e.target.value) })} />
          </label>
          <div className="flex flex-col justify-end gap-2 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={w.active} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={w.allow_self_approval} onChange={(e) => set({ allow_self_approval: e.target.checked })} /> Allow requesters to approve their own requests (not recommended)</label>
          </div>
          <label className="block text-[12.5px] font-medium text-slate-700">
            Escalate when overdue (hours, 0 = default 48)
            <input type="number" min={0} className={cn(inputCls, "mt-1")} value={w.overdue_hours} onChange={(e) => set({ overdue_hours: Number(e.target.value) })} />
          </label>
          <div className="sm:col-span-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MultiPick label="Only for departments" options={reference.departments} value={w.departments} onChange={(v) => set({ departments: v })} emptyLabel="All departments" />
            <MultiPick label="Only for categories" options={reference.categories} value={w.categories} onChange={(v) => set({ categories: v })} emptyLabel="All categories" />
            <MultiPick label="Only for funding sources" options={(reference.funding || []).map((f: any) => ({ id: f.id, name: f.code }))} value={w.funding_sources || []} onChange={(v) => set({ funding_sources: v })} emptyLabel="All funding sources" />
          </div>
        </div>

        <div className="mt-2">
          <p className="mb-2 text-[13px] font-semibold text-slate-900">Approval steps (in order)</p>
          <ol className="space-y-2">
            {w.steps.map((s, i) => (
              <li key={i} className="rounded-md border border-slate-200 p-3">
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[auto_1fr_1fr_1fr_auto] sm:items-end">
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ralga-navy text-[12px] font-semibold text-white">{i + 1}</span>
                  <label className="block text-[12px] text-slate-600">
                    Step name
                    <input className={cn(inputCls, "mt-0.5")} value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} />
                  </label>
                  <label className="block text-[12px] text-slate-600">
                    Approver
                    <select className={cn(inputCls, "mt-0.5")} value={s.approver_type} onChange={(e) => setStep(i, { approver_type: e.target.value as any })}>
                      {APPROVER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </label>
                  {s.approver_type === "role" ? (
                    <label className="block text-[12px] text-slate-600">
                      Role
                      <select className={cn(inputCls, "mt-0.5")} value={s.role || ""} onChange={(e) => setStep(i, { role: e.target.value })}>
                        <option value="">Select…</option>
                        {reference.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </label>
                  ) : s.approver_type === "user" ? (
                    <label className="block text-[12px] text-slate-600">
                      Person
                      <select className={cn(inputCls, "mt-0.5")} value={s.user || ""} onChange={(e) => setStep(i, { user: e.target.value })}>
                        <option value="">Select…</option>
                        {reference.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                      </select>
                    </label>
                  ) : (
                    <label className="block text-[12px] text-slate-600">
                      If unavailable, use role
                      <select className={cn(inputCls, "mt-0.5")} value={s.fallback_role || ""} onChange={(e) => setStep(i, { fallback_role: e.target.value || undefined })}>
                        <option value="">Block submission</option>
                        {reference.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </label>
                  )}
                  <div className="flex gap-1">
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move step up"><ArrowUp size={14} /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8" disabled={i === w.steps.length - 1} onClick={() => move(i, 1)} aria-label="Move step down"><ArrowDown size={14} /></Button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 text-red-600" onClick={() => set({ steps: w.steps.filter((_, idx) => idx !== i) })} aria-label="Remove step"><Trash2 size={14} /></Button>
                  </div>
                </div>
                {s.approver_type === "role" && (
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <label className="flex items-center gap-2 text-[12.5px] text-slate-600">
                      <input type="checkbox" checked={!!s.same_department} onChange={(e) => setStep(i, { same_department: e.target.checked })} />
                      Only people with this role in the requester's department
                    </label>
                    <label className="block text-[12px] text-slate-600">
                      If nobody is eligible, use role
                      <select className={cn(inputCls, "mt-0.5")} value={s.fallback_role || ""} onChange={(e) => setStep(i, { fallback_role: e.target.value || undefined })}>
                        <option value="">Block submission</option>
                        {reference.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </label>
                  </div>
                )}
                <details className="mt-2 rounded-md bg-slate-50 px-2.5 py-2" open={Boolean(s.min_amount || s.max_amount || s.above_limit_of || s.skip_if_already_approved)}>
                  <summary className="cursor-pointer text-[12px] font-medium text-slate-600">Conditions — when does this step apply?</summary>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="block text-[12px] text-slate-600">
                      From amount (RWF)
                      <input type="number" min={0} className={cn(inputCls, "mt-0.5")} value={s.min_amount || ""} onChange={(e) => setStep(i, { min_amount: Number(e.target.value) || 0 })} />
                    </label>
                    <label className="block text-[12px] text-slate-600">
                      Up to amount (RWF)
                      <input type="number" min={0} className={cn(inputCls, "mt-0.5")} value={s.max_amount || ""} onChange={(e) => setStep(i, { max_amount: Number(e.target.value) || 0 })} />
                    </label>
                    <label className="block text-[12px] text-slate-600">
                      Only above the approval limit of
                      <select className={cn(inputCls, "mt-0.5")} value={s.above_limit_of || ""} onChange={(e) => setStep(i, { above_limit_of: e.target.value || undefined })}>
                        <option value="">Always applies</option>
                        {reference.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </label>
                    <label className="flex items-center gap-2 text-[12.5px] text-slate-600 sm:col-span-3">
                      <input type="checkbox" checked={!!s.skip_if_already_approved} onChange={(e) => setStep(i, { skip_if_already_approved: e.target.checked })} />
                      Skip this step when everyone who may decide it already approved at an earlier step (nobody approves twice)
                    </label>
                  </div>
                </details>
              </li>
            ))}
          </ol>
          <Button type="button" variant="outline" size="sm" className="mt-2" onClick={() => set({ steps: [...w.steps, { name: `Step ${w.steps.length + 1}`, approver_type: "role" }] })}>
            <Plus size={14} /> Add step
          </Button>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => save.mutate()} disabled={save.isLoading}>{save.isLoading ? "Saving…" : "Save workflow"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
