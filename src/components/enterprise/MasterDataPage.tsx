/**
 * Generic master-data screen: a filterable, exportable table plus a create / edit form dialog.
 * Writes go through the API, so the server's permission guards and validation apply and every
 * change is audited. Records are never deleted — they are deactivated.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { LucideIcon, Pencil, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { ImportConfig } from "@/components/enterprise/ExcelImport";
import { toInputDate } from "@/components/portal/kit";
import { Button, Checkbox, DatePicker, Field, Input, Modal, ModalSection, MoneyInput, Page, PageHeader, Select, Textarea } from "@/components/ims";
import { cn } from "@/utils";

export type FieldType = "text" | "textarea" | "select" | "relation" | "date" | "money" | "number" | "bool";
export interface FormFieldDef {
  name: string;
  label: string;
  type: FieldType;
  required?: boolean;
  hint?: string;
  /** select */
  options?: { value: string; label: string }[];
  /** relation */
  collection?: string;
  optionLabel?: (r: any) => string;
  optionFilter?: string;
  /** half width on desktop */
  half?: boolean;
  /** uppercase the value (codes) */
  upper?: boolean;
  placeholder?: string;
}
export interface FormSectionDef {
  title: string;
  icon: LucideIcon;
  fields: FormFieldDef[];
}

function RelationSelect({ f, value, onChange, disabled, id, invalid }: { f: FormFieldDef; value: string; onChange: (v: string) => void; disabled?: boolean; id?: string; invalid?: boolean }) {
  const q = useQuery(["master-relation", f.collection, f.optionFilter], () => pocketbase.collection(f.collection!).getFullList({ sort: "name", filter: f.optionFilter || "", batch: 500 }), { staleTime: 60_000 });
  return (
    <Select id={id} invalid={invalid} value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled}>
      <option value="">None</option>
      {(q.data || []).map((r: any) => (
        <option key={r.id} value={r.id}>
          {f.optionLabel ? f.optionLabel(r) : r.code ? `${r.code} — ${r.name}` : r.name}
        </option>
      ))}
    </Select>
  );
}

export default function MasterDataPage<T extends { id: string }>({
  title,
  description,
  icon,
  collection,
  managePermission,
  exportPermission,
  columns,
  views,
  filters,
  searchFields,
  defaultSort,
  expand,
  sections,
  defaults,
  itemLabel,
  toPayload,
  aside,
}: {
  title: string;
  description: React.ReactNode;
  icon: LucideIcon;
  collection: string;
  managePermission: string;
  exportPermission?: string | string[];
  columns: RecordColumn<T>[];
  views?: RecordView[];
  filters?: RecordFilter[];
  searchFields: string[];
  defaultSort?: string;
  expand?: string;
  sections: FormSectionDef[];
  defaults: Record<string, any>;
  /** "funding source", "project"… */
  itemLabel: string;
  toPayload?: (v: Record<string, any>) => Record<string, any>;
  aside?: React.ReactNode;
}) {
  const { can } = usePermissions();
  const canManage = can(managePermission);
  const queryClient = useQueryClient();
  const [view, setView] = React.useState(views?.[0]?.key);
  const [editing, setEditing] = React.useState<Record<string, any> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const [refresh, setRefresh] = React.useState(0);

  const open = (row?: any) => {
    setTried(false);
    if (!row) return setEditing({ ...defaults });
    const v: Record<string, any> = { id: row.id };
    for (const s of sections) for (const f of s.fields) v[f.name] = f.type === "date" ? toInputDate(row[f.name]) : row[f.name];
    setEditing(v);
  };

  const missing = (f: FormFieldDef) => f.required && (editing?.[f.name] === undefined || editing?.[f.name] === null || String(editing?.[f.name]).trim() === "");

  async function save() {
    if (!editing) return;
    setTried(true);
    const all = sections.flatMap((s) => s.fields);
    if (all.some(missing)) return toast.error("Fill in the required fields.");
    const data: Record<string, any> = {};
    for (const f of all) {
      let v = editing[f.name];
      if (f.type === "money" || f.type === "number") v = v === "" || v === undefined || v === null ? 0 : f.type === "money" ? Math.round(Number(v)) : Number(v);
      if (f.type === "date") v = v ? `${v} 00:00:00.000Z` : "";
      if (f.type === "bool") v = Boolean(v);
      if (f.upper && typeof v === "string") v = v.trim().toUpperCase();
      data[f.name] = v ?? "";
    }
    const payload = toPayload ? toPayload(data) : data;
    setBusy(true);
    try {
      if (editing.id) await pocketbase.collection(collection).update(editing.id, payload);
      else await pocketbase.collection(collection).create(payload);
      toast.success(`${itemLabel[0].toUpperCase()}${itemLabel.slice(1)} saved`);
      setEditing(null);
      setRefresh((n) => n + 1);
      queryClient.invalidateQueries(["master-relation", collection]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Excel import built from the same field definitions as the form (same validation, same payload).
  const importConfig: ImportConfig = {
    name: collection,
    title,
    permission: managePermission,
    collection,
    uniqueBy: sections.some((s) => s.fields.some((f) => f.name === "code")) ? "code" : undefined,
    fields: sections.flatMap((s) => s.fields).map((f) => ({
      name: f.name, label: f.label, required: f.required, hint: f.hint, upper: f.upper,
      type: f.type === "textarea" ? "textarea" : f.type,
      options: f.options, collection: f.collection, relationFilter: f.optionFilter,
      example: f.type === "bool" ? "Yes" : f.type === "date" ? "2026-07-01" : f.type === "money" ? 1000000 : f.type === "select" ? f.options?.[0]?.label : f.placeholder,
    })),
    toPayload: (v) => {
      const data: Record<string, any> = { ...defaults, ...v };
      for (const f of sections.flatMap((s) => s.fields)) if (f.type === "bool" && data[f.name] === undefined) data[f.name] = Boolean(defaults[f.name]);
      return toPayload ? toPayload(data) : data;
    },
  };

  const set = (name: string, value: any) => setEditing((s) => ({ ...(s || {}), [name]: value }));
  const fieldError = (f: FormFieldDef) => (tried && missing(f) ? (f.type === "select" || f.type === "relation" ? `Choose the ${f.label.toLowerCase()}.` : `Enter the ${f.label.toLowerCase()}.`) : null);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Setup" }, { label: title }]}
        title={title}
        subtitle={description}
        primary={canManage ? { label: `New ${itemLabel}`, icon: Plus, onClick: () => open() } : undefined}
      />
      {aside}
      <RecordTable<T>
        collection={collection}
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={setView}
        filters={filters}
        searchFields={searchFields}
        defaultSort={defaultSort || "code"}
        expand={expand}
        exportName={collection}
        exportTitle={title}
        exportPermission={exportPermission}
        onRowClick={canManage ? (r) => open(r) : undefined}
        rowActions={canManage ? () => [{ label: "Edit", icon: Pencil, onSelect: (r: any) => open(r) }] : undefined}
        refreshKey={refresh}
        importConfig={importConfig}
        empty={{ icon, title: `No ${itemLabel}s yet`, text: canManage ? `No ${itemLabel}s yet. Add the first one with New ${itemLabel}.` : `Finance has not set up any ${itemLabel}s yet.` }}
      />
      <Modal
        open={Boolean(editing)}
        onClose={busy ? () => undefined : () => setEditing(null)}
        size="lg"
        title={editing?.id ? `Edit ${itemLabel}` : `New ${itemLabel}`}
        description={editing?.id ? "Changes are recorded in the audit log." : "Saved records cannot be deleted; deactivate them instead."}
        footer={
          <>
            <Button onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={busy}>{editing?.id ? "Save changes" : `Create ${itemLabel}`}</Button>
          </>
        }
      >
        {sections.map((s) => (
          <ModalSection key={s.title} title={s.title}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {s.fields.map((f) => {
                const id = `md-${f.name}`;
                const err = fieldError(f);
                return (
                  <Field key={f.name} label={f.label} required={f.required} hint={f.hint} error={err} htmlFor={id} className={cn(!f.half && f.type !== "bool" && "sm:col-span-2")}>
                    {f.type === "textarea" ? (
                      <Textarea id={id} value={editing?.[f.name] || ""} onChange={(e) => set(f.name, e.target.value)} placeholder={f.placeholder} invalid={Boolean(err)} />
                    ) : f.type === "select" ? (
                      <Select id={id} value={editing?.[f.name] || ""} onChange={(e) => set(f.name, e.target.value)} invalid={Boolean(err)}>
                        {!f.required ? <option value="">None</option> : <option value="">Choose…</option>}
                        {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    ) : f.type === "relation" ? (
                      <RelationSelect f={f} id={id} invalid={Boolean(err)} value={editing?.[f.name] || ""} onChange={(v) => set(f.name, v)} />
                    ) : f.type === "bool" ? (
                      <Checkbox id={id} label={f.placeholder || "Yes"} checked={Boolean(editing?.[f.name])} onChange={(v) => set(f.name, v)} className="min-h-[42px] items-center" />
                    ) : f.type === "date" ? (
                      <DatePicker id={id} value={editing?.[f.name] || ""} onChange={(v) => set(f.name, v)} invalid={Boolean(err)} clearable={!f.required} />
                    ) : f.type === "money" ? (
                      <MoneyInput id={id} value={editing?.[f.name] ?? ""} onChange={(v) => set(f.name, v)} invalid={Boolean(err)} placeholder={f.placeholder} />
                    ) : (
                      <Input
                        id={id}
                        type={f.type === "number" ? "number" : "text"}
                        value={editing?.[f.name] ?? ""}
                        onChange={(e) => set(f.name, f.upper ? e.target.value.toUpperCase() : e.target.value)}
                        placeholder={f.placeholder}
                        invalid={Boolean(err)}
                        className={cn(f.type === "number" && "text-right tabular-nums", f.upper && "font-mono")}
                      />
                    )}
                  </Field>
                );
              })}
            </div>
          </ModalSection>
        ))}
      </Modal>
    </Page>
  );
}
