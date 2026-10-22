/**
 * Fixed assets → Asset counts: periodic physical verification. The Store & Asset Officer starts a count (whole
 * register, a department or a location), records each asset as found, found elsewhere, damaged or missing, then
 * completes it: missing assets become lost and the register is reconciled with the GL.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ClipboardCheck, ExternalLink, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { assetsApi } from "@/lib/assets";
import type { Tone } from "@/lib/procurement";
import { errorMessage } from "@/lib/procurement";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn } from "@/components/enterprise/RecordTable";
import { Button, DatePicker, DocNo, Field, Input, Modal, Page, PageHeader, Person, Select, Textarea, fmtDate, fmtNumber, statusText } from "@/components/ims";
import { cn } from "@/utils";

/** A count is a document: counting is "In progress", then "Completed" (or "Cancelled"). */
const COUNT_STATUS: Record<string, { label: string; tone: Tone; note?: string }> = {
  open: { label: "In progress", tone: "info", note: "Counting" },
  completed: { label: "Completed", tone: "success", note: "Register updated" },
  cancelled: { label: "Cancelled", tone: "danger" },
};

export default function AssetCounts() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [starting, setStarting] = React.useState(false);
  const manage = can("manage_fixed_assets");
  const open = (r: any) => navigate(`/dashboard/assets/counts/${r.id}`);

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Count", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
    {
      key: "title",
      header: "Title",
      sortField: "title",
      clamp: true,
      csv: (r) => r.title,
      cell: (r) => <span className="font-semibold">{r.title}</span>,
      sub: (r) => [r.expand?.department?.name, r.location].filter(Boolean).join(" · ") || "Whole register",
    },
    { key: "as_of", header: "Count date", sortField: "as_of", nowrap: true, format: "date", csv: (r) => (r.as_of ? r.as_of.slice(0, 10) : ""), cell: (r) => fmtDate(r.as_of) },
    {
      key: "result",
      header: "Result",
      nowrap: true,
      csv: (r) => (r.summary ? `${r.summary.total} counted, ${r.summary.missing} missing, ${r.summary.damaged} damaged` : ""),
      cell: (r) =>
        r.summary ? (
          <span>
            {fmtNumber(r.summary.total)} counted · <span className={cn(r.summary.missing && "font-semibold text-ims-danger")}>{fmtNumber(r.summary.missing)} missing</span> ·{" "}
            <span className={cn(r.summary.damaged && "font-semibold text-ims-warning")}>{fmtNumber(r.summary.damaged)} damaged</span>
          </span>
        ) : (
          <span className="text-ims-muted">Counting</span>
        ),
    },
    { key: "by", header: "Counted by", className: "max-w-[180px]", csv: (r) => r.expand?.started_by?.name || "", cell: (r) => <Person name={r.expand?.started_by?.name} /> },
    { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(COUNT_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={COUNT_STATUS} /> },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Fixed assets", to: "/dashboard/assets" }, { label: "Asset counts" }]}
        title="Asset counts"
        subtitle="Physical verification of the register with the asset tags, reconciled with the general ledger."
        primary={manage ? { label: "Start a count", icon: Plus, onClick: () => setStarting(true) } : undefined}
      />
      <RecordTable<any>
        collection="asset_verifications"
        expand="department,started_by,completed_by"
        searchFields={["number", "title", "location"]}
        searchPlaceholder="Search number, title or location"
        filters={[{ field: "status", label: "Status", options: Object.entries(COUNT_STATUS).map(([value, m]) => ({ value, label: statusText(m) })) }]}
        defaultSort="-as_of"
        exportName="asset-counts"
        exportTitle="Asset counts"
        exportPermission={["export_assets", "view_fixed_assets"]}
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: ClipboardCheck,
          title: "No count yet",
          text: "No count yet. The Store & Asset Officer starts a count; Internal Audit may observe it.",
          action: manage ? <Button variant="primary" icon={Plus} onClick={() => setStarting(true)}>Start a count</Button> : undefined,
        }}
        columns={columns}
      />
      {starting && <StartDialog onClose={() => setStarting(false)} onDone={(id) => navigate(`/dashboard/assets/counts/${id}`)} />}
    </Page>
  );
}

function StartDialog({ onClose, onDone }: { onClose: () => void; onDone: (id: string) => void }) {
  const depts = useQuery(["departments-list"], () => pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }));
  const [v, setV] = React.useState({ title: "", as_of: new Date().toISOString().slice(0, 10), department: "", location: "", notes: "" });
  const [busy, setBusy] = React.useState(false);
  const start = async () => {
    setBusy(true);
    try {
      const r = await assetsApi.startCount(v);
      toast.success(`${r.number} started. The count sheet lists every asset in scope.`);
      onDone(r.id);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Start an asset count"
      description="Every asset in the scope is put on the count sheet with where it should be and who should hold it."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={start} loading={busy} disabled={v.title.trim().length < 5}>Start the count</Button>
        </>
      }
    >
      <Field label="Title" required htmlFor="ct-title" hint="At least 5 characters">
        <Input id="ct-title" value={v.title} onChange={(e) => setV((x) => ({ ...x, title: e.target.value }))} placeholder="e.g. Year-end count June 2027, head office" />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Count date" required htmlFor="ct-date">
          <DatePicker id="ct-date" value={v.as_of} max={new Date().toISOString().slice(0, 10)} onChange={(x) => setV((y) => ({ ...y, as_of: x }))} />
        </Field>
        <Field label="Department" htmlFor="ct-dept" hint="Leave empty to count the whole register">
          <Select id="ct-dept" value={v.department} onChange={(e) => setV((x) => ({ ...x, department: e.target.value }))}>
            <option value="">All departments</option>
            {((depts.data || []) as any[]).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Location contains" htmlFor="ct-location" hint="e.g. “2nd floor” to count one floor">
        <Input id="ct-location" value={v.location} onChange={(e) => setV((x) => ({ ...x, location: e.target.value }))} />
      </Field>
      <Field label="Notes" htmlFor="ct-notes">
        <Textarea id="ct-notes" className="min-h-[72px]" value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} placeholder="Who counts, who observes" />
      </Field>
    </Modal>
  );
}
