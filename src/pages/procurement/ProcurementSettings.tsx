import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Hash, Pencil, Plus, Tags, Ruler, X, ShieldCheck } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { Badge, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";

const inputCls =
  "h-8 w-full rounded-md border border-slate-200 bg-white px-2.5 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50";

const TABS = [
  { key: "numbering", label: "Document numbering", icon: Hash },
  { key: "categories", label: "Purchase categories", icon: Tags },
  { key: "units", label: "Units of measure", icon: Ruler },
  { key: "controls", label: "Controls and defaults", icon: ShieldCheck },
];

/** `embedded`: rendered as a tab inside Settings (no page header). */
export default function ProcurementSettings({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "numbering";
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_procurement_settings");

  return (
    <div className={embedded ? "space-y-4 p-4" : "space-y-4 px-4 py-4 sm:px-6"}>
      {!embedded && <PageHeader
        title="Procurement settings"
        description={canManage ? "Configure numbering and reference lists used across procurement." : "Read-only: your role cannot change procurement settings."}
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Settings", link: "#" }]}
      />}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.key}
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => setParams({ tab: t.key })}
            className={cn(
              "-mb-px flex items-center gap-1.5 whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium",
              tab === t.key ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800"
            )}
          >
            <t.icon size={14} /> {t.label}
          </button>
        ))}
      </div>
      {tab === "numbering" && <Numbering canManage={canManage} />}
      {tab === "controls" && <Controls canManage={canManage} />}
      {tab === "categories" && (
        <ReferenceList
          collection="procurement_categories"
          canManage={canManage}
          title="Purchase categories"
          subtitle="Categories marked as assets will create asset records when goods are received (Phase 3)."
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "code", label: "Code", required: true, className: "w-28" },
            { key: "description", label: "Description" },
            { key: "is_asset", label: "Asset", type: "bool" },
          ]}
        />
      )}
      {tab === "units" && (
        <ReferenceList
          collection="units_of_measure"
          canManage={canManage}
          title="Units of measure"
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "code", label: "Code", required: true, className: "w-28" },
          ]}
        />
      )}
    </div>
  );
}

function example(s: any) {
  const parts = [s.prefix];
  if (s.include_year) parts.push(String(new Date().getFullYear()));
  parts.push(String(s.next_value || 1).padStart(Number(s.padding) || 6, "0"));
  return parts.filter(Boolean).join(s.separator || "-");
}

function Numbering({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery(["number_sequences"], () => pocketbase.collection("number_sequences").getFullList({ sort: "name" }));
  const [edits, setEdits] = React.useState<Record<string, any>>({});
  const save = useMutation(
    (s: any) =>
      pocketbase.collection("number_sequences").update(s.id, {
        prefix: s.prefix.trim().toUpperCase(),
        include_year: s.include_year,
        padding: Math.min(Math.max(Number(s.padding) || 6, 3), 10),
        separator: s.separator,
        next_value: Math.max(Number(s.next_value) || 1, 1),
      }),
    {
      onSuccess: (r: any) => {
        toast.success(`Numbering for ${r.name} updated`);
        setEdits((e) => {
          const { [r.id]: _, ...rest } = e;
          return rest;
        });
        queryClient.invalidateQueries(["number_sequences"]);
      },
      onError: (e) => {
      toast.error(errorMessage(e));
    },
    }
  );

  return (
    <Panel title="Document numbering" subtitle="Sequences restart at 1 each calendar year when the year is included. Numbers are assigned by the server and can never be reused.">
      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="dnr-grid w-full min-w-[760px] text-[13px]">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                <th className="px-4 py-2">Document</th>
                <th className="px-2 py-2">Prefix</th>
                <th className="px-2 py-2">Year</th>
                <th className="px-2 py-2">Digits</th>
                <th className="px-2 py-2">Separator</th>
                <th className="px-2 py-2">Next number</th>
                <th className="px-2 py-2">Next document</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {q.data?.map((row: any) => {
                const s = edits[row.id] || row;
                const dirty = Boolean(edits[row.id]);
                const upd = (patch: any) => setEdits((e) => ({ ...e, [row.id]: { ...s, ...patch } }));
                return (
                  <tr key={row.id}>
                    <td className="px-4 py-2 font-medium text-slate-800">{row.name}</td>
                    <td className="px-2 py-2"><input className={cn(inputCls, "w-24")} disabled={!canManage} value={s.prefix} onChange={(e) => upd({ prefix: e.target.value })} aria-label={`${row.name} prefix`} /></td>
                    <td className="px-2 py-2"><input type="checkbox" disabled={!canManage} checked={s.include_year} onChange={(e) => upd({ include_year: e.target.checked })} aria-label={`${row.name} include year`} /></td>
                    <td className="px-2 py-2"><input type="number" min={3} max={10} className={cn(inputCls, "w-16")} disabled={!canManage} value={s.padding} onChange={(e) => upd({ padding: e.target.value })} aria-label={`${row.name} digits`} /></td>
                    <td className="px-2 py-2"><input className={cn(inputCls, "w-12")} maxLength={1} disabled={!canManage} value={s.separator} onChange={(e) => upd({ separator: e.target.value })} aria-label={`${row.name} separator`} /></td>
                    <td className="px-2 py-2"><input type="number" min={1} className={cn(inputCls, "w-24")} disabled={!canManage} value={s.next_value} onChange={(e) => upd({ next_value: e.target.value })} aria-label={`${row.name} next number`} /></td>
                    <td className="px-2 py-2 font-mono text-[12.5px] text-slate-700">{example(s)}</td>
                    <td className="px-4 py-2 text-right">
                      {dirty && (
                        <div className="flex justify-end gap-1">
                          <Button size="sm" onClick={() => save.mutate(s)} disabled={save.isLoading}><Check size={14} /> Save</Button>
                          <Button size="sm" variant="ghost" onClick={() => setEdits(({ [row.id]: _, ...rest }) => rest)}><X size={14} /></Button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

type FieldDef = { key: string; label: string; required?: boolean; type?: "bool"; className?: string };

function ReferenceList({ collection, title, subtitle, fields, canManage }: { collection: string; title: string; subtitle?: string; fields: FieldDef[]; canManage: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery([collection], () => pocketbase.collection(collection).getFullList({ sort: "name" }));
  const [draft, setDraft] = React.useState<any | null>(null);

  const save = useMutation(
    (row: any) => {
      const missing = fields.filter((f) => f.required && !String(row[f.key] ?? "").trim()).map((f) => f.label.toLowerCase());
      if (missing.length) throw new Error(`Please enter ${missing.join(" and ")}.`);
      const body = Object.fromEntries(fields.map((f) => [f.key, f.type === "bool" ? Boolean(row[f.key]) : String(row[f.key] ?? "").trim()]));
      return row.id ? pocketbase.collection(collection).update(row.id, { ...body, active: row.active ?? true }) : pocketbase.collection(collection).create({ ...body, active: true });
    },
    {
      onSuccess: () => {
        toast.success("Saved");
        setDraft(null);
        queryClient.invalidateQueries([collection]);
        queryClient.invalidateQueries(["procurement-reference"]);
      },
      onError: (e) => {
      toast.error(errorMessage(e));
    },
    }
  );
  const toggle = useMutation((row: any) => pocketbase.collection(collection).update(row.id, { active: !row.active }), {
    onSuccess: () => queryClient.invalidateQueries([collection]),
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  const editorRow = (row: any) => (
    <tr className="bg-primary/5">
      {fields.map((f) => (
        <td key={f.key} className="px-2 py-2">
          {f.type === "bool" ? (
            <input type="checkbox" checked={Boolean(row[f.key])} onChange={(e) => setDraft({ ...row, [f.key]: e.target.checked })} aria-label={f.label} />
          ) : (
            <input className={cn(inputCls, f.className)} value={row[f.key] || ""} onChange={(e) => setDraft({ ...row, [f.key]: e.target.value })} aria-label={f.label} autoFocus={f.key === "name"} />
          )}
        </td>
      ))}
      <td className="px-2 py-2" />
      <td className="px-4 py-2 text-right">
        <div className="flex justify-end gap-1">
          <Button size="sm" onClick={() => save.mutate(row)} disabled={save.isLoading}><Check size={14} /> Save</Button>
          <Button size="sm" variant="ghost" onClick={() => setDraft(null)} aria-label="Cancel"><X size={14} /></Button>
        </div>
      </td>
    </tr>
  );

  return (
    <Panel
      title={title}
      subtitle={subtitle}
      action={canManage && !draft && <Button size="sm" onClick={() => setDraft({})}><Plus size={14} /> Add</Button>}
    >
      {q.isLoading ? (
        <ListSkeleton rows={6} />
      ) : (
        <div className="-mx-4 overflow-x-auto">
          <table className="dnr-grid w-full min-w-[560px] text-[13px]">
            <thead>
              <tr className="border-y border-slate-100 bg-slate-50/70 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                {fields.map((f) => <th key={f.key} className="px-2 py-2 first:pl-4">{f.label}</th>)}
                <th className="px-2 py-2">Status</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft && !draft.id && editorRow(draft)}
              {q.data?.map((row: any) =>
                draft?.id === row.id ? (
                  <React.Fragment key={row.id}>{editorRow(draft)}</React.Fragment>
                ) : (
                  <tr key={row.id} className={cn(!row.active && "text-slate-400")}>
                    {fields.map((f) => (
                      <td key={f.key} className="px-2 py-2 first:pl-4">
                        {f.type === "bool" ? (row[f.key] ? <Badge tone="info">Yes</Badge> : "—") : row[f.key] || "—"}
                      </td>
                    ))}
                    <td className="px-2 py-2">{row.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>}</td>
                    <td className="px-4 py-2 text-right">
                      {canManage && (
                        <div className="flex justify-end gap-1">
                          <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setDraft(row)} aria-label={`Edit ${row.name}`}><Pencil size={14} /></Button>
                          <Button size="sm" variant="ghost" onClick={() => toggle.mutate(row)}>{row.active ? "Deactivate" : "Activate"}</Button>
                        </div>
                      )}
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}
    </Panel>
  );
}

/** Tolerances, budget control, defaults and alerts used by receiving, invoice matching and contracts. */
function Controls({ canManage }: { canManage: boolean }) {
  const q = useQuery(["settings-record"], () => pocketbase.collection("settings").getList(1, 1).then((r) => r.items[0]));
  const wh = useQuery(["warehouses-simple"], () => pocketbase.collection("warehouses").getFullList({ sort: "name", fields: "id,name" }));
  const [v, setV] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (q.data) setV(q.data);
  }, [q.data]);
  if (!v) return <Panel title="Controls and defaults"><p className="text-[13px] text-slate-500">Loading…</p></Panel>;
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const num = (k: string, label: string, hint: string, suffix = "%") => (
    <label className="block text-[12.5px] font-medium text-slate-700">
      {label}
      <span className="mt-1 flex items-center gap-2"><input type="number" min={0} step={0.5} disabled={!canManage} className={cn(inputCls, "h-9 w-28 text-right")} value={v[k] ?? 0} onChange={set(k)} /><span className="text-slate-500">{suffix}</span></span>
      <span className="mt-1 block text-[11.5px] font-normal text-slate-500">{hint}</span>
    </label>
  );
  async function save() {
    setBusy(true);
    try {
      const fields = ["receipt_over_tolerance_pct", "invoice_price_tolerance_pct", "invoice_total_tolerance_pct", "invoice_qty_tolerance_pct", "default_tax_rate", "contract_alert_days"];
      const data: any = Object.fromEntries(fields.map((k) => [k, Number(v[k]) || 0]));
      Object.assign(data, { budget_control: v.budget_control || "warn", default_payment_terms: v.default_payment_terms || "", default_delivery_terms: v.default_delivery_terms || "", default_warehouse: v.default_warehouse || "", notify_email_approvals: Boolean(v.notify_email_approvals), notify_overdue_deliveries: Boolean(v.notify_overdue_deliveries) });
      await pocketbase.collection("settings").update(v.id, data);
      toast.success("Procurement controls saved");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="space-y-4">
      <Panel title="Receiving and invoice matching" subtitle="Differences inside these tolerances are accepted (partial match); beyond them the document is blocked until an authorised person resolves it.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num("receipt_over_tolerance_pct", "Over-receipt tolerance", "Extra quantity a store keeper with the authorisation may accept (0 = never).")}
          {num("invoice_qty_tolerance_pct", "Invoice quantity tolerance", "Billed quantity above the received quantity.")}
          {num("invoice_price_tolerance_pct", "Invoice price tolerance", "Unit price difference against the purchase order.")}
          {num("invoice_total_tolerance_pct", "Invoice total tolerance", "Total of all bills above the order value.")}
        </div>
      </Panel>
      <Panel title="Budget control" subtitle="Checked against the budget line when a requisition or a purchase order is submitted.">
        <div className="flex flex-wrap gap-2">
          {[["none", "Off", "No budget check"], ["warn", "Warn", "Allowed; Budget Officer and DAF are notified"], ["block", "Hard stop", "Blocked over budget unless the DAF overrides"]].map(([k, l, d]) => (
            <button key={k} type="button" disabled={!canManage} onClick={() => setV((x: any) => ({ ...x, budget_control: k }))} className={cn("min-w-[180px] rounded-lg border px-3 py-2 text-left", (v.budget_control || "warn") === k ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-slate-200")}>
              <span className="block text-[13px] font-medium">{l}</span><span className="text-[12px] text-slate-500">{d}</span>
            </button>
          ))}
        </div>
      </Panel>
      <Panel title="Defaults" subtitle="Pre-filled on new purchase orders and receipts.">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {num("default_tax_rate", "Default VAT rate", "Rwanda standard VAT is 18%.")}
          <label className="block text-[12.5px] font-medium text-slate-700">Default receiving warehouse
            <select disabled={!canManage} className={cn(inputCls, "mt-1 h-9")} value={v.default_warehouse || ""} onChange={set("default_warehouse")}><option value="">None</option>{(wh.data || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select>
          </label>
          <label className="block text-[12.5px] font-medium text-slate-700">Default payment terms<input disabled={!canManage} className={cn(inputCls, "mt-1 h-9")} value={v.default_payment_terms || ""} onChange={set("default_payment_terms")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Default delivery terms<input disabled={!canManage} className={cn(inputCls, "mt-1 h-9")} value={v.default_delivery_terms || ""} onChange={set("default_delivery_terms")} /></label>
        </div>
      </Panel>
      <Panel title="Contracts and notifications">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {num("contract_alert_days", "Alert before a contract ends", "Also used for the renewal decision date.", "days")}
          <div className="space-y-2 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" disabled={!canManage} checked={Boolean(v.notify_email_approvals)} onChange={set("notify_email_approvals")} /> E-mail approvers as well as the in-app notification (needs SMTP)</label>
            <label className="flex items-center gap-2"><input type="checkbox" disabled={!canManage} checked={Boolean(v.notify_overdue_deliveries)} onChange={set("notify_overdue_deliveries")} /> Notify buyers of overdue deliveries</label>
          </div>
        </div>
      </Panel>
      {canManage && <div className="flex justify-end"><Button disabled={busy} onClick={save}>{busy ? "Saving…" : "Save controls"}</Button></div>}
    </div>
  );
}
