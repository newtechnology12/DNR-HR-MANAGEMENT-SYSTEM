/**
 * Dialogs of the fixed asset register: the asset card (register / capitalise), custodian and location, status,
 * transfer to another department, maintenance and disposal. Every action goes through the assets API.
 */
import * as React from "react";
import { useQuery } from "react-query";
import { toast } from "sonner";
import pocketbase from "@/lib/pocketbase";
import { errorMessage } from "@/lib/procurement";
import { ACQUISITION, ASSET_STATUS, CONDITIONS, DEPRECIATION_METHODS, DISPOSAL_METHODS, MAINTENANCE_KINDS, assetsApi } from "@/lib/assets";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, DatePicker, Field, Input, Modal, ModalSection, MoneyInput, Select, Textarea, fmtMoney, statusText } from "@/components/ims";
import { cn } from "@/utils";

const today = () => new Date().toISOString().slice(0, 10);
const day = (v?: string) => String(v || "").slice(0, 10);
const monthAfter = (d: string) => {
  if (!d) return "";
  const x = new Date(`${d.slice(0, 7)}-01T12:00:00Z`);
  x.setUTCMonth(x.getUTCMonth() + 1);
  return x.toISOString().slice(0, 10);
};
/** The physical state of an asset in a sentence: "in use", "under maintenance". */
const stateOf = (s?: string) => (ASSET_STATUS[s || ""]?.note || s || "").toLowerCase();

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
    <Modal open onClose={onClose} size={wide ? "lg" : "md"} title={title} description={description} footer={footer}>
      {children}
    </Modal>
  );
}

function Footer({ onClose, label, onSave, busy, disabled }: { onClose: () => void; label: string; onSave: () => void; busy: boolean; disabled?: boolean }) {
  return (
    <>
      <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
      <Button variant="primary" onClick={onSave} loading={busy} disabled={disabled}>{label}</Button>
    </>
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
    asset ? `${asset.code} is in the register and posted to the general ledger` : "Asset registered and posted to the general ledger",
    () => undefined
  );
  return (
    <Shell
      wide
      onClose={onClose}
      title={asset ? `Asset card for ${asset.code}` : "Register an asset"}
      description={asset ? "Complete the card to put the asset in the register. Its cost is posted to the category's asset account (Dr) against assets received not yet invoiced (Cr)." : "For an asset bought outside a purchase order or donated. It is registered and posted to the general ledger at once."}
      footer={<Footer onClose={onClose} onSave={save.run} busy={save.busy} disabled={!ready} label={asset ? "Capitalise" : "Register and capitalise"} />}
    >
      {refs.isLoading ? (
        <div className="space-y-3" aria-label="Loading categories, departments and staff">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : (
        <>
          <ModalSection title="Asset">
            <Field label="Description" required htmlFor="ac-name">
              <Input id="ac-name" value={v.name} maxLength={200} onChange={set("name")} placeholder="e.g. Dell Latitude 5440 laptop" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label="Category"
                required
                htmlFor="ac-category"
                hint={cat ? `${DEPRECIATION_METHODS[cat.method] || "—"} over ${cat.useful_life_months ? `${cat.useful_life_months / 12} years` : "—"}${cat.residual_percent ? `, ${cat.residual_percent}% residual` : ""} · threshold ${fmtMoney(cat.capitalisation_threshold)}` : undefined}
              >
                <Select id="ac-category" value={v.category} onChange={(e) => setV((x: any) => ({ ...x, category: e.target.value, type: "" }))}>
                  <option value="">Choose…</option>
                  {(r.categories || []).filter((c: any) => c.method).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </Select>
              </Field>
              <Field label="Type" htmlFor="ac-type">
                <Select id="ac-type" value={v.type} onChange={set("type")} disabled={!types.length}>
                  <option value="">—</option>
                  {types.map((t: any) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </Select>
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Serial or plate number" htmlFor="ac-serial">
                <Input id="ac-serial" value={v.serial_number} onChange={set("serial_number")} />
              </Field>
              <Field label="Condition" htmlFor="ac-condition">
                <Select id="ac-condition" value={v.condition} onChange={set("condition")}>
                  {Object.entries(CONDITIONS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </Select>
              </Field>
            </div>
          </ModalSection>

          <ModalSection title="Where it is">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Department" required htmlFor="ac-department">
                <Select id="ac-department" value={v.department} onChange={(e) => setV((x: any) => ({ ...x, department: e.target.value, assigned_to: "" }))}>
                  <option value="">Choose…</option>
                  {(r.departments || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </Select>
              </Field>
              <Field label="Custodian" htmlFor="ac-custodian" hint="Someone in that department. Leave empty if it stays in the store or is shared.">
                <Select id="ac-custodian" value={v.assigned_to} onChange={set("assigned_to")} disabled={!v.department}>
                  <option value="">No custodian</option>
                  {people.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
                </Select>
              </Field>
            </div>
            <Field label="Location" htmlFor="ac-location">
              <Input id="ac-location" value={v.location_name} maxLength={160} onChange={set("location_name")} placeholder="e.g. HQ 2nd floor, finance office" />
            </Field>
          </ModalSection>

          <ModalSection title="Value and depreciation">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label="Cost"
                required
                htmlFor="ac-cost"
                hint={fromGrn ? "From the purchase order (VAT included)" : undefined}
                error={below ? `Below the ${fmtMoney(cat.capitalisation_threshold)} threshold: record it as an expense, not a fixed asset` : undefined}
              >
                <MoneyInput id="ac-cost" value={v.cost} disabled={fromGrn} invalid={Boolean(below)} onChange={(x) => setV((y: any) => ({ ...y, cost: x }))} />
              </Field>
              <Field label="Acquired on" required htmlFor="ac-acquired">
                <DatePicker id="ac-acquired" value={v.purchased_at} max={today()} disabled={fromGrn} onChange={(x) => setV((y: any) => ({ ...y, purchased_at: x }))} />
              </Field>
              <Field label="Depreciation from" htmlFor="ac-start" hint="Default: the month after">
                <DatePicker id="ac-start" value={v.depreciation_start || monthAfter(v.purchased_at)} onChange={(x) => setV((y: any) => ({ ...y, depreciation_start: x }))} />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Residual value" htmlFor="ac-residual" hint={cat?.residual_percent ? `Default ${cat.residual_percent}% of cost` : "Default nil"}>
                <MoneyInput id="ac-residual" value={v.residual_value} onChange={(x) => setV((y: any) => ({ ...y, residual_value: x }))} placeholder={residual.toLocaleString("en-US")} />
              </Field>
              <Field label="Useful life (months)" htmlFor="ac-life" hint={cat ? `Category: ${cat.useful_life_months || "—"}` : undefined}>
                <Input id="ac-life" type="number" min={1} value={v.useful_life_months} onChange={set("useful_life_months")} placeholder={String(cat?.useful_life_months || "")} />
              </Field>
            </div>
            {monthly > 0 && (
              <p className="rounded-control bg-ims-thead px-3 py-2.5 text-t-small text-ims-body">
                Depreciation of about <b className="font-semibold text-ims-text">{fmtMoney(monthly)}</b> a month from {new Date(`${start}T12:00:00`).toLocaleDateString("en-GB", { month: "long", year: "numeric" })} for {life} months
                {residual ? `, down to a residual value of ${fmtMoney(residual)}` : ""}.
              </p>
            )}
          </ModalSection>

          <ModalSection title="Funding and source">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Funding source" htmlFor="ac-fund" hint="Who paid for it">
                <Select id="ac-fund" value={v.funding_source} onChange={(e) => setV((x: any) => ({ ...x, funding_source: e.target.value, project: "" }))}>
                  <option value="">Member contributions</option>
                  {(r.funds || []).map((f: any) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
                </Select>
              </Field>
              <Field label="Project" htmlFor="ac-project">
                <Select id="ac-project" value={v.project} onChange={set("project")}>
                  <option value="">—</option>
                  {projects.map((p: any) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                </Select>
              </Field>
            </div>
            {!asset && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Acquired by" htmlFor="ac-acq">
                  <Select id="ac-acq" value={v.acquisition_type} onChange={set("acquisition_type")}>
                    <option value="purchase">{ACQUISITION.purchase}</option>
                    <option value="donation">{ACQUISITION.donation} (deferred capital grant)</option>
                  </Select>
                </Field>
                <Field label="Supplier" htmlFor="ac-supplier">
                  <Select id="ac-supplier" value={v.supplier} onChange={set("supplier")}>
                    <option value="">—</option>
                    {(r.suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </Select>
                </Field>
              </div>
            )}
            <Field label="Notes" htmlFor="ac-notes">
              <Textarea id="ac-notes" className="min-h-[72px]" value={v.description} maxLength={1000} onChange={set("description")} placeholder="Specification, warranty, what it is used for" />
            </Field>
          </ModalSection>
        </>
      )}
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
  const name = people.find((u) => u.id === custodian)?.name;
  const save = useSave(() => assetsApi.act(asset.id, "assign", { custodian, location_name: location, reason }), custodian ? `${asset.code} is now in the care of ${name || "the new custodian"}` : `${asset.code} returned to the store`, onDone);
  return (
    <Shell
      onClose={onClose}
      title={`Custodian and location of ${asset.code}`}
      description="Within the asset's department. To move it to another department, request a transfer."
      footer={<Footer onClose={onClose} onSave={save.run} busy={save.busy} disabled={custodian === (asset.assigned_to || "") && location === (asset.location_name || "")} label="Save" />}
    >
      <Field label="Custodian" htmlFor="as-custodian">
        <Select id="as-custodian" value={custodian} onChange={(e) => setCustodian(e.target.value)}>
          <option value="">Nobody: back to the store or shared</option>
          {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        </Select>
      </Field>
      <Field label="Location" htmlFor="as-location">
        <Input id="as-location" value={location} maxLength={160} onChange={(e) => setLocation(e.target.value)} />
      </Field>
      <Field label="Reason" htmlFor="as-reason" hint="Kept in the asset's history">
        <Textarea id="as-reason" className="min-h-[72px]" value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </Shell>
  );
}

// ------------------------------------------------------------------ status
export function StatusDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const [status, setStatus] = React.useState("");
  const [reason, setReason] = React.useState("");
  const save = useSave(() => assetsApi.act(asset.id, "status", { status, reason }), `${asset.code} is now ${stateOf(status)}`, onDone);
  return (
    <Shell
      onClose={onClose}
      title={`Change the status of ${asset.code}`}
      description={`Now ${stateOf(asset.status)}. A lost or damaged asset stays in the register until its disposal is approved.`}
      footer={<Footer onClose={onClose} onSave={save.run} busy={save.busy} disabled={!status || reason.trim().length < 5} label="Change status" />}
    >
      <Field label="New status" required htmlFor="st-status">
        <Select id="st-status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Choose…</option>
          {["in_use", "in_stock", "under_maintenance", "damaged", "lost"].filter((s) => s !== asset.status).map((s) => <option key={s} value={s}>{statusText(ASSET_STATUS[s], s)}</option>)}
        </Select>
      </Field>
      <Field label="Reason" required htmlFor="st-reason" hint="At least 5 characters">
        <Textarea id="st-reason" className="min-h-[80px]" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="What happened, who reported it" />
      </Field>
    </Shell>
  );
}

// ------------------------------------------------------------------ transfer to another department (DAF approval)
export function TransferDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const refs = useAssetRefs();
  const [v, setV] = React.useState({ to_department: "", to_custodian: "", to_location: asset.location_name || "", effective_date: today(), reason: "" });
  const people = ((refs.data?.users || []) as any[]).filter((u) => u.department === v.to_department);
  const save = useSave(() => assetsApi.act(asset.id, "transfer", v), `Transfer of ${asset.code} sent to the Director of Finance for approval`, onDone);
  return (
    <Shell
      onClose={onClose}
      title={`Transfer ${asset.code} to another department`}
      description="The Director of Finance approves the transfer. The asset moves when it is approved, and its depreciation is then charged to the new department."
      footer={<Footer onClose={onClose} onSave={save.run} busy={save.busy} disabled={!v.to_department || v.reason.trim().length < 10} label="Submit for approval" />}
    >
      <Field label="To department" required htmlFor="tr-dept">
        <Select id="tr-dept" value={v.to_department} onChange={(e) => setV((x) => ({ ...x, to_department: e.target.value, to_custodian: "" }))}>
          <option value="">Choose…</option>
          {((refs.data?.departments || []) as any[]).filter((d) => d.id !== asset.department).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="New custodian" htmlFor="tr-custodian">
          <Select id="tr-custodian" value={v.to_custodian} onChange={(e) => setV((x) => ({ ...x, to_custodian: e.target.value }))} disabled={!v.to_department}>
            <option value="">Nobody yet</option>
            {people.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
          </Select>
        </Field>
        <Field label="From" htmlFor="tr-date">
          <DatePicker id="tr-date" value={v.effective_date} onChange={(x) => setV((y) => ({ ...y, effective_date: x }))} />
        </Field>
      </div>
      <Field label="New location" htmlFor="tr-location">
        <Input id="tr-location" value={v.to_location} maxLength={160} onChange={(e) => setV((x) => ({ ...x, to_location: e.target.value }))} />
      </Field>
      <Field label="Why" required htmlFor="tr-reason" hint="At least 10 characters">
        <Textarea id="tr-reason" className="min-h-[80px]" value={v.reason} onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))} />
      </Field>
    </Shell>
  );
}

// ------------------------------------------------------------------ maintenance
export function MaintenanceDialog({ asset, onClose, onDone }: { asset: any; onClose: () => void; onDone: () => void }) {
  const refs = useAssetRefs();
  const [v, setV] = React.useState({ date: today(), kind: "service", description: "", supplier: "", provider: "", cost: "" as number | "", downtime_days: "", next_due: "" });
  const save = useSave(() => assetsApi.act(asset.id, "maintenance", { ...v, cost: Number(v.cost) || 0 }), `Maintenance of ${asset.code} recorded`, onDone);
  return (
    <Shell
      onClose={onClose}
      title={`Record maintenance on ${asset.code}`}
      description="Once the work is done. The invoice itself is paid through a payment voucher."
      footer={<Footer onClose={onClose} onSave={save.run} busy={save.busy} disabled={v.description.trim().length < 5} label="Record" />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date" required htmlFor="mt-date">
          <DatePicker id="mt-date" value={v.date} max={today()} onChange={(x) => setV((y) => ({ ...y, date: x }))} />
        </Field>
        <Field label="Type" htmlFor="mt-kind">
          <Select id="mt-kind" value={v.kind} onChange={(e) => setV((x) => ({ ...x, kind: e.target.value }))}>
            {Object.entries(MAINTENANCE_KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Work done" required htmlFor="mt-desc" hint="At least 5 characters">
        <Textarea id="mt-desc" className="min-h-[80px]" value={v.description} onChange={(e) => setV((x) => ({ ...x, description: e.target.value }))} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier" htmlFor="mt-supplier">
          <Select id="mt-supplier" value={v.supplier} onChange={(e) => setV((x) => ({ ...x, supplier: e.target.value }))}>
            <option value="">—</option>
            {((refs.data?.suppliers || []) as any[]).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
        </Field>
        <Field label="Or done by" htmlFor="mt-provider">
          <Input id="mt-provider" value={v.provider} onChange={(e) => setV((x) => ({ ...x, provider: e.target.value }))} placeholder="e.g. ICT team" />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Cost" htmlFor="mt-cost">
          <MoneyInput id="mt-cost" value={v.cost} onChange={(x) => setV((y) => ({ ...y, cost: x }))} />
        </Field>
        <Field label="Days out of use" htmlFor="mt-down">
          <Input id="mt-down" type="number" min={0} value={v.downtime_days} onChange={(e) => setV((x) => ({ ...x, downtime_days: e.target.value }))} />
        </Field>
        <Field label="Next due" htmlFor="mt-next">
          <DatePicker id="mt-next" value={v.next_due} min={v.date} onChange={(x) => setV((y) => ({ ...y, next_due: x }))} />
        </Field>
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
    disposal ? `Disposal of ${asset.code} updated` : `Disposal of ${asset.code} prepared. Attach the documents, then submit it for approval.`,
    () => undefined
  );
  return (
    <Shell
      onClose={onClose}
      title={`${disposal ? "Edit the disposal of" : "Dispose of"} ${asset.code}`}
      description="Prepared by the Store & Asset Officer with the disposal committee's minutes, reviewed by the DAF and approved by the SG. The asset leaves the register and the GL when it is approved."
      footer={<Footer onClose={onClose} onSave={save.run} busy={save.busy} disabled={!v.method || v.reason.trim().length < 10 || (sold && !v.buyer.trim())} label={disposal ? "Save" : "Prepare disposal"} />}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Method" required htmlFor="dp-method">
          <Select id="dp-method" value={v.method} onChange={(e) => setV((x) => ({ ...x, method: e.target.value }))}>
            <option value="">Choose…</option>
            {Object.entries(DISPOSAL_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </Select>
        </Field>
        <Field label="Date" required htmlFor="dp-date">
          <DatePicker id="dp-date" value={v.disposal_date} onChange={(x) => setV((y) => ({ ...y, disposal_date: x }))} />
        </Field>
      </div>
      {sold && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Proceeds" required htmlFor="dp-proceeds">
            <MoneyInput id="dp-proceeds" value={v.proceeds} onChange={(x) => setV((y) => ({ ...y, proceeds: x }))} />
          </Field>
          <Field label="Buyer" required htmlFor="dp-buyer">
            <Input id="dp-buyer" value={v.buyer} maxLength={200} onChange={(e) => setV((x) => ({ ...x, buyer: e.target.value }))} />
          </Field>
        </div>
      )}
      <Field label="Why" required htmlFor="dp-reason" hint="Committee decision, condition, valuation (at least 10 characters)">
        <Textarea id="dp-reason" className="min-h-[88px]" value={v.reason} onChange={(e) => setV((x) => ({ ...x, reason: e.target.value }))} />
      </Field>
      <dl className="grid grid-cols-3 gap-3 rounded-control bg-ims-thead px-4 py-3">
        <div className="min-w-0">
          <dt className="text-t-small text-ims-muted">Net book value</dt>
          <dd className="mt-0.5 text-t-body font-semibold tabular-nums text-ims-text">{fmtMoney(nbv)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-t-small text-ims-muted">Proceeds</dt>
          <dd className="mt-0.5 text-t-body font-semibold tabular-nums text-ims-text">{fmtMoney(proceeds)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-t-small text-ims-muted">{gain >= 0 ? "Gain" : "Loss"}</dt>
          <dd className={cn("mt-0.5 text-t-body font-semibold tabular-nums", gain < 0 ? "text-ims-danger" : gain > 0 ? "text-ims-success" : "text-ims-text")}>{fmtMoney(Math.abs(gain))}</dd>
        </div>
      </dl>
    </Shell>
  );
}
