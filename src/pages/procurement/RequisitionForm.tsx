import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { useDebounce } from "use-debounce";
import { toast } from "sonner";
import { AlertCircle, GitBranch, Paperclip, Plus, Send, Trash2, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useAuth } from "@/context/auth.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/utils";
import { PageHeader, Panel } from "@/components/enterprise/ui";
import {
  PRIORITY,
  REQUEST_TYPES,
  RequisitionItem,
  errorMessage,
  lineTotals,
  money,
  procurementApi,
} from "@/lib/procurement";

const EMPTY_ITEM: RequisitionItem = { description: "", specification: "", quantity: 1, unit: "Each", unit_cost: 0, tax_rate: 18 };

const inputCls =
  "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50";

function Field({ label, required, hint, children, className }: { label: string; required?: boolean; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1 block text-[12.5px] font-medium text-slate-700">
        {label}
        {required && <span className="text-red-600"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11.5px] text-slate-500">{hint}</span>}
    </label>
  );
}

function Section({ n, title, children, subtitle }: { n: number; title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <Panel
      title={
        <span className="flex items-center gap-2">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-ralga-navy text-[11px] text-white">{n}</span>
          {title}
        </span>
      }
      subtitle={subtitle}
    >
      {children}
    </Panel>
  );
}

export default function RequisitionForm() {
  const { requisitionId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const me = pocketbase.authStore.model as any;

  const [form, setForm] = React.useState({
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
    preferred_supplier: "",
    justification: "",
    notes: "",
  });
  const [items, setItems] = React.useState<RequisitionItem[]>([{ ...EMPTY_ITEM }]);
  const [newFiles, setNewFiles] = React.useState<File[]>([]);
  const [removedFiles, setRemovedFiles] = React.useState<string[]>([]);
  const [error, setError] = React.useState<string>();

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
      preferred_supplier: r.preferred_supplier || "",
      justification: r.justification || "",
      notes: r.notes || "",
    });
    setItems(r.items?.length ? r.items : [{ ...EMPTY_ITEM }]);
  }, [existing.data]);

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

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));
  const setItem = (i: number, k: keyof RequisitionItem, v: string) =>
    setItems((list) => list.map((it, idx) => (idx === i ? { ...it, [k]: ["quantity", "unit_cost", "tax_rate"].includes(k) ? Number(v) : v } : it)));

  const save = useMutation(async (submit: boolean) => {
    setError(undefined);
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
        navigate(`/dashboard/procurement/requisitions/${record.id}/edit`, { replace: true });
        throw e;
      }
    }
    return { record, submit };
  }, {
    onSuccess: ({ record, submit }) => {
      queryClient.invalidateQueries(["record-table"]);
      queryClient.invalidateQueries(["purchase_requisition", record.id]);
      toast.success(submit ? `${record.number} submitted for approval` : `${record.number} saved as draft`);
      navigate(`/dashboard/procurement/requisitions/${record.id}`);
    },
    onError: (e) => {
      const msg = errorMessage(e);
      setError(msg);
      toast.error(msg);
      window.scrollTo({ top: 0, behavior: "smooth" });
    },
  });

  const status = (existing.data as any)?.status;
  if (requisitionId && existing.isLoading) {
    return (
      <div className="space-y-4 px-4 py-4 sm:px-6">
        <Skeleton className="h-10 w-72" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (status && !["draft", "returned"].includes(status)) {
    return (
      <div className="px-4 py-4 sm:px-6">
        <Panel>
          <p className="text-[13px] text-slate-600">
            {(existing.data as any).number} is {status.replace(/_/g, " ")} and can no longer be edited.{" "}
            <button className="font-medium text-primaryDark underline" onClick={() => navigate(`/dashboard/procurement/requisitions/${requisitionId}`)}>
              Open it
            </button>
          </p>
        </Panel>
      </div>
    );
  }

  return (
    <form
      className="space-y-4 px-4 py-4 pb-24 sm:px-6"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate(true);
      }}
    >
      <PageHeader
        title={requisitionId ? `Edit ${(existing.data as any)?.number || "requisition"}` : "New purchase requisition"}
        description={
          status === "returned"
            ? "This request was sent back for changes. Update it and submit again — approval restarts from the first step."
            : "Describe what you need. The approval route is chosen automatically from the amount and category."
        }
        breadcrumbs={[
          { title: "Procurement", link: "/dashboard/procurement" },
          { title: "Requisitions", link: "/dashboard/procurement/requisitions" },
          { title: requisitionId ? "Edit" : "New", link: "#" },
        ]}
      />

      {error && (
        <div role="alert" className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2.5 text-[13px] text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Section n={1} title="Request information">
            <div className="mb-4 grid grid-cols-2 gap-3 rounded-md bg-slate-50 px-3 py-2.5 text-[12.5px] sm:grid-cols-4">
              {[
                ["Requester", user?.names],
                ["Department", user?.department],
                ["Designation", user?.designation],
                ["Branch", user?.branch],
              ].map(([k, v]) => (
                <div key={k} className="min-w-0">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
                  <p className="truncate text-slate-800">{v || "—"}</p>
                </div>
              ))}
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Title" required className="sm:col-span-2">
                <input className={inputCls} value={form.title} onChange={set("title")} placeholder="e.g. Laptops for new audit associates" maxLength={150} />
              </Field>
              <Field label="Request type" required>
                <select className={inputCls} value={form.request_type} onChange={set("request_type")}>
                  {REQUEST_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Purchase category" required>
                <select className={inputCls} value={form.category} onChange={set("category")}>
                  <option value="">Select a category…</option>
                  {reference.data?.categories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}{c.is_asset ? " (asset)" : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select className={inputCls} value={form.priority} onChange={set("priority")}>
                  {Object.entries(PRIORITY).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </Field>
              <Field label="Required by" required>
                <input type="date" className={inputCls} value={form.required_date} onChange={set("required_date")} min={new Date().toISOString().slice(0, 10)} />
              </Field>
              <Field label="Delivery location">
                <input className={inputCls} value={form.delivery_location} onChange={set("delivery_location")} placeholder="e.g. Kigali HQ, 3rd floor" />
              </Field>
              <Field label="Cost center">
                <input className={inputCls} value={form.cost_center} onChange={set("cost_center")} />
              </Field>
              <Field label="Project">
                <input className={inputCls} value={form.project} onChange={set("project")} />
              </Field>
              <Field label="Linked action plan">
                <select className={inputCls} value={form.action_plan} onChange={set("action_plan")}>
                  <option value="">None</option>
                  {reference.data?.plans.map((p: any) => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </Field>
              <Field label="Planned purchase" hint={pickedLine ? `${pickedLine.expand?.plan?.number} · budgeted ${Number(pickedLine.estimated_total || 0).toLocaleString()} RWF` : "Link to your department's approved procurement plan (recommended)."}>
                <select className={inputCls} value={form.plan_line} onChange={(e) => pickPlanLine(e.target.value)}>
                  <option value="">Not in the plan (unplanned purchase)</option>
                  {planLines.data?.map((l: any) => (
                    <option key={l.id} value={l.id}>{l.expand?.plan?.number} · {l.description}{l.planned_month ? ` · ${new Date(2000, l.planned_month - 1, 1).toLocaleString("en", { month: "short" })}` : ""}</option>
                  ))}
                </select>
              </Field>
              <Field label="Preferred supplier" hint="Optional. Procurement makes the final supplier choice.">
                <input className={inputCls} value={form.preferred_supplier} onChange={set("preferred_supplier")} />
              </Field>
            </div>
          </Section>

          <Section n={2} title="Items and services" subtitle="Estimated costs. VAT defaults to 18%.">
            <div className="-mx-4 overflow-x-auto">
              <table className="dnr-grid w-full min-w-[760px] text-[13px]">
                <thead>
                  <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                    <th className="w-8 px-3 py-2">#</th>
                    <th className="min-w-[240px] px-2 py-2">Description *</th>
                    <th className="w-20 px-2 py-2">Qty *</th>
                    <th className="w-28 px-2 py-2">Unit</th>
                    <th className="w-32 px-2 py-2">Unit cost *</th>
                    <th className="w-20 px-2 py-2">Tax %</th>
                    <th className="w-32 px-2 py-2 text-right">Line total</th>
                    <th className="w-10 px-2 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 align-top">
                  {items.map((it, i) => {
                    const net = (Number(it.quantity) || 0) * (Number(it.unit_cost) || 0);
                    const lineTotal = net + (net * (Number(it.tax_rate) || 0)) / 100;
                    return (
                      <tr key={i}>
                        <td className="px-3 py-2 pt-4 text-slate-500">{i + 1}</td>
                        <td className="px-2 py-2">
                          <input className={inputCls} value={it.description} onChange={(e) => setItem(i, "description", e.target.value)} placeholder="Item or service" aria-label={`Line ${i + 1} description`} />
                          <input className={cn(inputCls, "mt-1.5 h-8 text-[12px]")} value={it.specification || ""} onChange={(e) => setItem(i, "specification", e.target.value)} placeholder="Specification (optional)" aria-label={`Line ${i + 1} specification`} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min={0} step="any" className={inputCls} value={it.quantity} onChange={(e) => setItem(i, "quantity", e.target.value)} aria-label={`Line ${i + 1} quantity`} />
                        </td>
                        <td className="px-2 py-2">
                          <select className={inputCls} value={it.unit} onChange={(e) => setItem(i, "unit", e.target.value)} aria-label={`Line ${i + 1} unit`}>
                            {(reference.data?.units || [{ id: "each", name: "Each" }]).map((u: any) => (
                              <option key={u.id} value={u.name}>{u.name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min={0} step="any" className={inputCls} value={it.unit_cost} onChange={(e) => setItem(i, "unit_cost", e.target.value)} aria-label={`Line ${i + 1} unit cost`} />
                        </td>
                        <td className="px-2 py-2">
                          <input type="number" min={0} max={100} step="any" className={inputCls} value={it.tax_rate} onChange={(e) => setItem(i, "tax_rate", e.target.value)} aria-label={`Line ${i + 1} tax rate`} />
                        </td>
                        <td className="px-2 py-2 pt-4 text-right font-medium tabular-nums text-slate-800">{Math.round(lineTotal).toLocaleString()}</td>
                        <td className="px-2 py-2 pt-3">
                          <button
                            type="button"
                            onClick={() => setItems((list) => (list.length > 1 ? list.filter((_, idx) => idx !== i) : [{ ...EMPTY_ITEM }]))}
                            className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                            aria-label={`Remove line ${i + 1}`}
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => setItems((l) => [...l, { ...EMPTY_ITEM }])}>
                <Plus size={14} /> Add line
              </Button>
              <dl className="w-full max-w-xs space-y-1 text-[13px]">
                <div className="flex justify-between text-slate-600"><dt>Subtotal</dt><dd className="tabular-nums">{money(totals.subtotal)}</dd></div>
                <div className="flex justify-between text-slate-600"><dt>Tax</dt><dd className="tabular-nums">{money(totals.tax)}</dd></div>
                <div className="flex justify-between border-t border-slate-200 pt-1 text-[14px] font-semibold text-slate-900"><dt>Estimated total</dt><dd className="tabular-nums">{money(totals.total)}</dd></div>
              </dl>
            </div>
          </Section>

          <Section n={3} title="Justification">
            <div className="grid gap-3">
              <Field label="Business justification" required hint="Why is this needed, and what happens if it is not purchased?">
                <textarea className={cn(inputCls, "h-24 py-2")} value={form.justification} onChange={set("justification")} />
              </Field>
              <Field label="Notes for procurement">
                <textarea className={cn(inputCls, "h-16 py-2")} value={form.notes} onChange={set("notes")} />
              </Field>
            </div>
          </Section>

          <Section n={4} title="Attachments" subtitle="Quotes, specifications or photos. Max 20 MB per file.">
            <ul className="mb-3 space-y-1.5">
              {((existing.data as any)?.attachments || [])
                .filter((f: string) => !removedFiles.includes(f))
                .map((f: string) => (
                  <li key={f} className="flex items-center justify-between rounded-md border border-slate-200 px-3 py-1.5 text-[13px]">
                    <a className="truncate text-primaryDark hover:underline" href={pocketbase.files.getUrl(existing.data!, f)} target="_blank" rel="noreferrer">{f}</a>
                    <button type="button" onClick={() => setRemovedFiles((l) => [...l, f])} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${f}`}><X size={15} /></button>
                  </li>
                ))}
              {newFiles.map((f, i) => (
                <li key={`${f.name}-${i}`} className="flex items-center justify-between rounded-md border border-dashed border-slate-300 px-3 py-1.5 text-[13px]">
                  <span className="truncate">{f.name} <span className="text-slate-400">· new</span></span>
                  <button type="button" onClick={() => setNewFiles((l) => l.filter((_, idx) => idx !== i))} className="text-slate-400 hover:text-red-600" aria-label={`Remove ${f.name}`}><X size={15} /></button>
                </li>
              ))}
            </ul>
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-1.5 text-[13px] text-slate-700 hover:bg-slate-50">
              <Paperclip size={14} /> Add files
              <input type="file" multiple className="sr-only" onChange={(e) => setNewFiles((l) => [...l, ...Array.from(e.target.files || [])])} />
            </label>
          </Section>
        </div>

        <div className="space-y-4">
          <Panel title={<span className="flex items-center gap-2"><GitBranch size={15} /> Approval route</span>} subtitle="Updates as you change the amount or category">
            {totals.total <= 0 ? (
              <p className="text-[13px] text-slate-500">Add item costs to see who will approve this request.</p>
            ) : route.isLoading ? (
              <Skeleton className="h-24 w-full" />
            ) : !route.data?.workflow ? (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-[13px] text-amber-800">
                No approval workflow matches {money(totals.total)}. You can save a draft, but submission will be refused until an administrator configures one.
              </p>
            ) : (
              <div>
                <p className="mb-3 text-[12.5px] text-slate-500">Workflow: <span className="font-medium text-slate-800">{route.data.workflow.name}</span></p>
                <ol className="space-y-3">
                  {route.data.steps.map((s, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-slate-300 text-[11px] font-semibold text-slate-600">{i + 1}</span>
                      <div className="min-w-0 text-[13px]">
                        <p className="font-medium text-slate-800">{s.name}</p>
                        <p className={cn("text-[12px]", s.approvers.length ? "text-slate-500" : "text-red-600")}>
                          {s.approvers.length ? s.approvers.join(", ") : "No eligible approver — submission will be refused"}
                        </p>
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </Panel>
          <Panel title="Summary">
            <dl className="space-y-1.5 text-[13px]">
              <div className="flex justify-between"><dt className="text-slate-500">Lines</dt><dd>{items.filter((i) => i.description.trim()).length}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Estimated total</dt><dd className="font-semibold tabular-nums">{money(totals.total)}</dd></div>
            </dl>
          </Panel>
        </div>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur lg:left-[280px]">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-end gap-2 sm:px-2">
          <Button type="button" variant="ghost" onClick={() => navigate(-1)} disabled={save.isLoading}>Cancel</Button>
          <Button type="button" variant="outline" onClick={() => save.mutate(false)} disabled={save.isLoading}>
            Save draft
          </Button>
          <Button type="submit" disabled={save.isLoading}>
            <Send size={14} /> {save.isLoading ? "Saving…" : "Submit for approval"}
          </Button>
        </div>
      </div>
    </form>
  );
}
