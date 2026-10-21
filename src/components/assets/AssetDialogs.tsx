/**
 * Dialogs of the fixed asset register: the asset card (register / capitalise), custodian and location, status,
 * transfer to another department, maintenance and disposal. Every action goes through the assets API.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { ACQUISITION, ASSET_STATUS, CONDITIONS, DEPRECIATION_METHODS, DISPOSAL_METHODS, MAINTENANCE_KINDS, assetsApi, money } from "@/lib/assets";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, inputCls, textareaCls } from "@/components/portal/kit";
import { MoneyInput } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);
const day = (v?: string) => String(v || "").slice(0, 10);
const monthAfter = (d: string) => {
  if (!d) return "";
  const x = new Date(`${d.slice(0, 7)}-01T12:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + 1);
  return x.toISOString().slice(0, 10);
};

/** Reference lists used by the dialogs (cached). */
export function useAssetRefs() {
  return useQuery(["asset-refs"], async () => {
    const [categories, types, departments, funds, projects, users, suppliers] = await Promise.all([
      pocketbase.collection("assets_categories").getFullList({ sort: "sort,name" }),
      pocketbase.collection("assets_types").getFullList({ sort: "name", fields: "id,name,category" }),
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name,code" }),
      pocketbase.collection("funding_sources").getFullList({ sort: "code", fields: "id,code,name", filter: "active = true" }),
      pocketbase.collection("projects").getFullList({ sort: "code", fields: "id,code,name,funding_source" }),
      pocketbase.collection("users").getFullList({ sort: "name", fields: "id,name,department", filter: 'status = "Active"' }),
      pocketbase.collection("suppliers").getFullList({ sort: "name", fields: "id,name", filter: 'status = "active" || status = "approved"' }).catch(() => [] as any[]),
    ]);
    return { categories, types, departments, funds, projects, users, suppliers } as Record<string, any[]>;
  }, { staleTime: 300_000 });
}

function useSave(fn: () => Promise<unknown>, done: string, onDone: () => void) {
  const [busy, setBusy] = React.useState(false);
  const run = async () => {
    setBusy(true);
    try {
      await fn();
      toast.success(done);
      onDone();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, run };
}

function Shell({ title, description, children, footer, onClose, wide }: { title: string; description?: React.ReactNode; children: React.ReactNode; footer: React.ReactNode; onClose: () => void; wide?: boolean }) {
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className={cn("max-h-[92vh] overflow-y-auto bg-white", wide ? "max-w-2xl" : "max-w-lg")}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        <div className="space-y-3">{children}</div>
        <DialogFooter className="gap-2">{footer}</DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ------------------------------------------------------------------ asset card: register a new asset or capitalise one received
export function AssetCardDialog({ asset, onClose, onSaved }: { asset?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const refs = useAssetRefs();
  const fromGrn = Boolean(asset?.goods_receipt);
  const [v, setV] = React.useState<any>({
    name: asset?.name || "", description: asset?.description || "", category: asset?.category || "", type: asset?.type || "", department: asset?.department || "",
    location_name: asset?.location_name || "", assigned_to: asset?.assigned_to || "", funding_source: asset?.funding_source || "", project: asset?.project || "",
    serial_number: asset?.serial_number || "", condition: asset?.condition || "new", cost: asset ? Math.round(asset.cost || 0) : ("" as number | ""),
    purchased_at: day(asset?.purchased_at) || today(), depreciation_start: "", residual_value: "" as number | "", useful_life_months: "", acquisition_type: "purchase",
    supplier: asset?.supplier || "", warranty: asset?.warranty || "",
  });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((x: any) => ({ ...x, [k]: e.target.value }));
  const r = refs.data || {};
  const cat = (r.categories || []).find((c: any) => c.id === v.category);
  const types = (r.types || []).filter((t: any) => t.category === v.category);
  const people = (r.users || []).filter((u: any) => !v.department || u.department === v.department);
  const projects = (r.projects || []).filter((p: any) => !v.funding_source || p.funding_source === v.funding_source);
  const cost = Number(v.cost) || 0;
  const below = cat && cat.capitalisation_threshold && cost > 0 && cost < cat.capitalisation_threshold;
  const start = v.depreciation_start || monthAfter(v.purchased_at);
  const life = Number(v.useful_life_months) || cat?.useful_life_months || 0;
  const residual = v.residual_value === "" ? Math.round((cost * (cat?.residual_percent || 0)) / 100) : Number(v.residual_value);
  const monthly = cat && (v.method || cat.method) !== "none" && life ? Math.round((cost - residual) / life) : 0;
  const ready = v.name.trim().length >= 3 && v.category && v.department && cost > 0 && !below;
  const body = () => ({ ...v, cost, residual_value: v.residual_value === "" ? "" : Number(v.residual_value), useful_life_months: v.useful_life_months || "" });
  const save = useSave(
    async () => {
      const res = asset ? await assetsApi.act(asset.id, "capitalise", body()) : await assetsApi.register(body());
      onSaved(res.id);
    },
    asset ? `${asset.code} is in the register — posted to the general ledger` : "Asset registered and posted to the general ledger",
    () => undefined
  );
  return (
    <Shell
      wide
      onClose={onClose}
      title={asset ? `Asset card — ${asset.code}` : "Register an asset"}
      description={asset ? "Complete the card to put the asset in the register. Its cost is posted to the category's asset account (Dr) against assets received not yet invoiced (Cr)." : "For an asset bought outside a purchase order or donated. It is registered and posted to the general ledger at once."}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!ready || save.busy} onClick={save.run}>{save.busy ? "Saving…" : asset ? "Capitalise" : "Register and capitalise"}</Button></>}
    >
      {refs.isLoading ? <p className="py-10 text-center text-[13px] text-slate-500">Loading categories, departments and staff…</p> : <>
      <Field label="Description" required><input className={inputCls} value={v.name} maxLength={200} onChange={set("name")} placeholder="e.g. Dell Latitude 5440 laptop" /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Category" required hint={cat ? `${DEPRECIATION_METHODS[cat.method] || "—"} over ${cat.useful_life_months ? `${cat.useful_life_months / 12} years` : "—"}${cat.residual_percent ? `, ${cat.residual_percent}% residual` : ""} · threshold RWF ${money(cat.capitalisation_threshold)}` : undefined}>
          <select className={inputCls} value={v.category} onChange={(e) => setV((x: any) => ({ ...x, category: e.target.value, type: "" }))}>
            <option value="">Choose…</option>
            {(r.categories || []).filter((c: any) => c.method).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </Field>
        <Field label="Type"><select className={inputCls} value={v.type} onChange={set("type")} disabled={!types.length}><option value="">—</option>{types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Department" required><select className={inputCls} value={v.department} onChange={(e) => setV((x: any) => ({ ...x, department: e.target.value, assigned_to: "" }))}><option value="">Choose…</option>{(r.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
        <Field label="Custodian" hint="Someone in that department; leave empty if it stays in the store or is shared"><select className={inputCls} value={v.assigned_to} onChange={set("assigned_to")} disabled={!v.department}><option value="">No custodian</option>{people.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      </div>
      <Field label="Location"><input className={inputCls} value={v.location_name} maxLength={160} onChange={set("location_name")} placeholder="e.g. HQ 2nd floor, finance office" /></Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cost" required hint={fromGrn ? "From the purchase order (VAT included)" : undefined} error={below ? `Below the RWF ${money(cat.capitalisation_threshold)} threshold: an expense, not a fixed asset` : undefined}>
          <MoneyInput value={v.cost} disabled={fromGrn} onChange={(x) => setV((y: any) => ({ ...y, cost: x }))} />
        </Field>
        <Field label="Acquired on" required><input type="date" className={inputCls} value={v.purchased_at} max={today()} disabled={fromGrn} onChange={set("purchased_at")} /></Field>
        <Field label="Depreciation from" hint="Default: the month after"><input type="date" className={inputCls} value={v.depreciation_start || monthAfter(v.purchased_at)} onChange={set("depreciation_start")} /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Funding source" hint="Who paid for it"><select className={inputCls} value={v.funding_source} onChange={(e) => setV((x: any) => ({ ...x, funding_source: e.target.value, project: "" }))}><option value="">Member contributions</option>{(r.funds || []).map((f: any) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}</select></Field>
        <Field label="Project"><select className={inputCls} value={v.project} onChange={set("project")}><option value="">—</option>{projects.map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}</select></Field>
        <Field label="Condition"><select className={inputCls} value={v.condition} onChange={set("condition")}>{Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Serial / plate number"><input className={inputCls} value={v.serial_number} onChange={set("serial_number")} /></Field>
        <Field label="Residual value" hint={cat?.residual_percent ? `Default ${cat.residual_percent}% of cost` : "Default nil"}><MoneyInput value={v.residual_value} onChange={(x) => setV((y: any) => ({ ...y, residual_value: x }))} placeholder={money(residual)} /></Field>
        <Field label="Useful life (months)" hint={cat ? `Category: ${cat.useful_life_months || "—"}` : undefined}><input type="number" min={1} className={inputCls} value={v.useful_life_months} onChange={set("useful_life_months")} placeholder={String(cat?.useful_life_months || "")} /></Field>
      </div>
      {!asset && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Acquired by"><select className={inputCls} value={v.acquisition_type} onChange={set("acquisition_type")}><option value="purchase">{ACQUISITION.purchase}</option><option value="donation">{ACQUISITION.donation} (deferred capital grant)</option></select></Field>
          <Field label="Supplier"><select className={inputCls} value={v.supplier} onChange={set("supplier")}><option value="">—</option>{(r.suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        </div>
      )}
      <Field label="Notes"><textarea className={cn(textareaCls, "min-h-[60px]")} value={v.description} maxLength={1000} onChange={set("description")} placeholder="Specification, warranty, what it is used for" /></Field>
      {monthly > 0 && <p className="rounded-md bg-slate-50 px-3 py-2 text-[12.5px] text-slate-600">Depreciation of about <b>RWF {money(monthly)}</b> a month from {new Date(`${start}T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} for {life} months{residual ? `, down to a residual value of RWF ${money(residual)}` : ""}.</p>}
      </>}
    </Shell>
  );
}

// ------------------------------------------------------------------ custodian and location
export function AssignDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const refs = useAssetRefs();
  const [custodian, setCustodian] = React.useState(asset.assigned_to || "");
  const [location, setLocation] = React.useState(asset.location_name || "");
  const [reason, setReason] = React.useState("");
  const people = ((refs.data?.users || []) as any[]).filter((u) => u.department === asset.department);
  const save = useSave(() => assetsApi.act(asset.id, "assign", { custodian, location_name: location, reason }), custodian ? "Custodian changed" : "Returned to the store", onDone);
  return (
    <Shell
      onClose={onClose}
      title={`Custodian and location — ${asset.code}`}
      description="Within the asset's department. To move it to another department, request a transfer."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.busy || (custodian === (asset.assigned_to || "") && location === (asset.location_name || ""))} onClick={save.run}>Save</Button></>}
    >
      <Field label="Custodian"><select className={inputCls} value={custodian} onChange={(e) => setCustodian(e.target.value)}><option value="">Nobody — back to the store / shared</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
      <Field label="Location"><input className={inputCls} value={location} maxLength={160} onChange={(e) => setLocation(e.target.value)} /></Field>
      <Field label="Reason" hint="Kept in the asset's history"><textarea className={cn(textareaCls, "min-h-[60px]")} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Shell>
  );
}

// ------------------------------------------------------------------ status
export function StatusDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = React.useState("");
  const [reason, setReason] = React.useState("");
  const save = useSave(() => assetsApi.act(asset.id, "status", { status, reason }), "Status changed", onDone);
  return (
    <Shell
      onClose={onClose}
      title={`Change the status — ${asset.code}`}
      description={`Now ${ASSET_STATUS[asset.status]?.label.toLowerCase() || asset.status}. A lost or damaged asset stays in the register until its disposal is approved.`}
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.busy || !status || reason.trim().length < 5} onClick={save.run}>Change status</Button></>}
    >
      <Field label="New status" required>
        <select className={inputCls} value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Choose…</option>
          {["in_use", "in_stock", "under_maintenance", "damaged", "lost"].filter((s) => s !== asset.status).map((s) => <option key={s} value={s}>{ASSET_STATUS[s].label}</option>)}
        </select>
      </Field>
      <Field label="Reason" required><textarea className={cn(textareaCls, "min-h-[70px]")} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened, who reported it" /></Field>
    </Shell>
  );
}

// ------------------------------------------------------------------ transfer to another department (DAF approval)
export function TransferDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const refs = useAssetRefs();
  const [v, setV] = React.useState({ to_department: "", to_custodian: "", to_location: asset.location_name || "", effective_date: today(), reason: "" });
  const people = ((refs.data?.users || []) as any[]).filter((u) => u.department === v.to_department);
  const save = useSave(() => assetsApi.act(asset.id, "transfer", v), "Transfer sent to the Director of Finance for approval", onDone);
  return (
    <Shell
      onClose={onClose}
      title={`Transfer ${asset.code} to another department`}
      description="The Director of Finance approves the transfer; the asset moves when it is approved and its depreciation is then charged to the new department."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.busy || !v.to_department || v.reason.trim().length < 10} onClick={save.run}>Send for approval</Button></>}
    >
      <Field label="To department" required><select className={inputCls} value={v.to_department} onChange={(e) => setV((x) => ({ ...x, to_department: e.target.value, to_custodian: "" }))}><option value="">Choose…</option>{((refs.data?.departments || []) as any[]).filter((d) => d.id !== asset.department).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New custodian"><select className={inputCls} value={v.to_custodian} onChange={(e) => setV((x) => ({ ...x, to_custodian: e.target.value }))} disabled={!v.to_department}><option value="">Nobody yet</option>{people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></Field>
        <Field label="From"><input type="date" className={inputCls} value={v.effective_date} onChange={(e) => setV((x) => ({ ...x, effective_date: e.target.value }))} /></Field>
      </div>
      <Field label="New location"><input className={inputCls} value={v.to_location} maxLength={160} onChange={(e) => setV((x) => ({ ...x, to_location: e.target.value }))} /></Field>
      <Field label="Why" required hint="At least 10 characters"><textarea className={cn(textareaCls, "min-h-[70px]")} value={v.reason} onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))} /></Field>
    </Shell>
  );
}

// ------------------------------------------------------------------ maintenance
export function MaintenanceDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const refs = useAssetRefs();
  const [v, setV] = React.useState({ date: today(), kind: "service", description: "", supplier: "", provider: "", cost: "" as number | "", downtime_days: "", next_due: "" });
  const save = useSave(() => assetsApi.act(asset.id, "maintenance", { ...v, cost: Number(v.cost) || 0 }), "Maintenance recorded", onDone);
  return (
    <Shell
      onClose={onClose}
      title={`Record maintenance — ${asset.code}`}
      description="Once the work is done. The invoice itself is paid through a payment voucher."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.busy || v.description.trim().length < 5} onClick={save.run}>Record</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" required><input type="date" className={inputCls} value={v.date} max={today()} onChange={(e) => setV((x) => ({ ...x, date: e.target.value }))} /></Field>
        <Field label="Type"><select className={inputCls} value={v.kind} onChange={(e) => setV((x) => ({ ...x, kind: e.target.value }))}>{Object.entries(MAINTENANCE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
      </div>
      <Field label="Work done" required><textarea className={cn(textareaCls, "min-h-[70px]")} value={v.description} onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Supplier"><select className={inputCls} value={v.supplier} onChange={(e) => setV((x) => ({ ...x, supplier: e.target.value }))}><option value="">—</option>{((refs.data?.suppliers || []) as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
        <Field label="Or done by"><input className={inputCls} value={v.provider} onChange={(e) => setV((x) => ({ ...x, provider: e.target.value }))} placeholder="e.g. ICT team" /></Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Cost"><MoneyInput value={v.cost} onChange={(x) => setV((y) => ({ ...y, cost: x }))} /></Field>
        <Field label="Days out of use"><input type="number" min={0} className={inputCls} value={v.downtime_days} onChange={(e) => setV((x) => ({ ...x, downtime_days: e.target.value }))} /></Field>
        <Field label="Next due"><input type="date" className={inputCls} value={v.next_due} min={v.date} onChange={(e) => setV((x) => ({ ...x, next_due: e.target.value }))} /></Field>
      </div>
    </Shell>
  );
}

// ------------------------------------------------------------------ disposal (Store → DAF → SG)
export function DisposalDialog({ asset, disposal, onClose, onSaved }: { asset: any; disposal?: any; onClose: () => void; onSaved: (id: string) => void }) {
  const [v, setV] = React.useState({
    method: disposal?.method || "", disposal_date: day(disposal?.disposal_date) || today(), proceeds: disposal ? disposal.proceeds : ("" as number | ""), buyer: disposal?.buyer || "", reason: disposal?.reason || "",
  });
  const sold = v.method === "sale" || v.method === "auction";
  const nbv = asset.capitalised ? Math.round(asset.cost) - (asset.accumulated_depreciation || 0) : 0;
  const proceeds = sold ? Number(v.proceeds) || 0 : 0;
  const gain = proceeds - nbv;
  const save = useSave(
    async () => {
      const body = { ...v, proceeds };
      const r = disposal ? await assetsApi.disposal(disposal.id, "update", body) : await assetsApi.act(asset.id, "dispose", body);
      onSaved(r.id);
    },
    disposal ? "Disposal updated" : "Disposal prepared — send it for approval when the documents are attached",
    () => undefined
  );
  return (
    <Shell
      onClose={onClose}
      title={`${disposal ? "Edit the disposal of" : "Dispose of"} ${asset.code}`}
      description="Prepared by the Store & Asset Officer with the disposal committee's minutes; the DAF reviews and the SG approves. The asset leaves the register and the GL when it is approved."
      footer={<><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={save.busy || !v.method || v.reason.trim().length < 10 || (sold && !v.buyer.trim())} onClick={save.run}>{disposal ? "Save" : "Prepare disposal"}</Button></>}
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Method" required><select className={inputCls} value={v.method} onChange={(e) => setV((x) => ({ ...x, method: e.target.value }))}><option value="">Choose…</option>{Object.entries(DISPOSAL_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        <Field label="Date" required><input type="date" className={inputCls} value={v.disposal_date} onChange={(e) => setV((x) => ({ ...x, disposal_date: e.target.value }))} /></Field>
      </div>
      {sold && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Proceeds" required><MoneyInput value={v.proceeds} onChange={(x) => setV((y) => ({ ...y, proceeds: x }))} /></Field>
          <Field label="Buyer" required><input className={inputCls} value={v.buyer} maxLength={200} onChange={(e) => setV((x) => ({ ...x, buyer: e.target.value }))} /></Field>
        </div>
      )}
      <Field label="Why" required hint="Committee decision, condition, valuation (at least 10 characters)"><textarea className={cn(textareaCls, "min-h-[80px]")} value={v.reason} onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))} /></Field>
      <div className="grid grid-cols-3 gap-2 rounded-md bg-slate-50 px-3 py-2 text-[12.5px]">
        <div><p className="text-slate-500">Net book value</p><p className="font-semibold tabular-nums">RWF {money(nbv)}</p></div>
        <div><p className="text-slate-500">Proceeds</p><p className="font-semibold tabular-nums">RWF {money(proceeds)}</p></div>
        <div><p className="text-slate-500">{gain >= 0 ? "Gain" : "Loss"}</p><p className={cn("font-semibold tabular-nums", gain < 0 ? "text-red-700" : gain > 0 ? "text-emerald-700" : "")}>RWF {money(Math.abs(gain))}</p></div>
      </div>
    </Shell>
  );
}
