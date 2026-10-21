import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeftRight, Boxes, Pencil, Plus, Warehouse } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RecordTable, { RecordColumn } from "@/components/enterprise/RecordTable";
import { Badge, EmptyState, ListSkeleton, PageHeader, Panel, StatusBadge } from "@/components/enterprise/ui";
import { MOVEMENT_TYPES, errorMessage, money, purchasingApi } from "@/lib/procurement";
import { cn } from "@/utils";

const TABS = [
  { key: "stock", label: "Stock on hand" },
  { key: "items", label: "Items" },
  { key: "movements", label: "Stock ledger" },
  { key: "warehouses", label: "Warehouses" },
];
const inputCls = "h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

export default function Inventory() {
  const [params, setParams] = useSearchParams();
  const tab = params.get("tab") || "stock";
  const { canPerform } = useRoles();
  const canManage = canPerform("manage_inventory");
  const [adjusting, setAdjusting] = React.useState<any>(null);

  const summary = useQuery(["inventory-summary"], async () => {
    const [levels, items] = await Promise.all([
      pocketbase.collection("stock_levels").getFullList({ fields: "quantity,value,item", batch: 500 }),
      pocketbase.collection("inventory_items").getFullList({ fields: "id,total_quantity,reorder_level,active", batch: 500 }),
    ]);
    return {
      value: levels.reduce((a: number, l: any) => a + (l.value || 0), 0),
      items: items.length,
      low: items.filter((i: any) => i.active && i.reorder_level > 0 && i.total_quantity <= i.reorder_level).length,
      out: items.filter((i: any) => i.active && i.total_quantity <= 0).length,
    };
  });

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Inventory"
        description="Stock is increased only by goods receipts and changed only through recorded issues or adjustments."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Inventory", link: "/dashboard/procurement/inventory" }]}
        actions={canManage && <Button onClick={() => setAdjusting({})}><ArrowLeftRight size={15} /> Issue / adjust stock</Button>}
      />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          ["Stock value", money(summary.data?.value)],
          ["Items", summary.data?.items ?? "—"],
          ["At or below reorder level", summary.data?.low ?? "—"],
          ["Out of stock", summary.data?.out ?? "—"],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-card">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{k}</p>
            <p className="mt-1 text-[15px] font-semibold tabular-nums">{v}</p>
          </div>
        ))}
      </div>
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} role="tab" aria-selected={tab === t.key} onClick={() => setParams(t.key === "stock" ? {} : { tab: t.key })}
            className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-[13px] font-medium", tab === t.key ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === "stock" && <StockTab onAdjust={canManage ? setAdjusting : undefined} />}
      {tab === "items" && <ItemsTab canManage={canManage} />}
      {tab === "movements" && <MovementsTab />}
      {tab === "warehouses" && <WarehousesTab canManage={canManage} />}
      {adjusting && <AdjustDialog preset={adjusting} onClose={() => setAdjusting(null)} />}
    </div>
  );
}

function StockTab({ onAdjust }: { onAdjust?: (preset: any) => void }) {
  const columns: RecordColumn<any>[] = [
    { key: "item", header: "Item", cell: (l) => <div><p className="font-medium text-slate-800">{l.expand?.item?.name}</p><p className="text-[12px] text-slate-500">{l.expand?.item?.code}</p></div>, csv: (l) => l.expand?.item?.name },
    { key: "warehouse", header: "Warehouse", cell: (l) => l.expand?.warehouse?.name, csv: (l) => l.expand?.warehouse?.name },
    {
      key: "quantity", header: "On hand", sortField: "quantity", align: "right",
      cell: (l) => {
        const low = l.expand?.item?.reorder_level > 0 && l.quantity <= l.expand.item.reorder_level;
        return <span className={cn("whitespace-nowrap tabular-nums", l.quantity <= 0 ? "text-red-600" : low && "font-medium text-amber-700")}>{l.quantity} {l.expand?.item?.unit}{low && <Badge tone="warning" className="ml-1.5">Reorder</Badge>}</span>;
      },
    },
    { key: "avg", header: "Avg. cost", sortField: "avg_cost", align: "right", cell: (l) => <span className="tabular-nums">{money(l.avg_cost)}</span> },
    { key: "value", header: "Value", sortField: "value", align: "right", cell: (l) => <span className="font-medium tabular-nums">{money(l.value)}</span> },
    { key: "act", header: "", cell: (l) => onAdjust && <Button size="sm" variant="ghost" onClick={(e) => { e.stopPropagation(); onAdjust({ item: l.item, warehouse: l.warehouse }); }}>Issue / adjust</Button> },
  ];
  return (
    <RecordTable
      collection="stock_levels"
      columns={columns}
      views={[{ key: "all", label: "In stock", filter: "quantity > 0" }, { key: "zero", label: "Empty locations", filter: "quantity <= 0" }]}
      searchFields={["item.name", "item.code", "warehouse.name"]}
      expand="item,warehouse"
      defaultSort="-value"
      exportName="stock-on-hand"
      empty={{ icon: Boxes, title: "No stock yet", text: "Stock appears when goods are received against purchase orders." }}
    />
  );
}

function ItemsTab({ canManage }: { canManage: boolean }) {
  const [edit, setEdit] = React.useState<any>(null);
  const columns: RecordColumn<any>[] = [
    { key: "code", header: "Code", sortField: "code", cell: (i) => <span className="font-medium">{i.code}</span> },
    { key: "name", header: "Item", sortField: "name", cell: (i) => <div><p className="text-slate-800">{i.name}</p><p className="text-[12px] text-slate-500">{i.expand?.category?.name || "—"}</p></div> },
    { key: "qty", header: "Total on hand", sortField: "total_quantity", align: "right", cell: (i) => <span className="tabular-nums">{i.total_quantity} {i.unit}</span> },
    { key: "reorder", header: "Reorder level", sortField: "reorder_level", align: "right", cell: (i) => <span className="tabular-nums">{i.reorder_level || "—"}</span> },
    { key: "avg", header: "Avg. cost", sortField: "avg_cost", align: "right", cell: (i) => <span className="tabular-nums">{money(i.avg_cost)}</span> },
    { key: "status", header: "Status", cell: (i) => (i.active ? <Badge tone="success">Active</Badge> : <Badge>Inactive</Badge>) },
    { key: "edit", header: "", cell: (i) => canManage && <Button size="icon" variant="ghost" className="h-8 w-8" aria-label={`Edit ${i.name}`} onClick={(e) => { e.stopPropagation(); setEdit(i); }}><Pencil size={14} /></Button> },
  ];
  return (
    <>
      <RecordTable
        collection="inventory_items"
        columns={columns}
        views={[{ key: "all", label: "All items" }, { key: "low", label: "At or below reorder level", filter: "reorder_level > 0 && total_quantity <= reorder_level" }]}
        searchFields={["name", "code", "category.name"]}
        expand="category"
        defaultSort="name"
        exportName="inventory-items"
        toolbar={canManage && <Button size="sm" variant="outline" onClick={() => setEdit({})}><Plus size={14} /> New item</Button>}
        empty={{ icon: Boxes, title: "No items", text: "Items are created automatically on first receipt, or added here." }}
      />
      {edit && <ItemDialog item={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function ItemDialog({ item, onClose }: { item: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = React.useState({ name: item.name || "", description: item.description || "", category: item.category || "", unit: item.unit || "Each", reorder_level: item.reorder_level || 0, track_batch: !!item.track_batch, track_expiry: !!item.track_expiry, active: item.active ?? true });
  const ref = useQuery(["inv-ref"], async () => ({
    cats: await pocketbase.collection("procurement_categories").getFullList({ sort: "name", fields: "id,name" }),
    units: await pocketbase.collection("units_of_measure").getFullList({ sort: "name", fields: "id,name" }),
  }));
  const save = useMutation(() => (item.id ? pocketbase.collection("inventory_items").update(item.id, v) : pocketbase.collection("inventory_items").create(v)), {
    onSuccess: () => { toast.success("Item saved"); queryClient.invalidateQueries(["record-table"]); onClose(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader><DialogTitle>{item.id ? `Edit ${item.code}` : "New inventory item"}</DialogTitle><DialogDescription>Quantities and costs are maintained automatically from receipts and adjustments.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <label className="block text-[12.5px] font-medium text-slate-700">Name *<input className={cn(inputCls, "mt-1")} value={v.name} onChange={set("name")} /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Description<input className={cn(inputCls, "mt-1")} value={v.description} onChange={set("description")} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12.5px] font-medium text-slate-700">Category
              <select className={cn(inputCls, "mt-1")} value={v.category} onChange={set("category")}><option value="">—</option>{ref.data?.cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="block text-[12.5px] font-medium text-slate-700">Unit
              <select className={cn(inputCls, "mt-1")} value={v.unit} onChange={set("unit")}>{ref.data?.units.map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}</select>
            </label>
          </div>
          <label className="block text-[12.5px] font-medium text-slate-700">Reorder level<input type="number" min={0} className={cn(inputCls, "mt-1")} value={v.reorder_level} onChange={set("reorder_level")} /></label>
          <div className="flex flex-wrap gap-4 text-[13px]">
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.track_batch} onChange={set("track_batch")} /> Track batches</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.track_expiry} onChange={set("track_expiry")} /> Track expiry</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={v.active} onChange={set("active")} /> Active</label>
          </div>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!v.name.trim() || save.isLoading} onClick={() => save.mutate()}>Save</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function MovementsTab() {
  const navigate = useNavigate();
  const columns: RecordColumn<any>[] = [
    { key: "date", header: "Date", sortField: "created", cell: (m) => <span className="whitespace-nowrap text-slate-600">{format(new Date(m.created), "d MMM yyyy, HH:mm")}</span>, csv: (m) => m.created },
    { key: "type", header: "Movement", sortField: "movement_type", cell: (m) => <StatusBadge status={m.movement_type} map={MOVEMENT_TYPES} />, csv: (m) => m.movement_type },
    { key: "item", header: "Item", cell: (m) => <span>{m.expand?.item?.name}</span>, csv: (m) => m.expand?.item?.name },
    { key: "wh", header: "Warehouse", cell: (m) => m.expand?.warehouse?.name, csv: (m) => m.expand?.warehouse?.name },
    { key: "qty", header: "Qty", sortField: "quantity", align: "right", cell: (m) => <span className={cn("tabular-nums", m.quantity < 0 ? "text-red-600" : "text-emerald-700")}>{m.quantity > 0 ? "+" : ""}{m.quantity}</span> },
    { key: "bal", header: "Balance", align: "right", cell: (m) => <span className="tabular-nums">{m.balance_after}</span>, csv: (m) => m.balance_after },
    { key: "value", header: "Value", align: "right", cell: (m) => <span className="tabular-nums">{money(m.value)}</span>, csv: (m) => m.value },
    {
      key: "ref", header: "Reference",
      cell: (m) => (
        <div className="text-[12.5px]">
          {m.expand?.goods_receipt ? <button className="text-primaryDark hover:underline" onClick={() => navigate(`/dashboard/procurement/purchase-orders/${m.expand.goods_receipt.purchase_order}?tab=receipts`)}>{m.reference_number}</button> : m.reference_number || "—"}
          {(m.batch || m.reason) && <p className="text-slate-500">{[m.batch && `batch ${m.batch}`, m.reason].filter(Boolean).join(" · ")}</p>}
          <p className="text-slate-400">{m.expand?.created_by?.name}</p>
        </div>
      ),
      csv: (m) => `${m.reference_number} ${m.reason}`,
    },
  ];
  return (
    <RecordTable
      collection="stock_movements"
      columns={columns}
      views={[{ key: "all", label: "All movements" }, { key: "in", label: "Receipts", filter: `movement_type = "receipt"` }, { key: "out", label: "Issues & adjustments", filter: `movement_type != "receipt"` }]}
      searchFields={["item.name", "reference_number", "reason", "batch"]}
      expand="item,warehouse,created_by,goods_receipt"
      defaultSort="-created"
      exportName="stock-ledger"
      empty={{ icon: ArrowLeftRight, title: "No stock movements", text: "Receipts and adjustments appear here as an immutable ledger." }}
    />
  );
}

function WarehousesTab({ canManage }: { canManage: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery(["warehouses-all"], () => pocketbase.collection("warehouses").getFullList({ sort: "name", expand: "manager,branch" }));
  const [edit, setEdit] = React.useState<any>(null);
  const users = useQuery(["active-users"], () => pocketbase.collection("users").getFullList({ filter: `status = "Active"`, sort: "name", fields: "id,name,email" }), { enabled: Boolean(edit) });
  const save = useMutation(
    () => {
      if (!edit.name?.trim() || !edit.code?.trim()) throw new Error("Name and code are required.");
      const body = { name: edit.name, code: edit.code.toUpperCase(), location: edit.location || "", manager: edit.manager || "", active: edit.active ?? true };
      return edit.id ? pocketbase.collection("warehouses").update(edit.id, body) : pocketbase.collection("warehouses").create(body);
    },
    { onSuccess: () => { toast.success("Warehouse saved"); setEdit(null); queryClient.invalidateQueries(["warehouses-all"]); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );
  return (
    <Panel title="Warehouses and stores" action={canManage && <Button size="sm" onClick={() => setEdit({ active: true })}><Plus size={14} /> Add warehouse</Button>}>
      {q.isLoading ? <ListSkeleton rows={3} /> : !q.data?.length ? <EmptyState icon={Warehouse} text="No warehouses yet. Goods cannot be received until one exists." /> : (
        <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {q.data.map((w: any) => (
            <li key={w.id} className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 text-[13px]">
              <div>
                <p className="font-medium text-slate-800">{w.name} <span className="text-slate-400">{w.code}</span> {!w.active && <Badge>Inactive</Badge>}</p>
                <p className="text-slate-500">{w.location || "—"}</p>
                <p className="text-slate-500">Manager: {w.expand?.manager?.name || "—"}</p>
              </div>
              {canManage && <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEdit(w)} aria-label={`Edit ${w.name}`}><Pencil size={14} /></Button>}
            </li>
          ))}
        </ul>
      )}
      <Dialog open={Boolean(edit)} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader><DialogTitle>{edit?.id ? `Edit ${edit.name}` : "Add warehouse"}</DialogTitle></DialogHeader>
          {edit && (
            <div className="grid gap-3">
              <div className="grid grid-cols-3 gap-3">
                <label className="col-span-2 block text-[12.5px] font-medium text-slate-700">Name *<input className={cn(inputCls, "mt-1")} value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></label>
                <label className="block text-[12.5px] font-medium text-slate-700">Code *<input className={cn(inputCls, "mt-1")} value={edit.code || ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} /></label>
              </div>
              <label className="block text-[12.5px] font-medium text-slate-700">Location<input className={cn(inputCls, "mt-1")} value={edit.location || ""} onChange={(e) => setEdit({ ...edit, location: e.target.value })} /></label>
              <label className="block text-[12.5px] font-medium text-slate-700">Manager
                <select className={cn(inputCls, "mt-1")} value={edit.manager || ""} onChange={(e) => setEdit({ ...edit, manager: e.target.value })}><option value="">—</option>{users.data?.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
              </label>
              <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} /> Active</label>
            </div>
          )}
          <DialogFooter className="gap-2"><Button variant="outline" onClick={() => setEdit(null)}>Cancel</Button><Button disabled={save.isLoading} onClick={() => save.mutate()}>Save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function AdjustDialog({ preset, onClose }: { preset: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [v, setV] = React.useState({ item: preset.item || "", warehouse: preset.warehouse || "", type: "issue", quantity: "", reason: "", reference: "" });
  const ref = useQuery(["adjust-ref"], async () => ({
    items: await pocketbase.collection("inventory_items").getFullList({ filter: "active = true", sort: "name", fields: "id,name,code,unit" }),
    warehouses: await pocketbase.collection("warehouses").getFullList({ filter: "active = true", sort: "name", fields: "id,name" }),
  }));
  const level = useQuery(["level", v.item, v.warehouse], () => pocketbase.collection("stock_levels").getFirstListItem(`item = "${v.item}" && warehouse = "${v.warehouse}"`).catch(() => null), { enabled: Boolean(v.item && v.warehouse) });
  const run = useMutation(() => purchasingApi.adjust({ ...v, quantity: Number(v.quantity) }), {
    onSuccess: () => {
      toast.success("Stock updated");
      ["record-table", "inventory-summary", "level"].forEach((k) => queryClient.invalidateQueries([k]));
      onClose();
    },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md bg-white">
        <DialogHeader><DialogTitle>Issue or adjust stock</DialogTitle><DialogDescription>Every movement is recorded in the stock ledger and audit trail. Stock can never go below zero.</DialogDescription></DialogHeader>
        <div className="grid gap-3">
          <label className="block text-[12.5px] font-medium text-slate-700">Item<select className={cn(inputCls, "mt-1")} value={v.item} onChange={set("item")}><option value="">Select…</option>{ref.data?.items.map((i: any) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}</select></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Warehouse<select className={cn(inputCls, "mt-1")} value={v.warehouse} onChange={set("warehouse")}><option value="">Select…</option>{ref.data?.warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></label>
          {v.item && v.warehouse && <p className="text-[12.5px] text-slate-500">On hand: <span className="font-medium tabular-nums text-slate-800">{level.data?.quantity ?? 0}</span></p>}
          <div className="grid grid-cols-2 gap-3">
            <label className="block text-[12.5px] font-medium text-slate-700">Type
              <select className={cn(inputCls, "mt-1")} value={v.type} onChange={set("type")}>
                <option value="issue">Issue to user / department</option>
                <option value="adjustment">Count adjustment (+ / −)</option>
                <option value="return_to_supplier">Return to supplier</option>
              </select>
            </label>
            <label className="block text-[12.5px] font-medium text-slate-700">Quantity{v.type === "adjustment" ? " (negative to reduce)" : ""}<input type="number" step="any" className={cn(inputCls, "mt-1")} value={v.quantity} onChange={set("quantity")} /></label>
          </div>
          <label className="block text-[12.5px] font-medium text-slate-700">Reason *<input className={cn(inputCls, "mt-1")} value={v.reason} onChange={set("reason")} placeholder="e.g. Issued to Finance for Q4 audits" /></label>
          <label className="block text-[12.5px] font-medium text-slate-700">Reference<input className={cn(inputCls, "mt-1")} value={v.reference} onChange={set("reference")} placeholder="Requisition / count sheet number" /></label>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={!v.item || !v.warehouse || !Number(v.quantity) || !v.reason.trim() || run.isLoading} onClick={() => run.mutate()}>Record movement</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
