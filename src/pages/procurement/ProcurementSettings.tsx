import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Check, Pencil, Plus, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { cn } from "@/utils";
import { ListSkeleton } from "@/components/enterprise/ui";
import { ChoiceCards } from "@/components/portal/kit";
import { Button, Card, CardHeader, Column, DataTable, Field, Input, Page, PageHeader, Select, StatusPill, Tabs, inputClass } from "@/components/ims";
import { errorMessage } from "@/lib/procurement";

const TABS = [
  { key: "numbering", label: "Document numbering" },
  { key: "categories", label: "Purchase categories" },
  { key: "units", label: "Units of measure" },
  { key: "controls", label: "Controls and defaults" },
];
const cellInput = cn(inputClass, "h-9");
const checkboxCls = "h-4 w-4 rounded border-ims-field accent-ims-primary";

/** `embedded`: rendered as a tab inside Settings (no page header). */
export default function ProcurementSettings({ embedded = false }: { embedded?: boolean }) {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "numbering";
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_procurement_settings");

  const body = (
    <>
      <Tabs label="Procurement settings" tabs={TABS} active={tab} onChange={(k) => setParams({ tab: k })} />
      {!canManage && <p className="text-t-small text-ims-muted">You can view these settings. Changing them needs the procurement settings permission.</p>}
      {tab === "numbering" && <Numbering canManage={canManage} />}
      {tab === "controls" && <Controls canManage={canManage} />}
      {tab === "categories" && (
        <ReferenceList
          collection="procurement_categories"
          canManage={canManage}
          title="Purchase categories"
          subtitle="Categories marked as assets create asset records when the goods are received."
          noun="category"
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "code", label: "Code", required: true, className: "w-32" },
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
          noun="unit"
          fields={[
            { key: "name", label: "Name", required: true },
            { key: "code", label: "Code", required: true, className: "w-32" },
          ]}
        />
      )}
    </>
  );

  if (embedded) return <div className="flex flex-col gap-4 p-4">{body}</div>;
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Settings" }]}
        title="Procurement settings"
        subtitle="Document numbering, reference lists and the controls used across procurement."
      />
      {body}
    </Page>
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
  const cur = (row: any) => edits[row.id] || row;
  const upd = (row: any, patch: any) => setEdits((e) => ({ ...e, [row.id]: { ...cur(row), ...patch } }));

  const columns: Column<any>[] = [
    { key: "name", header: "Document", className: "min-w-[180px] font-semibold", cell: (row) => row.name },
    { key: "prefix", header: "Prefix", width: "120px", cell: (row) => <input className={cellInput} disabled={!canManage} value={cur(row).prefix} onChange={(e) => upd(row, { prefix: e.target.value })} aria-label={`${row.name} prefix`} /> },
    { key: "year", header: "Year", align: "center", width: "72px", cell: (row) => <input type="checkbox" className={checkboxCls} disabled={!canManage} checked={cur(row).include_year} onChange={(e) => upd(row, { include_year: e.target.checked })} aria-label={`${row.name} include year`} /> },
    { key: "padding", header: "Digits", width: "92px", cell: (row) => <input type="number" min={3} max={10} className={cn(cellInput, "text-right")} disabled={!canManage} value={cur(row).padding} onChange={(e) => upd(row, { padding: e.target.value })} aria-label={`${row.name} digits`} /> },
    { key: "separator", header: "Separator", width: "92px", cell: (row) => <input className={cn(cellInput, "text-center")} maxLength={1} disabled={!canManage} value={cur(row).separator} onChange={(e) => upd(row, { separator: e.target.value })} aria-label={`${row.name} separator`} /> },
    { key: "next", header: "Next number", width: "120px", cell: (row) => <input type="number" min={1} className={cn(cellInput, "text-right")} disabled={!canManage} value={cur(row).next_value} onChange={(e) => upd(row, { next_value: e.target.value })} aria-label={`${row.name} next number`} /> },
    { key: "example", header: "Next document", nowrap: true, cell: (row) => <span className="font-mono text-[13px] text-ims-body">{example(cur(row))}</span> },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      width: "150px",
      cell: (row) =>
        edits[row.id] ? (
          <span className="flex justify-end gap-1">
            <Button size="sm" variant="primary" icon={Check} onClick={() => save.mutate(cur(row))} loading={save.isLoading}>Save</Button>
            <Button size="icon-sm" variant="ghost" icon={X} aria-label={`Undo changes to ${row.name}`} onClick={() => setEdits(({ [row.id]: _, ...rest }) => rest)} />
          </span>
        ) : null,
    },
  ];

  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardHeader title="Document numbering" subtitle="With the year included, numbering starts again at 1 each year. The server gives out numbers and never reuses one." />
      </div>
      <DataTable columns={columns} rows={q.data || []} rowKey={(r) => r.id} loading={q.isLoading} minWidth={860} caption="Document numbering" />
    </Card>
  );
}

type FieldDef = { key: string; label: string; required?: boolean; type?: "bool"; className?: string };

function ReferenceList({ collection, title, subtitle, fields, canManage, noun }: { collection: string; title: string; subtitle?: string; fields: FieldDef[]; canManage: boolean; noun: string }) {
  const queryClient = useQueryClient();
  const q = useQuery([collection], () => pocketbase.collection(collection).getFullList({ sort: "name" }));
  const [draft, setDraft] = React.useState<any | null>(null);

  const save = useMutation(
    (row: any) => {
      const missing = fields.filter((f) => f.required && !String(row[f.key] ?? "").trim()).map((f) => f.label.toLowerCase());
      if (missing.length) throw new Error(`Enter the ${missing.join(" and ")}.`);
      const body = Object.fromEntries(fields.map((f) => [f.key, f.type === "bool" ? Boolean(row[f.key]) : String(row[f.key] ?? "").trim()]));
      return row.id ? pocketbase.collection(collection).update(row.id, { ...body, active: row.active ?? true }) : pocketbase.collection(collection).create({ ...body, active: true });
    },
    {
      onSuccess: (r: any) => {
        toast.success(`${r?.name || "Item"} saved`);
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
    onSuccess: (r: any) => {
      toast.success(`${r.name} ${r.active ? "activated" : "deactivated"}`);
      queryClient.invalidateQueries([collection]);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  const editing = (row: any) => row.__new || (draft && draft.id && draft.id === row.id);
  const rows = [...(draft && !draft.id ? [{ ...draft, __new: true }] : []), ...(q.data || [])];

  const columns: Column<any>[] = [
    ...fields.map<Column<any>>((f, i) => ({
      key: f.key,
      header: f.label,
      align: f.type === "bool" ? "center" : "left",
      className: cn(i === 0 && "font-semibold", f.className),
      cell: (row) =>
        editing(row) ? (
          f.type === "bool" ? (
            <input type="checkbox" className={checkboxCls} checked={Boolean(draft[f.key])} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.checked })} aria-label={f.label} />
          ) : (
            <input className={cellInput} value={draft[f.key] || ""} onChange={(e) => setDraft({ ...draft, [f.key]: e.target.value })} aria-label={f.label} autoFocus={f.key === "name"} />
          )
        ) : f.type === "bool" ? (
          row[f.key] ? "Yes" : <span className="text-ims-faint">—</span>
        ) : (
          <span className={cn(!row.active && "text-ims-muted")}>{row[f.key] || "—"}</span>
        ),
    })),
    { key: "status", header: "Status", width: "120px", cell: (row) => (editing(row) ? null : <StatusPill status={row.active ? "Active" : "Inactive"} />) },
    {
      key: "actions",
      header: <span className="sr-only">Actions</span>,
      width: "190px",
      cell: (row) =>
        !canManage ? null : editing(row) ? (
          <span className="flex justify-end gap-1">
            <Button size="sm" variant="primary" icon={Check} onClick={() => save.mutate(draft)} loading={save.isLoading}>Save</Button>
            <Button size="icon-sm" variant="ghost" icon={X} onClick={() => setDraft(null)} aria-label="Cancel" />
          </span>
        ) : (
          <span className="flex justify-end gap-1">
            <Button size="icon-sm" variant="ghost" icon={Pencil} onClick={() => setDraft(row)} aria-label={`Edit ${row.name}`} />
            <Button size="sm" variant="ghost" onClick={() => toggle.mutate(row)}>{row.active ? "Deactivate" : "Activate"}</Button>
          </span>
        ),
    },
  ];

  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardHeader title={title} subtitle={subtitle} action={canManage && !draft && <Button icon={Plus} onClick={() => setDraft({})}>Add {noun}</Button>} />
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r) => r.id || "new"} loading={q.isLoading} minWidth={620} caption={title} />
    </Card>
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
  if (!v) return <Card><ListSkeleton rows={4} /></Card>;
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const num = (k: string, label: string, hint: string, suffix = "%") => (
    <Field label={label} htmlFor={`ctl-${k}`} hint={hint}>
      <span className="flex items-center gap-2">
        <Input id={`ctl-${k}`} type="number" min={0} step={0.5} disabled={!canManage} className="w-28 text-right tabular-nums" value={v[k] ?? 0} onChange={set(k)} />
        <span className="text-t-body text-ims-muted">{suffix}</span>
      </span>
    </Field>
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
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader title="Receiving and invoice matching" subtitle="Differences inside these limits are accepted as a partial match. Beyond them the document is blocked until an authorised person resolves it." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {num("receipt_over_tolerance_pct", "Over-receipt tolerance", "Extra quantity an authorised store keeper may accept. 0 means never.")}
          {num("invoice_qty_tolerance_pct", "Invoice quantity tolerance", "Billed quantity above the quantity received.")}
          {num("invoice_price_tolerance_pct", "Invoice price tolerance", "Unit price difference against the purchase order.")}
          {num("invoice_total_tolerance_pct", "Invoice total tolerance", "Total of all bills above the order value.")}
        </div>
      </Card>
      <Card>
        <CardHeader title="Budget control" subtitle="Checked against the budget line when a requisition or a purchase order is submitted." />
        <ChoiceCards
          columns={3}
          value={(v.budget_control || "warn") as string}
          onChange={(k) => setV((x: any) => ({ ...x, budget_control: k }))}
          options={[
            { value: "none", label: "Off", description: "No budget check.", disabled: !canManage },
            { value: "warn", label: "Warn", description: "Allowed; the Budget Officer and the DAF are told.", disabled: !canManage },
            { value: "block", label: "Hard stop", description: "Blocked over budget unless the DAF overrides.", disabled: !canManage },
          ]}
        />
      </Card>
      <Card>
        <CardHeader title="Defaults" subtitle="Filled in on new purchase orders and receipts." />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {num("default_tax_rate", "Default VAT rate", "The standard VAT rate in Rwanda is 18%.")}
          <Field label="Default receiving warehouse" htmlFor="ctl-wh">
            <Select id="ctl-wh" disabled={!canManage} value={v.default_warehouse || ""} onChange={set("default_warehouse")}>
              <option value="">None</option>
              {(wh.data || []).map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
            </Select>
          </Field>
          <Field label="Default payment terms" htmlFor="ctl-pay"><Input id="ctl-pay" disabled={!canManage} value={v.default_payment_terms || ""} onChange={set("default_payment_terms")} /></Field>
          <Field label="Default delivery terms" htmlFor="ctl-del"><Input id="ctl-del" disabled={!canManage} value={v.default_delivery_terms || ""} onChange={set("default_delivery_terms")} /></Field>
        </div>
      </Card>
      <Card>
        <CardHeader title="Contracts and notifications" />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {num("contract_alert_days", "Alert before a contract ends", "Also used for the renewal decision date.", "days")}
          <div className="space-y-2.5 pt-1 text-t-body text-ims-text">
            <label className="flex items-start gap-2"><input type="checkbox" className={cn(checkboxCls, "mt-0.5")} disabled={!canManage} checked={Boolean(v.notify_email_approvals)} onChange={set("notify_email_approvals")} /> E-mail approvers as well as the in-app notification (needs e-mail set up)</label>
            <label className="flex items-start gap-2"><input type="checkbox" className={cn(checkboxCls, "mt-0.5")} disabled={!canManage} checked={Boolean(v.notify_overdue_deliveries)} onChange={set("notify_overdue_deliveries")} /> Tell buyers about late deliveries</label>
          </div>
        </div>
      </Card>
      {canManage && (
        <div className="flex justify-end">
          <Button variant="primary" loading={busy} onClick={save}>Save controls</Button>
        </div>
      )}
    </div>
  );
}
