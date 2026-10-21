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
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { Field, FormBlock, FormDialog, inputCls, textareaCls, toInputDate } from "@/components/portal/kit";
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

function RelationSelect({ f, value, onChange, disabled }: { f: FormFieldDef; value: string; onChange: (v: string) => void; disabled?: boolean }) {
  const q = useQuery(["master-relation", f.collection, f.optionFilter], () => pocketbase.collection(f.collection!).getFullList({ sort: "name", filter: f.optionFilter || "", batch: 500 }), { staleTime: 60_000 });
  return (
    <select value={value || ""} onChange={(e) => onChange(e.target.value)} disabled={disabled} className={inputCls}>
      <option value="">— None —</option>
      {(q.data || []).map((r: any) => (
        <option key={r.id} value={r.id}>
          {f.optionLabel ? f.optionLabel(r) : r.code ? `${r.code} — ${r.name}` : r.name}
        </option>
      ))}
    </select>
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

  const set = (name: string, value: any) => setEditing((s) => ({ ...(s || {}), [name]: value }));
  const editColumn: RecordColumn<T>[] = canManage
    ? [{ key: "_edit", header: "", className: "w-12", cell: (r: any) => (
        <button type="button" onClick={(e) => { e.stopPropagation(); open(r); }} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label={`Edit ${r.name || r.code}`}>
          <Pencil size={14} />
        </button>
      ) }]
    : [];

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title={title}
        description={description}
        breadcrumbs={[{ title: "Setup", link: "#" }, { title, link: "#" }]}
        actions={canManage && <Button onClick={() => open()}><Plus size={15} /> New {itemLabel}</Button>}
      />
      {aside}
      <RecordTable<T>
        collection={collection}
        columns={[...columns, ...editColumn]}
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
        refreshKey={refresh}
        empty={{ icon, title: `No ${itemLabel}s yet`, text: canManage ? `Add the first ${itemLabel}.` : `Finance has not set up any ${itemLabel}s yet.` }}
      />
      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        icon={icon}
        title={editing?.id ? `Edit ${itemLabel}` : `New ${itemLabel}`}
        description={editing?.id ? "Changes are recorded in the audit log." : "Saved records cannot be deleted; deactivate them instead."}
        submitLabel={editing?.id ? "Save changes" : `Create ${itemLabel}`}
        busy={busy}
        onSubmit={save}
      >
        {sections.map((s) => (
          <FormBlock key={s.title} icon={s.icon} title={s.title}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {s.fields.map((f) => (
                <Field key={f.name} label={f.label} required={f.required} hint={f.hint} error={tried && missing(f) ? "Required" : null} className={cn(!f.half && f.type !== "bool" && "sm:col-span-2")}>
                  {f.type === "textarea" ? (
                    <textarea value={editing?.[f.name] || ""} onChange={(e) => set(f.name, e.target.value)} className={textareaCls} placeholder={f.placeholder} />
                  ) : f.type === "select" ? (
                    <select value={editing?.[f.name] || ""} onChange={(e) => set(f.name, e.target.value)} className={inputCls}>
                      {!f.required && <option value="">— None —</option>}
                      {f.options?.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : f.type === "relation" ? (
                    <RelationSelect f={f} value={editing?.[f.name] || ""} onChange={(v) => set(f.name, v)} />
                  ) : f.type === "bool" ? (
                    <label className="flex h-10 items-center gap-2.5 text-[13.5px] text-slate-700">
                      <input type="checkbox" checked={Boolean(editing?.[f.name])} onChange={(e) => set(f.name, e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary focus:ring-primary" />
                      {f.placeholder || "Yes"}
                    </label>
                  ) : (
                    <input
                      type={f.type === "date" ? "date" : f.type === "money" || f.type === "number" ? "number" : "text"}
                      inputMode={f.type === "money" ? "numeric" : undefined}
                      step={f.type === "money" ? 1 : undefined}
                      min={f.type === "money" ? 0 : undefined}
                      value={editing?.[f.name] ?? ""}
                      onChange={(e) => set(f.name, f.upper ? e.target.value.toUpperCase() : e.target.value)}
                      placeholder={f.placeholder}
                      className={cn(inputCls, (f.type === "money" || f.type === "number") && "text-right tabular-nums", f.upper && "font-mono")}
                    />
                  )}
                </Field>
              ))}
            </div>
          </FormBlock>
        ))}
      </FormDialog>
    </div>
  );
}
