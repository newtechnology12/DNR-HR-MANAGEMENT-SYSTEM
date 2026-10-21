import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import { CornerUpLeft, FileText, Plus, RotateCcw, Trash2, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { BudgetLinePicker } from "@/components/budget/BudgetKit";
import { FileDrop } from "@/components/portal/kit";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  DatePicker,
  Details,
  EmptyState,
  ErrorSummary,
  Field,
  FormActions,
  FormBody,
  FormError,
  FormSection,
  Input,
  MoneyInput,
  Page,
  PageHeader,
  Select,
  SummaryPanel,
  Textarea,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
  useAutosave,
} from "@/components/ims";
import { PRIORITY, REQUEST_TYPES, RequisitionItem, errorMessage, lineTotals, procurementApi } from "@/lib/procurement";

const EMPTY_ITEM: RequisitionItem = { description: "", specification: "", quantity: 1, unit: "Each", unit_cost: 0, tax_rate: 18 };
const LIST = "/dashboard/procurement/requisitions";

type FormState = {
  title: string;
  request_type: string;
  category: string;
  priority: string;
  required_date: string;
  delivery_location: string;
  cost_center: string;
  project: string;
  action_plan: string;
  plan_line: string;
  budget_line: string;
  preferred_supplier: string;
  justification: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  title: "",
  request_type: "goods",
  category: "",
  priority: "medium",
  required_date: "",
  delivery_location: "",
  cost_center: "",
  project: "",
  action_plan: "",
  plan_line: "",
  budget_line: "",
  preferred_supplier: "",
  justification: "",
  notes: "",
};

const hasContent = (d?: { form: FormState; items: RequisitionItem[] } | null) =>
  Boolean(d && (d.form.title.trim() || d.form.justification.trim() || d.items.some((it) => it.description.trim())));

/** What must be filled before the requisition can go for approval; the server checks again. */
function check(form: FormState, items: RequisitionItem[]): FormError[] {
  const errors: FormError[] = [];
  if (!form.title.trim()) errors.push({ field: "title", message: "Enter a title, for example “Laptops for new audit staff”." });
  if (!form.category) errors.push({ field: "category", message: "Choose the purchase category." });
  if (!form.required_date) errors.push({ field: "required_date", message: "Choose the date you need it by." });
  if (!form.budget_line) errors.push({ field: "budget_line", message: "Choose the budget line that pays for it." });
  const lines = items.filter((it) => it.description.trim());
  if (!lines.length) errors.push({ field: "item-0-description", message: "Add at least one item with a description." });
  lines.forEach((it) => {
    const i = items.indexOf(it);
    if (!(Number(it.quantity) > 0)) errors.push({ field: `item-${i}-quantity`, message: `Line ${i + 1}: enter a quantity above 0.` });
    if (!(Number(it.unit_cost) > 0)) errors.push({ field: `item-${i}-unit_cost`, message: `Line ${i + 1}: enter the estimated unit cost.` });
  });
  if (!form.justification.trim()) errors.push({ field: "justification", message: "Say why this is needed." });
  return errors;
}

export default function RequisitionForm() {
  const { requisitionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const me = pocketbase.authStore.model as any;

  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [items, setItems] = React.useState<RequisitionItem[]>([{ ...EMPTY_ITEM }]);
  const [newFiles, setNewFiles] = React.useState<File[]>([]);
  const [removedFiles, setRemovedFiles] = React.useState<string[]>([]);
  const [serverError, setServerError] = React.useState<string>();
  const [triedSubmit, setTriedSubmit] = React.useState(false);
  const [offer, setOffer] = React.useState<{ form: FormState; items: RequisitionItem[] } | null>(null);

  const existing = useQuery(
    ["purchase_requisition", requisitionId],
    () => pocketbase.collection("purchase_requisitions").getOne(requisitionId!),
    { enabled: Boolean(requisitionId) }
  );

  React.useEffect(() => {
    const r: any = existing.data;
    if (!r) return;
    setForm({
      title: r.title || "",
      request_type: r.request_type || "goods",
      category: r.category || "",
      priority: r.priority || "medium",
      required_date: r.required_date ? r.required_date.slice(0, 10) : "",
      delivery_location: r.delivery_location || "",
      cost_center: r.cost_center || "",
      project: r.project || "",
      action_plan: r.action_plan || "",
      plan_line: r.plan_line || "",
      budget_line: r.budget_line || "",
      preferred_supplier: r.preferred_supplier || "",
      justification: r.justification || "",
      notes: r.notes || "",
    });
    setItems(r.items?.length ? r.items : [{ ...EMPTY_ITEM }]);
  }, [existing.data]);

  // New requisitions are kept in this browser while you type, so a closed tab does not lose the work.
  const draft = { form, items };
  const autosave = useAutosave(requisitionId ? null : "purchase-requisition.new", draft, !offer && hasContent(draft));
  React.useEffect(() => {
    if (requisitionId) return;
    const saved = autosave.restore();
    if (hasContent(saved)) setOffer(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const reference = useQuery(["procurement-reference"], async () => {
    const [categories, units, plans] = await Promise.all([
      pocketbase.collection("procurement_categories").getFullList({ filter: "active = true", sort: "name" }),
      pocketbase.collection("units_of_measure").getFullList({ filter: "active = true", sort: "name" }),
      pocketbase.collection("actionPlans").getList(1, 100, { sort: "-created", fields: "id,title" }).then((r) => r.items).catch(() => []),
    ]);
    return { categories, units, plans };
  });

  const planLines = useQuery(
    ["req-plan-lines", me?.department],
    () =>
      pocketbase.collection("procurement_plan_lines").getFullList({
        filter: `plan.status = "approved" && plan.department = "${me?.department}" && status != "cancelled"`,
        sort: "planned_month,sort",
        expand: "plan",
      }),
    { enabled: Boolean(me?.department) }
  );
  function pickPlanLine(id: string) {
    const l: any = planLines.data?.find((x: any) => x.id === id);
    setForm((f) => ({
      ...f,
      plan_line: id,
      ...(l && !f.title ? { title: l.description } : {}),
      ...(l && !f.category && l.category ? { category: l.category } : {}),
      ...(l && !f.cost_center && l.cost_center ? { cost_center: l.cost_center } : {}),
      ...(l && !f.project && l.project ? { project: l.project } : {}),
      ...(l && !f.budget_line && l.budget_line ? { budget_line: l.budget_line } : {}),
    }));
  }
  const pickedLine: any = planLines.data?.find((x: any) => x.id === form.plan_line);

  const totals = lineTotals(items);
  const [debouncedTotal] = useDebounce(totals.total, 500);
  const route = useQuery(
    ["approval-preview", debouncedTotal, form.category],
    () => procurementApi.preview({ amount: debouncedTotal, category: form.category, department: me?.department, branch: me?.branch }),
    { enabled: debouncedTotal > 0, keepPreviousData: true }
  );

  const set = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setItem = (i: number, k: keyof RequisitionItem, v: string | number) =>
    setItems((list) => list.map((it, idx) => (idx === i ? { ...it, [k]: ["quantity", "unit_cost", "tax_rate"].includes(k) ? Number(v) : v } : it)));

  const errors = triedSubmit ? check(form, items) : [];
  const errorFor = (field: string) => errors.find((e) => e.field === field)?.message;

  const save = useMutation(async (submit: boolean) => {
    setServerError(undefined);
    const body = new FormData();
    Object.entries(form).forEach(([k, v]) => body.append(k, k === "required_date" && v ? `${v} 00:00:00.000Z` : v));
    body.append(
      "items",
      JSON.stringify(
        items
          .filter((it) => it.description.trim())
          .map(({ description, specification, quantity, unit, unit_cost, tax_rate }) => ({ description, specification, quantity, unit, unit_cost, tax_rate }))
      )
    );
    newFiles.forEach((f) => body.append("attachments", f));
    removedFiles.forEach((f) => body.append("attachments-", f));
    const record = requisitionId
      ? await pocketbase.collection("purchase_requisitions").update(requisitionId, body)
      : await pocketbase.collection("purchase_requisitions").create(body);
    if (submit) {
      try {
        await procurementApi.submit(record.id);
      } catch (e) {
        // Saved but not submitted: go to the draft so the user can fix what the server reported.
        autosave.clear();
        navigate(`${LIST}/${record.id}/edit`, { replace: true });
        throw e;
      }
    }
    return { record, submit };
  }, {
    onSuccess: ({ record, submit }) => {
      autosave.clear();
      queryClient.invalidateQueries(["record-table"]);
      queryClient.invalidateQueries(["purchase_requisition", record.id]);
      toast.success(submit ? `${record.number} submitted for approval` : `${record.number} saved as a draft`);
      navigate(`${LIST}/${record.id}`);
    },
    onError: (e) => {
      const msg = errorMessage(e);
      setServerError(msg);
      toast.error(msg);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const submit = () => {
    setTriedSubmit(true);
    if (check(form, items).length) {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    save.mutate(true);
  };

  const record: any = existing.data;
  const status = record?.status;
  if (requisitionId && existing.isLoading) {
    return (
      <Page narrow>
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (status && !["draft", "returned"].includes(status)) {
    return (
      <Page narrow>
        <Card>
          <EmptyState
            icon={FileText}
            text={`${record.number} is already in approval or closed, so it can no longer be edited.`}
            action={<ButtonLink to={`${LIST}/${requisitionId}`} variant="primary">Open {record.number}</ButtonLink>}
          />
        </Card>
      </Page>
    );
  }

  const keptFiles: string[] = (record?.attachments || []).filter((f: string) => !removedFiles.includes(f));
  const filled = items.filter((i) => i.description.trim());
  const summaryErrors: FormError[] = [...errors, ...(serverError ? [{ message: serverError }] : [])];
  const done = check(form, items).map((e) => e.field);
  const doneIf = (...fields: string[]) => !fields.some((f) => done.some((d) => d === f || d?.startsWith(f)));

  return (
    <Page>
      <PageHeader
        breadcrumbs={[
          { label: "Procurement", to: "/dashboard/procurement" },
          { label: "Purchase requisitions", to: LIST },
          { label: requisitionId ? `Edit ${record?.number || ""}`.trim() : "New requisition" },
        ]}
        title={requisitionId ? `Edit ${record?.number || "requisition"}` : "New purchase requisition"}
        subtitle="Say what you need and why. The approval route is chosen from the amount and the category."
      />

      {status === "returned" && (
        <p role="status" className="flex items-start gap-2 rounded-card border border-ims-orange/30 bg-ims-orange-bg px-4 py-3 text-t-body text-ims-orange">
          <CornerUpLeft size={16} className="mt-0.5 shrink-0" aria-hidden />
          <span>This requisition was returned for changes. Update it and submit it again; approval starts again from the first step.</span>
        </p>
      )}
      {offer && (
        <div role="status" className="flex flex-col gap-3 rounded-card border border-ims-info/20 bg-ims-info-bg px-4 py-3 text-t-body text-ims-info sm:flex-row sm:items-center sm:justify-between">
          <span className="flex items-start gap-2">
            <RotateCcw size={16} className="mt-0.5 shrink-0" aria-hidden />
            You have an unsaved requisition{offer.form.title ? ` “${offer.form.title}”` : ""} from an earlier visit.
          </span>
          <span className="flex shrink-0 gap-2">
            <Button size="sm" onClick={() => { autosave.clear(); setOffer(null); }}>Discard</Button>
            <Button size="sm" variant="primary" onClick={() => { setForm({ ...EMPTY_FORM, ...offer.form }); setItems(offer.items.length ? offer.items : [{ ...EMPTY_ITEM }]); setOffer(null); }}>
              Restore it
            </Button>
          </span>
        </div>
      )}

      <ErrorSummary errors={summaryErrors} title={errors.length ? "Check these fields before you submit" : "The requisition could not be saved"} />

      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        className="flex flex-col gap-4"
      >
        <FormBody
          aside={
            <>
              <SummaryPanel
                rows={[
                  ["Items", fmtNumber(filled.length)],
                  ["Subtotal", fmtMoney(totals.subtotal)],
                  ["Tax", fmtMoney(totals.tax)],
                  ["Estimated total", fmtMoney(totals.total)],
                ]}
                checklist={[
                  { label: "Title and category", done: doneIf("title", "category") },
                  { label: "Date needed", done: doneIf("required_date") },
                  { label: "Budget line", done: doneIf("budget_line") },
                  { label: "Items with quantity and cost", done: doneIf("item-") },
                  { label: "Justification", done: doneIf("justification") },
                ]}
              />
              <Card>
                <CardHeader title="Approval route" subtitle="Changes with the amount and the category." />
                {totals.total <= 0 ? (
                  <p className="text-t-body text-ims-muted">Add item costs to see who approves this request.</p>
                ) : route.isLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : !route.data?.workflow ? (
                  <p className="rounded-control bg-ims-warning-bg px-3 py-2.5 text-t-body text-ims-warning">
                    No approval route covers {fmtMoney(totals.total)} yet. You can save a draft; an administrator must add a route before it can be submitted.
                  </p>
                ) : (
                  <>
                    <p className="mb-3 text-t-small text-ims-muted">{route.data.workflow.name}</p>
                    <ol className="space-y-3">
                      {route.data.steps.map((s, i) => (
                        <li key={i} className="flex gap-3">
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-ims-field text-t-small font-bold text-ims-body">{i + 1}</span>
                          <div className="min-w-0 text-t-body">
                            <p className="font-semibold text-ims-text">{s.name}</p>
                            <p className={cn("text-t-small", s.approvers.length ? "text-ims-muted" : "text-ims-danger")}>
                              {s.approvers.length ? s.approvers.join(", ") : "No one can approve this step yet, so it cannot be submitted."}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  </>
                )}
              </Card>
            </>
          }
        >
          <FormSection title="Request" description="What you need and when.">
            <div className="rounded-control bg-ims-subtle px-4 py-3">
              <Details
                columns={2}
                items={[
                  { label: "Requester", value: user?.names },
                  { label: "Department", value: user?.department },
                  { label: "Designation", value: user?.designation },
                  { label: "Branch", value: user?.branch },
                ]}
              />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Title" required htmlFor="title" error={errorFor("title")} className="sm:col-span-2">
                <Input id="title" value={form.title} onChange={set("title")} placeholder="For example: Laptops for new audit staff" maxLength={150} invalid={Boolean(errorFor("title"))} />
              </Field>
              <Field label="Request type" required htmlFor="request_type">
                <Select id="request_type" value={form.request_type} onChange={set("request_type")}>
                  {REQUEST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Purchase category" required htmlFor="category" error={errorFor("category")}>
                <Select id="category" value={form.category} onChange={set("category")} invalid={Boolean(errorFor("category"))}>
                  <option value="">Choose a category</option>
                  {reference.data?.categories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}{c.is_asset ? " (asset)" : ""}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Priority" htmlFor="priority">
                <Select id="priority" value={form.priority} onChange={set("priority")}>
                  {Object.entries(PRIORITY).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Needed by" required htmlFor="required_date" error={errorFor("required_date")}>
                <DatePicker id="required_date" value={form.required_date} onChange={(v) => setForm((f) => ({ ...f, required_date: v }))} min={new Date().toISOString().slice(0, 10)} invalid={Boolean(errorFor("required_date"))} />
              </Field>
              <Field label="Delivery location" htmlFor="delivery_location">
                <Input id="delivery_location" value={form.delivery_location} onChange={set("delivery_location")} placeholder="For example: Kigali head office, 3rd floor" />
              </Field>
              <Field label="Cost centre" htmlFor="cost_center">
                <Input id="cost_center" value={form.cost_center} onChange={set("cost_center")} />
              </Field>
              <Field label="Project" htmlFor="project">
                <Input id="project" value={form.project} onChange={set("project")} />
              </Field>
              <Field label="Linked action plan" htmlFor="action_plan">
                <Select id="action_plan" value={form.action_plan} onChange={set("action_plan")}>
                  <option value="">None</option>
                  {reference.data?.plans.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Planned purchase"
                htmlFor="plan_line"
                className="sm:col-span-2"
                hint={pickedLine ? `${pickedLine.expand?.plan?.number} · planned ${fmtMoney(pickedLine.estimated_total)}` : "Link it to your department's approved procurement plan when it is planned."}
              >
                <Select id="plan_line" value={form.plan_line} onChange={(e) => pickPlanLine(e.target.value)}>
                  <option value="">Not in the plan (unplanned purchase)</option>
                  {planLines.data?.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.expand?.plan?.number} · {l.description}{l.planned_month ? ` · ${new Date(2000, l.planned_month - 1, 1).toLocaleString("en", { month: "short" })}` : ""}</option>
                  ))}
                </Select>
              </Field>
              <Field
                label="Budget line"
                required
                htmlFor="budget_line"
                className="sm:col-span-2"
                error={errorFor("budget_line")}
                hint="The money comes from this line. When you submit, the amount is checked against what is left on it."
              >
                <BudgetLinePicker id="budget_line" invalid={Boolean(errorFor("budget_line"))} value={form.budget_line} onChange={(id) => setForm((f) => ({ ...f, budget_line: id }))} department={me?.department} amount={debouncedTotal || undefined} />
              </Field>
              <Field label="Preferred supplier" htmlFor="preferred_supplier" hint="Optional. Procurement makes the final choice." className="sm:col-span-2">
                <Input id="preferred_supplier" value={form.preferred_supplier} onChange={set("preferred_supplier")} />
              </Field>
            </div>
          </FormSection>

          <FormSection title="Items and services" description="Estimated costs. VAT is 18% unless you change it.">
            <ol className="divide-y divide-ims-divider rounded-control border border-ims-border">
              {items.map((it, i) => {
                const net = (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0);
                const lineTotal = net + (net * (Number(it.tax_rate) || 0)) / 100;
                const id = (k: string) => `item-${i}-${k}`;
                return (
                  <li key={i} className="grid grid-cols-[24px_minmax(0,1fr)_36px] gap-x-3 px-3 py-4 sm:px-4">
                    <span className="pt-3 text-t-body font-bold text-ims-muted" aria-hidden>{i + 1}</span>
                    <div className="min-w-0 space-y-3">
                      <div className="space-y-1.5">
                        <Input id={id("description")} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Item or service" aria-label={`Line ${i + 1} description`} invalid={Boolean(errorFor(id("description")))} />
                        <Input value={it.specification || ""} onChange={(e) => setItem(i, "specification", e.target.value)} placeholder="Specification (optional)" aria-label={`Line ${i + 1} specification`} className="h-9 text-t-small" />
                      </div>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-[88px_124px_minmax(140px,1fr)_80px_minmax(104px,auto)]">
                        <Field label="Quantity" required htmlFor={id("quantity")} error={errorFor(id("quantity")) ? "Above 0" : null}>
                          <Input id={id("quantity")} type="number" min={0} step="any" inputMode="decimal" className="text-right tabular-nums" value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} invalid={Boolean(errorFor(id("quantity")))} />
                        </Field>
                        <Field label="Unit" htmlFor={id("unit")}>
                          <Select id={id("unit")} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)}>
                            {(reference.data?.units || [{ id: "each", name: "Each" }]).map((u: any) => (
                              <option key={u.id} value={u.name}>{u.name}</option>
                            ))}
                          </Select>
                        </Field>
                        <Field label="Unit cost" required htmlFor={id("unit_cost")} error={errorFor(id("unit_cost")) ? "Enter the cost" : null}>
                          <MoneyInput id={id("unit_cost")} value={it.unit_cost || ""} onChange={(v) => setItem(i, "unit_cost", v === "" ? 0 : v)} invalid={Boolean(errorFor(id("unit_cost")))} />
                        </Field>
                        <Field label="Tax (%)" htmlFor={id("tax_rate")}>
                          <Input id={id("tax_rate")} type="number" min={0} max={100} step="any" inputMode="decimal" className="text-right tabular-nums" value={it.tax_rate} onChange={(e) => setItem(i, "tax_rate", e.target.value)} />
                        </Field>
                        <div className="min-w-0">
                          <p className="mb-1.5 text-t-label text-ims-text">Line total</p>
                          <p className="flex h-control items-center justify-end whitespace-nowrap rounded-control bg-ims-subtle px-3 font-bold tabular-nums text-ims-text">{fmtMoney(lineTotal)}</p>
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => setItems((list) => (list.length > 1 ? list.filter((_, idx) => idx !== i) : [{ ...EMPTY_ITEM }]))}
                      className="mt-1 inline-flex h-9 w-9 items-center justify-center rounded-control text-ims-muted hover:bg-ims-danger-bg hover:text-ims-danger"
                      aria-label={`Remove line ${i + 1}`}
                    >
                      <Trash2 size={16} />
                    </button>
                  </li>
                );
              })}
            </ol>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <Button icon={Plus} onClick={() => setItems((l) => [...l, { ...EMPTY_ITEM }])}>Add line</Button>
              <dl className="flex flex-wrap items-baseline gap-x-5 gap-y-1 text-t-body sm:justify-end">
                <div className="flex gap-1.5"><dt className="text-ims-muted">Subtotal</dt><dd className="tabular-nums">{fmtMoney(totals.subtotal)}</dd></div>
                <div className="flex gap-1.5"><dt className="text-ims-muted">Tax</dt><dd className="tabular-nums">{fmtMoney(totals.tax)}</dd></div>
                <div className="flex gap-1.5 font-bold"><dt>Total</dt><dd className="tabular-nums">{fmtMoney(totals.total)}</dd></div>
              </dl>
            </div>
          </FormSection>

          <FormSection title="Justification">
            <Field label="Why is this needed?" required htmlFor="justification" error={errorFor("justification")} hint="What it is for, and what happens if it is not bought.">
              <Textarea id="justification" value={form.justification} onChange={set("justification")} invalid={Boolean(errorFor("justification"))} />
            </Field>
            <Field label="Notes for procurement" htmlFor="notes">
              <Textarea id="notes" value={form.notes} onChange={set("notes")} className="min-h-[80px]" />
            </Field>
          </FormSection>

          <FormSection title="Documents" description="Quotes, specifications or photos. Up to 20 MB per file.">
            {keptFiles.length > 0 && (
              <ul className="space-y-1.5">
                {keptFiles.map((f) => (
                  <li key={f} className="flex items-center justify-between gap-2 rounded-control border border-ims-border px-3 py-2 text-t-body">
                    <a className="truncate font-semibold text-ims-link hover:underline" href={pocketbase.files.getUrl(record, f)} target="_blank" rel="noreferrer">{f}</a>
                    <button type="button" onClick={() => setRemovedFiles((l) => [...l, f])} className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ims-muted hover:bg-ims-danger-bg hover:text-ims-danger" aria-label={`Remove ${f}`}>
                      <X size={15} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <FileDrop files={newFiles} onChange={setNewFiles} accept="" max={20} hint="Click to choose files or drag them here · up to 20 MB each" />
          </FormSection>
        </FormBody>

        <FormActions
          submitType="submit"
          onSaveDraft={() => save.mutate(false)}
          cancelTo={requisitionId ? `${LIST}/${requisitionId}` : LIST}
          busy={save.isLoading ? (save.variables ? "submit" : "draft") : null}
          note={autosave.savedAt ? `Kept on this device at ${fmtDateTime(autosave.savedAt).split(", ")[1]}. Save a draft to keep it in the system.` : "Save a draft to finish later."}
        />
      </form>
    </Page>
  );
}
