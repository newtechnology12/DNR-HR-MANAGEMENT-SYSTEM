/**
 * Setup → Approval limits: the highest amount each role may approve per document type.
 * Workflow steps marked "above the limit of <role>" (e.g. Secretary General above the DAF limit)
 * use this table, so Finance changes a limit here — never in code.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Info, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { DOCUMENT_TYPE_LABELS, rwf } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ImportButton } from "@/components/enterprise/ExcelImport";
import { IMPORTS } from "@/lib/importConfigs";
import { Field, FormBlock, FormDialog, inputCls, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";

export default function ApprovalLimits() {
  const { can } = usePermissions();
  const canManage = can("manage_approval_workflows");
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const q = useQuery(["approval-limits"], async () => {
    const [limits, roles] = await Promise.all([
      pocketbase.collection("approval_limits").getFullList({ sort: "document_type", expand: "role" }),
      pocketbase.collection("roles").getFullList({ sort: "sort_order", fields: "id,name,code" }),
    ]);
    return { limits, roles };
  });

  async function save() {
    if (!editing?.role) return toast.error("Choose a role.");
    setBusy(true);
    const data = { role: editing.role, document_type: editing.document_type || "", min_amount: 0, max_amount: Math.round(Number(editing.max_amount) || 0), active: Boolean(editing.active), notes: editing.notes || "" };
    try {
      if (editing.id) await pocketbase.collection("approval_limits").update(editing.id, data);
      else await pocketbase.collection("approval_limits").create(data);
      toast.success("Approval limit saved");
      setEditing(null);
      queryClient.invalidateQueries(["approval-limits"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function remove(id: string) {
    try {
      await pocketbase.collection("approval_limits").delete(id);
      toast.success("Limit removed");
      queryClient.invalidateQueries(["approval-limits"]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }

  const limits: any[] = q.data?.limits || [];
  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: "Approval limits", rows: limits, format, what: "approval_limits",
      columns: [
        { header: "Role", value: (r: any) => r.expand?.role?.name || "" },
        { header: "Document type", value: (r: any) => (r.document_type ? DOCUMENT_TYPE_LABELS[r.document_type] || r.document_type : "All documents") },
        { header: "Maximum (RWF)", value: (r: any) => (r.max_amount ? Number(r.max_amount).toLocaleString("en-US") : "No limit") },
        { header: "Active", value: (r: any) => (r.active ? "Yes" : "No") },
        { header: "Notes", value: (r: any) => r.notes || "" },
      ],
    });

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Approval limits"
        description="How much each role may approve on its own. Above the limit, the next level (e.g. the Secretary General) must also approve."
        breadcrumbs={[{ title: "Setup", link: "#" }, { title: "Approval limits", link: "/dashboard/setup/approval-limits" }]}
        actions={
          <>
            <ExportMenu onExport={doExport} permission={["view_master_data", "view_security_admin"]} disabled={!limits.length} />
            <ImportButton config={IMPORTS.approvalLimits} size="default" />
            {canManage && <Button onClick={() => setEditing({ document_type: "purchase_order", active: true, max_amount: "" })}><Plus size={15} /> New limit</Button>}
          </>
        }
      />
      <p className="flex items-start gap-2 rounded-lg border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-[12.5px] leading-relaxed text-blue-900">
        <Info size={14} className="mt-0.5 shrink-0" />
        A workflow step such as “Secretary General (above DAF limit)” only applies when the document amount is higher than the DAF limit for that document type. If no limit is set, the step always applies.
      </p>
      <Panel bodyClassName="px-0 pb-0">
        {q.isLoading ? (
          <div className="p-4"><ListSkeleton rows={5} /></div>
        ) : !limits.length ? (
          <EmptyState icon={Scale} title="No approval limits" text="Every conditional step applies until limits are set." />
        ) : (
          <div className="overflow-x-auto">
            <table className="dnr-grid w-full min-w-[640px]">
              <thead><tr><th>Role</th><th>Document type</th><th className="text-right">May approve up to</th><th>Status</th><th>Notes</th>{canManage && <th />}</tr></thead>
              <tbody>
                {limits.map((r) => (
                  <tr key={r.id} className={cn(!r.active && "opacity-60")}>
                    <td className="font-medium text-slate-900">{r.expand?.role?.name}</td>
                    <td>{r.document_type ? DOCUMENT_TYPE_LABELS[r.document_type] || r.document_type : <span className="text-slate-500">All documents</span>}</td>
                    <td className="text-right text-[14px] font-semibold tabular-nums text-slate-900">{r.max_amount ? rwf(r.max_amount) : <Badge tone="info">No limit</Badge>}</td>
                    <td><Badge tone={r.active ? "success" : "neutral"}>{r.active ? "Active" : "Inactive"}</Badge></td>
                    <td className="max-w-xs truncate text-[12.5px] text-slate-500" title={r.notes}>{r.notes || "—"}</td>
                    {canManage && (
                      <td className="text-right">
                        <span className="inline-flex gap-0.5">
                          <button type="button" onClick={() => setEditing({ ...r })} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700" aria-label="Edit"><Pencil size={14} /></button>
                          <button type="button" onClick={() => remove(r.id)} className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 size={14} /></button>
                        </span>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <FormDialog open={Boolean(editing)} onClose={() => setEditing(null)} icon={Scale} title={editing?.id ? "Edit approval limit" : "New approval limit"} description="Changes are audited and apply to documents submitted from now on." submitLabel="Save limit" busy={busy} onSubmit={save}>
        {editing && (
          <FormBlock icon={Scale} title="Limit">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Role" required>
                <select value={editing.role || ""} onChange={(e) => setEditing({ ...editing, role: e.target.value })} className={inputCls}>
                  <option value="">Choose…</option>
                  {(q.data?.roles || []).filter((r: any) => !["SYS_ADMIN", "INTERNAL_AUDITOR", "MGMT_VIEWER", "STAFF"].includes(r.code)).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </Field>
              <Field label="Document type">
                <select value={editing.document_type || ""} onChange={(e) => setEditing({ ...editing, document_type: e.target.value })} className={inputCls}>
                  <option value="">All documents</option>
                  {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </Field>
              <Field label="Maximum amount (RWF)" hint="0 or empty = no upper limit">
                <input type="number" min={0} step={1} value={editing.max_amount ?? ""} onChange={(e) => setEditing({ ...editing, max_amount: e.target.value })} className={cn(inputCls, "text-right tabular-nums")} />
              </Field>
              <label className="mt-7 flex items-center gap-2.5 text-[13.5px] text-slate-700"><input type="checkbox" checked={Boolean(editing.active)} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-primary" /> Active</label>
              <Field label="Notes" className="sm:col-span-2"><textarea value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className={textareaCls} /></Field>
            </div>
          </FormBlock>
        )}
      </FormDialog>
    </div>
  );
}
