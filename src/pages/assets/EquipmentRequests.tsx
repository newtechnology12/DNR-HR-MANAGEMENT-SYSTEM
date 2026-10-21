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
import { showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { Field, inputCls, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";

const STATUS = { pending: { label: "Waiting", tone: "warning" as const }, approved: { label: "Given", tone: "success" as const }, rejected: { label: "Declined", tone: "danger" as const } };

export default function EquipmentRequests() {
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const [deciding, setDeciding] = React.useState<any | null>(null);
  const [refresh, setRefresh] = React.useState(0);
  const view = params.get("view") || "pending";
  const views: RecordView[] = [
    { key: "pending", label: "Waiting", filter: 'status = "pending"' },
    { key: "all", label: "All" },
    { key: "approved", label: "Given", filter: 'status = "approved"' },
    { key: "rejected", label: "Declined", filter: 'status = "rejected"' },
  ];
  const decide = can(["manage_fixed_assets", "reject_or_approve_assets_requests"]);
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Equipment requests"
        description="Staff ask for a type of equipment; the Store & Asset Officer gives a specific asset from the store of the requester's department — it is then in their care — or declines with a reason."
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Equipment requests", link: "/dashboard/assets/requests" }]}
      />
      <RecordTable<any>
        collection="assets_requests"
        expand="requested_by,requested_by.department,asset_type,asset,approved_by,rejected_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "pending" ? {} : { view: v })}
        searchFields={["notes", "requested_by.name", "asset_type.name"]}
        defaultSort="-created"
        refreshKey={refresh}
        exportName="equipment-requests"
        exportTitle="Equipment requests"
        exportPermission={["export_assets", "manage_fixed_assets"]}
        onRowClick={(r) => decide && r.status === "pending" && setDeciding(r)}
        empty={{ icon: Laptop, title: "No request", text: "Staff ask for equipment from My workspace → Equipment." }}
        columns={[
          { key: "date", header: "Asked", sortField: "created", format: "date", csv: (r) => showDay(r.created), cell: (r) => <span className="whitespace-nowrap text-[12.5px] text-slate-600">{showDay(r.created)}</span> },
          { key: "who", header: "Requested by", csv: (r) => r.expand?.requested_by?.name || "", cell: (r) => <span className="block min-w-[160px]"><span className="block font-medium text-slate-900">{r.expand?.requested_by?.name}</span><span className="block text-[12px] text-slate-500">{r.expand?.requested_by?.expand?.department?.name}</span></span> },
          { key: "what", header: "Equipment", csv: (r) => r.expand?.asset_type?.name || r.expand?.asset?.name || "", cell: (r) => <span className="block min-w-[200px]"><span className="block font-medium text-slate-800">{r.expand?.asset_type?.name || r.expand?.asset?.name || "Equipment"}</span><span className="block max-w-[320px] truncate text-[12px] text-slate-500" title={r.notes}>{r.notes}</span></span> },
          { key: "given", header: "Given / answer", csv: (r) => (r.status === "approved" ? `${r.expand?.asset?.code || ""} ${r.expand?.asset?.name || ""}` : r.rejected_reason || ""), cell: (r) => r.status === "approved" ? <span className="text-[12.5px]"><span className="font-mono text-[11.5px] text-slate-500">{r.expand?.asset?.code}</span> {r.expand?.asset?.name}</span> : r.status === "rejected" ? <span className="block max-w-[260px] truncate text-[12.5px] text-slate-600" title={r.rejected_reason}>{r.rejected_reason}</span> : decide ? <Button size="sm" variant="outline" onClick={(e) => { e.stopPropagation(); setDeciding(r); }}>Answer</Button> : <span className="text-slate-400">—</span> },
          { key: "status", header: "Status", sortField: "status", csv: (r) => STATUS[r.status as keyof typeof STATUS]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={STATUS} /> },
        ]}
      />
      {deciding && <DecideDialog request={deciding} onClose={() => setDeciding(null)} onDone={() => { setDeciding(null); setRefresh((n) => n + 1); }} />}
    </div>
  );
}

function DecideDialog({ request, onClose, onDone }: { request: any; onClose: () => void; onDone: () => void }) {
  const who = request.expand?.requested_by;
  const dept = who?.department;
  const [mode, setMode] = React.useState<"approve" | "reject">("approve");
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
      toast.success(mode === "approve" ? `Given to ${who?.name} — it is now in their care` : "Request declined");
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>{request.expand?.asset_type?.name || "Equipment"} for {who?.name}</DialogTitle>
          <DialogDescription>{who?.expand?.department?.name} · asked {showDay(request.created)}: “{request.notes}”</DialogDescription>
        </DialogHeader>
        <div className="flex gap-2">
          {(["approve", "reject"] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)} className={cn("flex h-9 flex-1 items-center justify-center gap-1.5 rounded-md border text-[13px] font-medium", mode === m ? (m === "approve" ? "border-emerald-400 bg-emerald-50 text-emerald-800" : "border-red-300 bg-red-50 text-red-800") : "border-slate-200 text-slate-600")}>
              {m === "approve" ? <><Check size={14} /> Give an asset</> : <><X size={14} /> Decline</>}
            </button>
          ))}
        </div>
        {mode === "approve" ? (
          <div className="space-y-3">
            <Field label="Asset" required hint={(stock.data || []).length ? "In the store of the requester's department" : options.length ? "No asset of that type in store — other assets of the department" : "Nothing in the store of this department: transfer one first, or buy one"}>
              <select className={inputCls} value={asset} onChange={(e) => setAsset(e.target.value)}><option value="">Choose…</option>{options.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select>
            </Field>
            <Field label="Location"><input className={inputCls} value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Where it will be used" /></Field>
            <Field label="Note to the requester"><textarea className={cn(textareaCls, "min-h-[60px]")} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="e.g. Collect it at the store with your ID" /></Field>
          </div>
        ) : (
          <Field label="Why" required><textarea className={cn(textareaCls, "min-h-[80px]")} value={comment} onChange={(e) => setComment(e.target.value)} /></Field>
        )}
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || (mode === "approve" ? !asset : comment.trim().length < 5)} onClick={save}>{mode === "approve" ? "Give the asset" : "Decline"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
