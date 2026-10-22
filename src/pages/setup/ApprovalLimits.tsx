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
import { DOCUMENT_TYPE_LABELS } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ImportButton } from "@/components/enterprise/ExcelImport";
import { IMPORTS } from "@/lib/importConfigs";
import {
  Button,
  Card,
  Checkbox,
  Column,
  ConfirmDialog,
  DataTable,
  EmptyState,
  Field,
  Modal,
  MoneyInput,
  Num,
  Page,
  PageHeader,
  Select,
  StatusPill,
  Textarea,
} from "@/components/ims";

export default function ApprovalLimits() {
  const { can } = usePermissions();
  const canManage = can("manage_approval_workflows");
  const queryClient = useQueryClient();
  const [editing, setEditing] = React.useState<any>(null);
  const [removing, setRemoving] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);
  const q = useQuery(["approval-limits"], async () => {
    const [limits, roles] = await Promise.all([
      pocketbase.collection("approval_limits").getFullList({ sort: "document_type", expand: "role" }),
      pocketbase.collection("roles").getFullList({ sort: "sort_order", fields: "id,name,code" }),
    ]);
    return { limits, roles };
  });

  async function save() {
    setTried(true);
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
      throw e;
    }
  }

  const limits: any[] = q.data?.limits || [];
  const typeLabel = (r: any) => (r.document_type ? DOCUMENT_TYPE_LABELS[r.document_type] || r.document_type : "All documents");
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

  const openNew = () => { setTried(false); setEditing({ document_type: "purchase_order", active: true, max_amount: "" }); };
  const openEdit = (r: any) => { setTried(false); setEditing({ ...r }); };

  const columns: Column<any>[] = [
    { key: "role", header: "Role", cell: (r) => <span className="font-semibold">{r.expand?.role?.name || "—"}</span> },
    { key: "type", header: "Document type", cell: (r) => (r.document_type ? typeLabel(r) : <span className="text-ims-muted">All documents</span>) },
    { key: "max", header: "May approve up to (RWF)", numeric: true, cell: (r) => (r.max_amount ? <Num value={r.max_amount} /> : <span className="text-ims-muted">No limit</span>) },
    { key: "status", header: "Status", cell: (r) => <StatusPill status={r.active ? "Active" : "Inactive"} /> },
    { key: "notes", header: "Notes", clamp: true, cell: (r) => r.notes || <span className="text-ims-faint">—</span> },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Setup" }, { label: "Approval limits" }]}
        title="Approval limits"
        subtitle="How much each role may approve on its own, per document type."
        actions={
          <>
            <ExportMenu onExport={doExport} permission={["view_master_data", "view_security_admin"]} disabled={!limits.length} />
            <ImportButton config={IMPORTS.approvalLimits} size="default" />
          </>
        }
        primary={canManage ? { label: "New limit", icon: Plus, onClick: openNew } : undefined}
      />
      <p className="flex items-start gap-2 rounded-control bg-ims-info-bg px-3.5 py-2.5 text-t-small text-ims-info">
        <Info size={15} className="mt-px shrink-0" aria-hidden />
        <span>A workflow step such as “Secretary General (above DAF limit)” only applies when the document amount is higher than the DAF limit for that document type. If no limit is set, the step always applies.</span>
      </p>
      <Card padded={false} className="overflow-hidden">
        <DataTable
          columns={columns}
          rows={limits}
          rowKey={(r) => r.id}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={720}
          caption="Approval limits"
          rowClassName={(r) => !r.active && "text-ims-muted"}
          onRowClick={canManage ? openEdit : undefined}
          rowActions={
            canManage
              ? () => [
                  { label: "Edit", icon: Pencil, onSelect: openEdit },
                  { label: "Remove", icon: Trash2, danger: true, onSelect: (r) => setRemoving(r) },
                ]
              : undefined
          }
          empty={
            <EmptyState
              icon={Scale}
              text="No approval limits yet. Every conditional step applies until limits are set."
              action={canManage ? <Button variant="primary" icon={Plus} onClick={openNew}>New limit</Button> : undefined}
            />
          }
        />
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        title={editing?.id ? "Edit approval limit" : "New approval limit"}
        description="Changes are audited and apply to documents submitted from now on."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={busy}>Save limit</Button>
          </>
        }
      >
        {editing && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Role" required htmlFor="al-role" error={tried && !editing.role ? "Choose the role this limit applies to." : null}>
              <Select id="al-role" value={editing.role || ""} onChange={(e) => setEditing({ ...editing, role: e.target.value })} invalid={tried && !editing.role}>
                <option value="">Choose…</option>
                {(q.data?.roles || []).filter((r: any) => !["SYS_ADMIN", "INTERNAL_AUDITOR", "MGMT_VIEWER", "STAFF"].includes(r.code)).map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </Select>
            </Field>
            <Field label="Document type" htmlFor="al-type">
              <Select id="al-type" value={editing.document_type || ""} onChange={(e) => setEditing({ ...editing, document_type: e.target.value })}>
                <option value="">All documents</option>
                {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </Field>
            <Field label="Maximum amount" htmlFor="al-max" hint="Leave empty or 0 for no upper limit.">
              <MoneyInput id="al-max" value={editing.max_amount ?? ""} onChange={(v) => setEditing({ ...editing, max_amount: v })} />
            </Field>
            <div className="flex items-end pb-2.5">
              <Checkbox label="Active" checked={Boolean(editing.active)} onChange={(v) => setEditing({ ...editing, active: v })} />
            </div>
            <Field label="Notes" htmlFor="al-notes" className="sm:col-span-2">
              <Textarea id="al-notes" value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
            </Field>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => setRemoving(null)}
        title={`Remove the limit for ${removing?.expand?.role?.name || "this role"}?`}
        description={`${removing ? typeLabel(removing) : ""}: conditional steps that use this limit will always apply until a new limit is set.`}
        confirmLabel="Remove"
        danger
        onConfirm={() => remove(removing.id)}
      />
    </Page>
  );
}
