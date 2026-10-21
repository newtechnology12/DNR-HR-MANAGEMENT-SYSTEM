import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, ArrowDown, ArrowUp, GitBranch, Pencil, Play, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { cn } from "@/utils";
import { ListSkeleton } from "@/components/enterprise/ui";
import { Button, Card, CardHeader, ConfirmDialog, EmptyState, Field, Input, Modal, MoneyInput, Page, PageHeader, Pill, Select, StatusPill, fmtMoney, sentence } from "@/components/ims";
import { APPROVER_TYPES, ApprovalStep, errorMessage, procurementApi } from "@/lib/procurement";

const DOCUMENT_TYPES: Record<string, string> = {
  purchase_requisition: "Purchase requisitions",
  purchase_order: "Purchase orders",
  supplier_invoice: "Supplier invoices (vendor bills)",
  payroll: "Payroll",
  supplier: "Supplier registrations",
  supplier_bank_change: "Supplier bank details changes",
  purchase_return: "Purchase returns",
  contract: "Contracts",
  procurement_plan: "Procurement plans",
  budget: "Budgets",
  budget_revision: "Budget revisions",
  payment_voucher: "Payment vouchers",
  journal_entry: "Journal entries",
  asset_disposal: "Asset disposals",
  bank_reconciliation: "Bank reconciliations",
  cash_receipt: "Receipts (bank and cash)",
  bank_transfer: "Transfers between accounts",
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

const checkboxCls = "h-4 w-4 shrink-0 rounded border-ims-field accent-ims-primary";

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
      toast.success(`Workflow “${toDelete?.name}” deleted`);
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
      : `${nameOf(ref.data?.roles, s.role)}${s.same_department ? " (same department)" : ""}`;

  const headsMissing = (ref.data?.departments || []).filter((d: any) => !d.head);
  const conditionOf = (s: ApprovalStep, documentType: string) => {
    const parts: string[] = [];
    if (s.min_amount) parts.push(`from ${fmtMoney(s.min_amount)}`);
    if (s.max_amount) parts.push(`up to ${fmtMoney(s.max_amount)}`);
    if (s.above_limit_of) {
      const limit = (ref.data?.limits || []).find((l: any) => l.role === s.above_limit_of && (l.document_type === documentType || !l.document_type));
      parts.push(`above the ${nameOf(ref.data?.roles, s.above_limit_of)} limit${limit ? ` (${limit.max_amount ? fmtMoney(limit.max_amount) : "no limit"})` : ""}`);
    }
    return parts.join(", ");
  };

  const body = (
    <>
      {headsMissing.length > 0 && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>
            {headsMissing.length === 1 ? "1 department has" : `${headsMissing.length} departments have`} no head ({headsMissing.map((d: any) => d.name).join(", ")}). “Department head” steps use their fallback role, or block submission.
          </span>
        </p>
      )}

      <RouteTester reference={ref.data} />

      {ref.isLoading ? (
        <Card><ListSkeleton rows={4} /></Card>
      ) : !ref.data?.workflows.length ? (
        <Card>
          <EmptyState
            icon={GitBranch}
            text="No approval workflows yet. Requisitions cannot be submitted until one exists."
            action={canManage && <Button variant="primary" icon={Plus} onClick={() => setEditing(blank())}>New workflow</Button>}
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {ref.data.workflows.map((w: any) => (
            <Card key={w.id}>
              <CardHeader
                title={<span className="flex flex-wrap items-center gap-2">{w.name} {!w.active && <StatusPill status="Inactive" />}</span>}
                subtitle={`${DOCUMENT_TYPES[w.document_type] || sentence(w.document_type)} · ${fmtMoney(w.min_amount)} to ${w.max_amount ? fmtMoney(w.max_amount) : "no limit"} · priority ${w.priority}`}
                action={
                  canManage && (
                    <div className="flex gap-1">
                      <Button size="icon-sm" variant="ghost" icon={Pencil} aria-label={`Edit ${w.name}`} onClick={() => setEditing({ ...blank(), ...w, steps: w.steps || [] })} />
                      <Button size="icon-sm" variant="ghost" icon={Trash2} aria-label={`Delete ${w.name}`} className="text-ims-danger hover:bg-ims-danger-bg hover:text-ims-danger" onClick={() => setToDelete(w)} />
                    </div>
                  )
                }
              />
              <ol className="space-y-2.5">
                {(w.steps || []).map((s: ApprovalStep, i: number) => (
                  <li key={i} className="flex items-start gap-2.5 text-t-body">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-ims-subtle text-t-small font-bold text-ims-body">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ims-text">{s.name}</span>
                      <span className="block text-t-small text-ims-muted">{describe(s)}{s.fallback_role ? `, otherwise ${nameOf(ref.data?.roles, s.fallback_role)}` : ""}</span>
                      {conditionOf(s, w.document_type) && <span className="mt-0.5 block text-t-small text-ims-warning">Only {conditionOf(s, w.document_type)}</span>}
                    </span>
                  </li>
                ))}
              </ol>
              <div className="mt-4 flex flex-wrap gap-1.5 border-t border-ims-divider pt-3">
                {w.departments?.length ? w.departments.map((id: string) => <Pill key={id} tone="info">{nameOf(ref.data?.departments, id)}</Pill>) : <Pill>All departments</Pill>}
                {w.categories?.length ? w.categories.map((id: string) => <Pill key={id}>{nameOf(ref.data?.categories, id)}</Pill>) : <Pill>All categories</Pill>}
                {(w.funding_sources || []).map((id: string) => <Pill key={id}>{nameOf(ref.data?.funding, id)}</Pill>)}
                {w.overdue_hours > 0 && <Pill>Escalates after {w.overdue_hours} hours</Pill>}
                {w.allow_self_approval && <Pill tone="warning">Self-approval allowed</Pill>}
              </div>
            </Card>
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

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => setToDelete(null)}
        title={`Delete “${toDelete?.name || ""}”?`}
        description="Approvals already running keep their route. New submissions in this range will need another workflow."
        confirmLabel="Delete"
        danger
        onConfirm={() => remove.mutateAsync(toDelete.id)}
      />
    </>
  );

  if (embedded) return <div className="flex flex-col gap-4 p-4">{body}</div>;
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Approval workflows" }]}
        title="Approval workflows"
        subtitle="Who approves what. The most specific active workflow for the amount, department and category is used."
        primary={canManage ? { label: "New workflow", icon: Plus, onClick: () => setEditing(blank()) } : undefined}
      />
      {body}
    </Page>
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
    <Card>
      <CardHeader title="Test a route" subtitle="See which workflow, and which people, would approve a request." />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 xl:items-end">
        <Field label="Document" htmlFor="rt-doc">
          <Select id="rt-doc" value={documentType} onChange={(e) => setDocumentType(e.target.value)}>
            {Object.entries(DOCUMENT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Amount" htmlFor="rt-amount">
          <MoneyInput id="rt-amount" value={amount === "" ? "" : Number(amount)} onChange={(v) => setAmount(String(v))} />
        </Field>
        <Field label="Department" htmlFor="rt-dep">
          <Select id="rt-dep" value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">My department</option>
            {reference?.departments.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
        <Field label="Category" htmlFor="rt-cat">
          <Select id="rt-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">Any</option>
            {reference?.categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Funding source" htmlFor="rt-fund">
          <Select id="rt-fund" value={funding} onChange={(e) => setFunding(e.target.value)}>
            <option value="">Any</option>
            {reference?.funding?.map((c: any) => <option key={c.id} value={c.id}>{c.code}</option>)}
          </Select>
        </Field>
        <Button icon={Play} onClick={() => test.mutate()} loading={test.isLoading} className="h-control">Test route</Button>
      </div>
      {test.data && (
        <div className="mt-4 rounded-control bg-ims-subtle px-4 py-3 text-t-body" role="status">
          {!test.data.workflow ? (
            <p className="text-ims-danger">No workflow matches, so a request like this could not be submitted.</p>
          ) : (
            <>
              <p className="mb-1.5 text-ims-body">Workflow <span className="font-semibold text-ims-text">{test.data.workflow.name}</span>:</p>
              <ol className="list-decimal space-y-1 pl-5">
                {test.data.steps.map((s, i) => (
                  <li key={i} className={cn(s.applies === false && "text-ims-faint")}>
                    <span className="font-semibold">{s.name}</span> · {s.rule}
                    {s.condition && <span className="text-ims-warning"> (only {s.condition})</span>}:{" "}
                    {s.applies === false ? (
                      <span>skipped for this amount</span>
                    ) : (
                      <span className={s.approvers.length ? "text-ims-body" : "font-semibold text-ims-danger"}>{s.approvers.length ? s.approvers.join(", ") : "no one can approve this step"}</span>
                    )}
                  </li>
                ))}
              </ol>
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function MultiPick({ label, options, value, onChange, emptyLabel }: { label: string; options: any[]; value: string[]; onChange: (v: string[]) => void; emptyLabel: string }) {
  return (
    <fieldset className="min-w-0">
      <legend className="mb-0.5 text-t-label text-ims-text">{label}</legend>
      <p className="mb-2 text-t-hint text-ims-muted">{value.length ? `${value.length} chosen` : emptyLabel}</p>
      <div className="flex max-h-32 flex-wrap gap-1.5 overflow-y-auto">
        {options.map((o) => {
          const on = value.includes(o.id);
          return (
            <button
              key={o.id}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o.id) : [...value, o.id])}
              className={cn("min-h-[32px] rounded-pill border px-3 text-t-small font-semibold", on ? "border-ims-link bg-ims-info-bg text-ims-info" : "border-ims-field text-ims-body hover:bg-ims-hover")}
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
      if (problems.length) throw new Error(`Add ${problems.join(", ")}.`);
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
        toast.success(`Workflow “${w.name.trim()}” saved`);
        onSaved();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={w.id ? `Edit “${value.name}”` : "New approval workflow"}
      description="Changes apply to documents submitted from now on. Running approvals keep their route."
      footer={
        <>
          <Button onClick={onClose} disabled={save.isLoading}>Cancel</Button>
          <Button variant="primary" onClick={() => save.mutate()} loading={save.isLoading}>Save workflow</Button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Name" required htmlFor="wf-name" className="sm:col-span-2">
          <Input id="wf-name" value={w.name} onChange={(e) => set({ name: e.target.value })} />
        </Field>
        <Field label="Applies to" required htmlFor="wf-doc" className="sm:col-span-2">
          <Select id="wf-doc" value={w.document_type} onChange={(e) => set({ document_type: e.target.value })}>
            {Object.entries(DOCUMENT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Minimum amount" htmlFor="wf-min">
          <MoneyInput id="wf-min" value={w.min_amount} onChange={(v) => set({ min_amount: Number(v) || 0 })} />
        </Field>
        <Field label="Maximum amount" htmlFor="wf-max" hint="0 means no limit.">
          <MoneyInput id="wf-max" value={w.max_amount} onChange={(v) => set({ max_amount: Number(v) || 0 })} />
        </Field>
        <Field label="Priority" htmlFor="wf-priority" hint="When several workflows match, the higher number wins.">
          <Input id="wf-priority" type="number" value={w.priority} onChange={(e) => set({ priority: Number(e.target.value) })} />
        </Field>
        <Field label="Escalate when overdue (hours)" htmlFor="wf-overdue" hint="0 uses the default of 48 hours.">
          <Input id="wf-overdue" type="number" min={0} value={w.overdue_hours} onChange={(e) => set({ overdue_hours: Number(e.target.value) })} />
        </Field>
        <div className="space-y-2 text-t-body text-ims-text sm:col-span-2">
          <label className="flex items-center gap-2"><input type="checkbox" className={checkboxCls} checked={w.active} onChange={(e) => set({ active: e.target.checked })} /> Active</label>
          <label className="flex items-center gap-2"><input type="checkbox" className={checkboxCls} checked={w.allow_self_approval} onChange={(e) => set({ allow_self_approval: e.target.checked })} /> Let requesters approve their own requests (not recommended)</label>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:col-span-2 sm:grid-cols-3">
          <MultiPick label="Only for departments" options={reference.departments} value={w.departments} onChange={(v) => set({ departments: v })} emptyLabel="All departments" />
          <MultiPick label="Only for categories" options={reference.categories} value={w.categories} onChange={(v) => set({ categories: v })} emptyLabel="All categories" />
          <MultiPick label="Only for funding sources" options={(reference.funding || []).map((f: any) => ({ id: f.id, name: f.code }))} value={w.funding_sources || []} onChange={(v) => set({ funding_sources: v })} emptyLabel="All funding sources" />
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-t-section text-ims-text">Approval steps, in order</h3>
        <ol className="space-y-3">
          {w.steps.map((s, i) => (
            <li key={i} className="rounded-control border border-ims-border p-3.5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-[28px_1fr_1fr_1fr_auto] sm:items-end">
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-ims-primary text-t-small font-bold text-white sm:mb-2">{i + 1}</span>
                <Field label="Step name" htmlFor={`wf-step-${i}-name`}>
                  <Input id={`wf-step-${i}-name`} value={s.name} onChange={(e) => setStep(i, { name: e.target.value })} />
                </Field>
                <Field label="Approver" htmlFor={`wf-step-${i}-type`}>
                  <Select id={`wf-step-${i}-type`} value={s.approver_type} onChange={(e) => setStep(i, { approver_type: e.target.value as any })}>
                    {APPROVER_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </Select>
                </Field>
                {s.approver_type === "role" ? (
                  <Field label="Role" htmlFor={`wf-step-${i}-role`}>
                    <Select id={`wf-step-${i}-role`} value={s.role || ""} onChange={(e) => setStep(i, { role: e.target.value })}>
                      <option value="">Choose a role</option>
                      {reference.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                ) : s.approver_type === "user" ? (
                  <Field label="Person" htmlFor={`wf-step-${i}-user`}>
                    <Select id={`wf-step-${i}-user`} value={s.user || ""} onChange={(e) => setStep(i, { user: e.target.value })}>
                      <option value="">Choose a person</option>
                      {reference.users.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                    </Select>
                  </Field>
                ) : (
                  <Field label="If unavailable, use role" htmlFor={`wf-step-${i}-fallback`}>
                    <Select id={`wf-step-${i}-fallback`} value={s.fallback_role || ""} onChange={(e) => setStep(i, { fallback_role: e.target.value || undefined })}>
                      <option value="">Block submission</option>
                      {reference.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                )}
                <div className="flex gap-1 sm:mb-0.5">
                  <Button size="icon-sm" variant="ghost" icon={ArrowUp} disabled={i === 0} onClick={() => move(i, -1)} aria-label={`Move step ${i + 1} up`} />
                  <Button size="icon-sm" variant="ghost" icon={ArrowDown} disabled={i === w.steps.length - 1} onClick={() => move(i, 1)} aria-label={`Move step ${i + 1} down`} />
                  <Button size="icon-sm" variant="ghost" icon={Trash2} className="text-ims-danger hover:bg-ims-danger-bg hover:text-ims-danger" onClick={() => set({ steps: w.steps.filter((_, idx) => idx !== i) })} aria-label={`Remove step ${i + 1}`} />
                </div>
              </div>
              {s.approver_type === "role" && (
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 sm:items-end">
                  <label className="flex items-center gap-2 text-t-body text-ims-body sm:pb-2.5">
                    <input type="checkbox" className={checkboxCls} checked={!!s.same_department} onChange={(e) => setStep(i, { same_department: e.target.checked })} />
                    Only people with this role in the requester's department
                  </label>
                  <Field label="If no one can approve, use role" htmlFor={`wf-step-${i}-fallback2`}>
                    <Select id={`wf-step-${i}-fallback2`} value={s.fallback_role || ""} onChange={(e) => setStep(i, { fallback_role: e.target.value || undefined })}>
                      <option value="">Block submission</option>
                      {reference.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                </div>
              )}
              <details className="mt-3 rounded-control bg-ims-subtle px-3 py-2.5" open={Boolean(s.min_amount || s.max_amount || s.above_limit_of || s.skip_if_already_approved)}>
                <summary className="cursor-pointer text-t-small font-semibold text-ims-body">Conditions: when does this step apply?</summary>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="From amount" htmlFor={`wf-step-${i}-min`}>
                    <MoneyInput id={`wf-step-${i}-min`} value={s.min_amount || ""} onChange={(v) => setStep(i, { min_amount: Number(v) || 0 })} />
                  </Field>
                  <Field label="Up to amount" htmlFor={`wf-step-${i}-max`}>
                    <MoneyInput id={`wf-step-${i}-max`} value={s.max_amount || ""} onChange={(v) => setStep(i, { max_amount: Number(v) || 0 })} />
                  </Field>
                  <Field label="Only above the approval limit of" htmlFor={`wf-step-${i}-above`}>
                    <Select id={`wf-step-${i}-above`} value={s.above_limit_of || ""} onChange={(e) => setStep(i, { above_limit_of: e.target.value || undefined })}>
                      <option value="">Always applies</option>
                      {reference.roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                  <label className="flex items-center gap-2 text-t-body text-ims-body sm:col-span-3">
                    <input type="checkbox" className={checkboxCls} checked={!!s.skip_if_already_approved} onChange={(e) => setStep(i, { skip_if_already_approved: e.target.checked })} />
                    Skip this step when everyone who may decide it already approved at an earlier step (no one approves twice)
                  </label>
                </div>
              </details>
            </li>
          ))}
        </ol>
        <Button icon={Plus} className="mt-3" onClick={() => set({ steps: [...w.steps, { name: `Step ${w.steps.length + 1}`, approver_type: "role" }] })}>
          Add step
        </Button>
      </div>
    </Modal>
  );
}
