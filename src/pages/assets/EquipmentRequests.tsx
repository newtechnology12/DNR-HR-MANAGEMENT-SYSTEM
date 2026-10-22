/**
 * Fixed assets → Equipment requests: staff ask for a type of equipment (a laptop, a tablet…); the Store & Asset
 * Officer gives a specific asset from the store of the requester's department, or declines with a reason.
 */
import * as React from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { Check, Laptop, X } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { assetsApi } from "@/lib/assets";
import type { Tone } from "@/lib/procurement";
import { errorMessage } from "@/lib/procurement";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { Button, Field, Input, Modal, Page, PageHeader, Person, Select, Textarea, fmtDate, statusText } from "@/components/ims";
import { cn } from "@/utils";

const STATUS: Record<string, { label: string; tone: Tone; note?: string }> = {
  pending: { label: "Pending approval", tone: "warning", note: "With the store" },
  approved: { label: "Approved", tone: "success", note: "Asset given" },
  rejected: { label: "Rejected", tone: "danger", note: "Declined" },
};

type Mode = "approve" | "reject";

export default function EquipmentRequests() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [deciding, setDeciding] = React.useState<{ request: any; mode: Mode } | null>(null);
  const [refresh, setRefresh] = React.useState(0);
  const view = params.get("view") || "pending";
  const views: RecordView[] = [
    { key: "pending", label: "Pending approval", filter: 'status = "pending"' },
    { key: "all", label: "All requests" },
    { key: "approved", label: "Given", filter: 'status = "approved"' },
    { key: "rejected", label: "Declined", filter: 'status = "rejected"' },
  ];
  const decide = can(["manage_fixed_assets", "reject_or_approve_assets_requests"]);

  /** Who must act now: the store while it is pending; the requester holds the asset once it is given. */
  const withCell = (r: any) => {
    if (r.status === "pending") return <Person name="Store & Asset Officer" detail="To give an asset or decline" />;
    if (r.status === "approved") return <Person name={r.expand?.requested_by?.name} detail="Holds the asset" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "date", header: "Asked", sortField: "created", nowrap: true, format: "date", csv: (r) => (r.created ? r.created.slice(0, 10) : ""), cell: (r) => fmtDate(r.created) },
    { key: "who", header: "Requested by", className: "max-w-[180px]", csv: (r) => r.expand?.requested_by?.name || "", cell: (r) => <Person name={r.expand?.requested_by?.name} detail={r.expand?.requested_by?.expand?.department?.name} /> },
    {
      key: "what",
      header: "Equipment",
      clamp: true,
      csv: (r) => r.expand?.asset_type?.name || r.expand?.asset?.name || "",
      cell: (r) => <span className="font-semibold">{r.expand?.asset_type?.name || r.expand?.asset?.name || "Equipment"}</span>,
      sub: (r) => r.notes || null,
    },
    {
      key: "given",
      header: "Given or answer",
      clamp: true,
      csv: (r) => (r.status === "approved" ? `${r.expand?.asset?.code || ""} ${r.expand?.asset?.name || ""}` : r.rejected_reason || ""),
      cell: (r) =>
        r.status === "approved" ? (
          r.expand?.asset?.name || "—"
        ) : r.status === "rejected" ? (
          <span className="text-ims-body">{r.rejected_reason || "—"}</span>
        ) : (
          <span className="text-ims-muted">Not answered yet</span>
        ),
      sub: (r) => (r.status === "approved" && r.expand?.asset?.code ? <span className="whitespace-nowrap font-mono">{r.expand.asset.code}</span> : null),
    },
    { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={STATUS} /> },
    { key: "with", header: "With", className: "max-w-[170px]", cell: withCell },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Fixed assets", to: "/dashboard/assets" }, { label: "Equipment requests" }]}
        title="Equipment requests"
        subtitle="Staff requests for equipment: give an asset from the department's store, or decline with a reason."
      />
      <RecordTable<any>
        collection="assets_requests"
        expand="requested_by,requested_by.department,asset_type,asset,approved_by,rejected_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "pending" ? {} : { view: v })}
        searchFields={["notes", "requested_by.name", "asset_type.name"]}
        searchPlaceholder="Search requester, equipment or note"
        defaultSort="-created"
        refreshKey={refresh}
        exportName="equipment-requests"
        exportTitle="Equipment requests"
        exportPermission={["export_assets", "manage_fixed_assets"]}
        onRowClick={(r) => decide && r.status === "pending" && setDeciding({ request: r, mode: "approve" })}
        rowActions={(r) =>
          decide && r.status === "pending"
            ? [
                { label: "Give an asset", icon: Check, onSelect: (x: any) => setDeciding({ request: x, mode: "approve" }) },
                { label: "Decline", icon: X, danger: true, onSelect: (x: any) => setDeciding({ request: x, mode: "reject" }) },
              ]
            : []
        }
        empty={{ icon: Laptop, title: "No request", text: view === "pending" ? "No request is waiting for an answer." : "No requests yet. Staff ask for equipment from My workspace, under Equipment." }}
        columns={columns}
      />
      {deciding && <DecideDialog request={deciding.request} initialMode={deciding.mode} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); setRefresh((n) => n + 1); }} />}
    </Page>
  );
}

function DecideDialog({ request, initialMode = "approve", onClose, onDone }: { request: any; initialMode?: Mode; onClose: () => void; onDone: () => void }) {
  const who = request.expand?.requested_by;
  const dept = who?.department;
  const [mode, setMode] = React.useState<Mode>(initialMode);
  const [asset, setAsset] = React.useState("");
  const [location, setLocation] = React.useState("");
  const [comment, setComment] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const stock = useQuery(["request-stock", dept, request.asset_type], () => pocketbase.collection("assets").getFullList({
    filter: `status = "in_stock" && assigned_to = "" && department = "${dept}"${request.asset_type ? ` && type = "${request.asset_type}"` : ""}`, sort: "code",
  }), { enabled: Boolean(dept) });
  const anyType = useQuery(["request-stock-any", dept], () => pocketbase.collection("assets").getFullList({ filter: `status = "in_stock" && assigned_to = "" && department = "${dept}"`, sort: "code" }), { enabled: Boolean(dept) && !(stock.data || []).length && !stock.isLoading });
  const options = ((stock.data || []).length ? stock.data : anyType.data || []) as any[];
  const save = async () => {
    setBusy(true);
    try {
      await assetsApi.decideRequest(request.id, mode === "approve" ? { decision: "approve", asset, location_name: location, comment } : { decision: "reject", comment });
      toast.success(mode === "approve" ? `Asset given to ${who?.name}. It is now in their care.` : `Request from ${who?.name} declined`);
      onDone();
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
      title={`${request.expand?.asset_type?.name || "Equipment"} for ${who?.name || "a staff member"}`}
      description={`${who?.expand?.department?.name || "No department"} · asked ${fmtDate(request.created)}${request.notes ? `: “${request.notes}”` : ""}`}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant={mode === "approve" ? "primary" : "danger"} onClick={save} loading={busy} disabled={mode === "approve" ? !asset : comment.trim().length < 5}>
            {mode === "approve" ? "Give the asset" : "Decline"}
          </Button>
        </>
      }
    >
      <div role="radiogroup" aria-label="Answer" className="grid grid-cols-2 gap-2">
        {(["approve", "reject"] as const).map((m) => {
          const on = mode === m;
          return (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setMode(m)}
              className={cn(
                "flex h-button items-center justify-center gap-1.5 rounded-control border text-t-body font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus",
                on ? (m === "approve" ? "border-ims-success/50 bg-ims-success-bg text-ims-success" : "border-ims-danger/40 bg-ims-danger-bg text-ims-danger") : "border-ims-field bg-ims-card text-ims-body hover:bg-ims-subtle"
              )}
            >
              {m === "approve" ? <><Check size={16} aria-hidden /> Give an asset</> : <><X size={16} aria-hidden /> Decline</>}
            </button>
          );
        })}
      </div>
      {mode === "approve" ? (
        <>
          <Field
            label="Asset"
            required
            htmlFor="eq-asset"
            hint={(stock.data || []).length ? "In the store of the requester's department" : options.length ? "No asset of that type in store. These are other assets of the department." : "Nothing in the store of this department. Transfer one first, or buy one."}
          >
            <Select id="eq-asset" value={asset} onChange={(e) => setAsset(e.target.value)}>
              <option value="">Choose…</option>
              {options.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </Select>
          </Field>
          <Field label="Location" htmlFor="eq-location">
            <Input id="eq-location" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where it will be used" />
          </Field>
          <Field label="Note to the requester" htmlFor="eq-note">
            <Textarea id="eq-note" className="min-h-[72px]" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Collect it at the store with your ID" />
          </Field>
        </>
      ) : (
        <Field label="Why" required htmlFor="eq-why" hint="At least 5 characters. The requester sees this.">
          <Textarea id="eq-why" className="min-h-[88px]" value={comment} onChange={(e) => setComment(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}
