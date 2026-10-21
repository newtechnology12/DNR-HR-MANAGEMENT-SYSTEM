import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeftRight, Boxes, ChevronDown, Pencil, Plus, Warehouse } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { IMPORTS } from "@/lib/importConfigs";
import RecordTable, { RecordColumn, RecordFilter } from "@/components/enterprise/RecordTable";
import {
  Button,
  Card,
  CardHeader,
  Column,
  DataTable,
  DocNo,
  EmptyState,
  Field,
  Input,
  KpiBand,
  Modal,
  Num,
  Page,
  PageHeader,
  Person,
  Select,
  StatusPill,
  Tabs,
  fmtDate,
  fmtDateTime,
  fmtMoney,
  fmtNumber,
} from "@/components/ims";
import { MOVEMENT_TYPES, errorMessage, purchasingApi } from "@/lib/procurement";
import { cn } from "@/utils";

const TABS = [
  { key: "stock", label: "Stock on hand" },
  { key: "items", label: "Items" },
  { key: "movements", label: "Stock ledger" },
  { key: "warehouses", label: "Warehouses" },
];

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
  const s = summary.data;
  const setTab = (t: string) => setParams(t === "stock" ? {} : { tab: t });

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Inventory" }]}
        title="Inventory"
        subtitle="Stock in each warehouse. It goes up with goods receipts and changes only through recorded issues or adjustments."
        primary={canManage ? { label: "Issue or adjust stock", icon: ArrowLeftRight, onClick: () => setAdjusting({}) } : undefined}
      />
      <KpiBand
        loading={summary.isLoading}
        items={[
          { label: "Stock value", value: s ? fmtMoney(s.value) : "—" },
          { label: "Items", value: s ? fmtNumber(s.items) : "—", onClick: () => setTab("items") },
          { label: "At or below reorder level", value: s ? fmtNumber(s.low) : "—", tone: s?.low ? "warning" : "default", onClick: () => setTab("items") },
          { label: "Out of stock", value: s ? fmtNumber(s.out) : "—", tone: s?.out ? "danger" : "default", onClick: () => setTab("items") },
        ]}
      />
      <Tabs label="Inventory sections" tabs={TABS} active={TABS.some((t) => t.key === tab) ? tab : "stock"} onChange={setTab} />
      {tab === "stock" && <StockTab onAdjust={canManage ? setAdjusting : undefined} />}
      {tab === "items" && <ItemsTab canManage={canManage} />}
      {tab === "movements" && <MovementsTab />}
      {tab === "warehouses" && <WarehousesTab canManage={canManage} />}
      {adjusting && <AdjustDialog preset={adjusting} onClose={() => setAdjusting(null)} />}
    </Page>
  );
}

/** A view switch in the filter bar that always has a value (the kit's FilterSelect always offers "All"). */
function ViewSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <span className="relative inline-block">
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-button w-[190px] appearance-none truncate rounded-control border border-ims-field bg-ims-card pl-3 pr-9 text-[13.5px] font-semibold text-ims-text outline-none focus:border-ims-focus focus:ring-2 focus:ring-ims-focus/25"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ims-muted" aria-hidden />
    </span>
  );
}

/** "12 Each" */
const qtyText = (n: number | undefined, unit?: string) => `${fmtNumber(n ?? 0, true)}${unit ? ` ${unit}` : ""}`;

function StockTab({ onAdjust }: { onAdjust?: (preset: any) => void }) {
  const [show, setShow] = React.useState<"in" | "empty">("in");
  const columns: RecordColumn<any>[] = [
    { key: "item", header: "Item", clamp: true, cell: (l) => l.expand?.item?.name || "—", sub: (l) => l.expand?.item?.code, csv: (l) => l.expand?.item?.name },
    { key: "warehouse", header: "Warehouse", cell: (l) => l.expand?.warehouse?.name || "—", csv: (l) => l.expand?.warehouse?.name },
    {
      key: "quantity",
      header: "On hand",
      sortField: "quantity",
      align: "right",
      cell: (l) => {
        const low = l.expand?.item?.reorder_level > 0 && l.quantity <= l.expand.item.reorder_level;
        return <span className={cn(l.quantity <= 0 ? "font-semibold text-ims-danger" : low && "font-semibold text-ims-warning")}>{qtyText(l.quantity, l.expand?.item?.unit)}</span>;
      },
      sub: (l) => (l.quantity <= 0 ? "Empty" : l.expand?.item?.reorder_level > 0 && l.quantity <= l.expand.item.reorder_level ? `Reorder at ${fmtNumber(l.expand.item.reorder_level, true)}` : null),
    },
    { key: "avg", header: "Average cost (RWF)", sortField: "avg_cost", align: "right", format: "money", cell: (l) => <Num value={l.avg_cost} />, csv: (l) => l.avg_cost },
    { key: "value", header: "Value (RWF)", sortField: "value", align: "right", sum: "value", format: "money", cell: (l) => <Num value={l.value} />, csv: (l) => l.value },
  ];
  return (
    <RecordTable
      collection="stock_levels"
      columns={columns}
      baseFilter={show === "in" ? "quantity > 0" : "quantity <= 0"}
      searchFields={["item.name", "item.code", "warehouse.name"]}
      searchPlaceholder="Search item, code or warehouse"
      filters={[{ field: "warehouse", label: "Warehouse", collection: "warehouses" }]}
      toolbar={
        <ViewSelect
          label="Locations"
          value={show}
          onChange={(v) => setShow(v as "in" | "empty")}
          options={[{ value: "in", label: "In stock" }, { value: "empty", label: "Empty locations" }]}
        />
      }
      expand="item,warehouse"
      defaultSort="-value"
      exportName="stock-on-hand"
      exportTitle="Stock on hand"
      rowActions={onAdjust ? (l) => [{ label: "Issue or adjust", icon: ArrowLeftRight, onSelect: () => onAdjust({ item: l.item, warehouse: l.warehouse }) }] : undefined}
      empty={{ icon: Boxes, title: "No stock yet.", text: show === "in" ? "No stock yet. It appears when goods are received against purchase orders." : "No empty locations." }}
    />
  );
}

function ItemsTab({ canManage }: { canManage: boolean }) {
  const [edit, setEdit] = React.useState<any>(null);
  const columns: RecordColumn<any>[] = [
    { key: "code", header: "Code", sortField: "code", nowrap: true, cell: (i) => <DocNo value={i.code} /> },
    { key: "name", header: "Item", sortField: "name", clamp: true, cell: (i) => i.name, sub: (i) => i.expand?.category?.name, csv: (i) => i.name },
    {
      key: "qty",
      header: "On hand",
      sortField: "total_quantity",
      align: "right",
      cell: (i) => {
        const low = i.reorder_level > 0 && i.total_quantity <= i.reorder_level;
        return <span className={cn(i.total_quantity <= 0 ? "font-semibold text-ims-danger" : low && "font-semibold text-ims-warning")}>{qtyText(i.total_quantity, i.unit)}</span>;
      },
      csv: (i) => i.total_quantity,
    },
    { key: "reorder", header: "Reorder level", sortField: "reorder_level", align: "right", cell: (i) => (i.reorder_level ? fmtNumber(i.reorder_level, true) : "—") },
    { key: "avg", header: "Average cost (RWF)", sortField: "avg_cost", align: "right", format: "money", cell: (i) => <Num value={i.avg_cost} />, csv: (i) => i.avg_cost },
    { key: "status", header: "Status", cell: (i) => <StatusPill status={i.active ? "Active" : "Inactive"} />, csv: (i) => (i.active ? "Active" : "Inactive") },
  ];
  const filters: RecordFilter[] = [
    {
      field: "stock_level",
      label: "Stock level",
      options: [{ value: "low", label: "At or below reorder level" }, { value: "out", label: "Out of stock" }],
      filterFor: (v) => (v === "low" ? "reorder_level > 0 && total_quantity <= reorder_level" : "total_quantity <= 0"),
    },
    { field: "category", label: "Category", collection: "procurement_categories" },
  ];
  return (
    <>
      <RecordTable
        collection="inventory_items"
        importConfig={IMPORTS.inventoryItems}
        columns={columns}
        filters={filters}
        searchFields={["name", "code", "category.name"]}
        searchPlaceholder="Search item, code or category"
        expand="category"
        defaultSort="name"
        exportName="inventory-items"
        exportTitle="Inventory items"
        onRowClick={canManage ? (i) => setEdit(i) : undefined}
        rowActions={canManage ? (i) => [{ label: "Edit", icon: Pencil, onSelect: () => setEdit(i) }] : undefined}
        toolbar={canManage && <Button icon={Plus} onClick={() => setEdit({})}>New item</Button>}
        empty={{ icon: Boxes, title: "No items yet.", text: "No items yet. They are created on the first receipt, or added here." }}
      />
      {edit && <ItemDialog item={edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Checkbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="flex min-h-[32px] cursor-pointer items-center gap-2 text-t-body text-ims-text">
      <input type="checkbox" className="h-4 w-4 rounded border-ims-field accent-ims-primary" checked={checked} onChange={onChange} />
      {label}
    </label>
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
    onSuccess: () => { toast.success(`${v.name.trim() || "Item"} saved`); queryClient.invalidateQueries(["record-table"]); onClose(); },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <Modal
      open
      onClose={save.isLoading ? () => undefined : onClose}
      size="sm"
      title={item.id ? <>Edit <span className="whitespace-nowrap">{item.code}</span></> : "New inventory item"}
      description="Quantities and costs are kept up to date by receipts and adjustments."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isLoading}>Cancel</Button>
          <Button variant="primary" disabled={!v.name.trim()} loading={save.isLoading} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <Field label="Name" required htmlFor="item-name">
        <Input id="item-name" value={v.name} onChange={set("name")} />
      </Field>
      <Field label="Description" htmlFor="item-description">
        <Input id="item-description" value={v.description} onChange={set("description")} />
      </Field>
      <div className="grid grid-cols-2 gap-4">
        <Field label="Category" htmlFor="item-category">
          <Select id="item-category" value={v.category} onChange={set("category")}>
            <option value="">None</option>
            {ref.data?.cats.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="Unit" htmlFor="item-unit">
          <Select id="item-unit" value={v.unit} onChange={set("unit")}>
            {ref.data?.units.map((u: any) => <option key={u.id} value={u.name}>{u.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Reorder level" htmlFor="item-reorder" hint="The item is flagged when the quantity on hand falls to this level.">
        <Input id="item-reorder" type="number" min={0} className="text-right tabular-nums" value={v.reorder_level} onChange={set("reorder_level")} />
      </Field>
      <div className="flex flex-wrap gap-x-6 gap-y-1">
        <Checkbox label="Track batches" checked={v.track_batch} onChange={set("track_batch")} />
        <Checkbox label="Track expiry" checked={v.track_expiry} onChange={set("track_expiry")} />
        <Checkbox label="Active" checked={v.active} onChange={set("active")} />
      </div>
    </Modal>
  );
}

function MovementsTab() {
  const navigate = useNavigate();
  const columns: RecordColumn<any>[] = [
    { key: "date", header: "Date", sortField: "created", nowrap: true, cell: (m) => fmtDate(m.created), sub: (m) => fmtDateTime(m.created).split(", ")[1], csv: (m) => m.created },
    { key: "type", header: "Movement", sortField: "movement_type", nowrap: true, cell: (m) => MOVEMENT_TYPES[m.movement_type]?.label || m.movement_type, csv: (m) => m.movement_type },
    { key: "item", header: "Item", clamp: true, cell: (m) => m.expand?.item?.name || "—", sub: (m) => m.expand?.warehouse?.name, csv: (m) => m.expand?.item?.name },
    { key: "wh", header: "Warehouse", exportOnly: true, cell: (m) => m.expand?.warehouse?.name || "—", csv: (m) => m.expand?.warehouse?.name },
    {
      key: "qty",
      header: "Quantity",
      sortField: "quantity",
      align: "right",
      cell: (m) => <span className={cn("font-semibold", m.quantity < 0 ? "text-ims-danger" : "text-ims-success")}>{m.quantity > 0 ? "+" : m.quantity < 0 ? "−" : ""}{fmtNumber(Math.abs(m.quantity), true)}</span>,
    },
    { key: "bal", header: "Balance", align: "right", cell: (m) => fmtNumber(m.balance_after, true), csv: (m) => m.balance_after },
    { key: "value", header: "Value (RWF)", align: "right", format: "money", cell: (m) => <Num value={m.value} negativeRed />, csv: (m) => m.value },
    {
      key: "ref",
      header: "Reference",
      clamp: true,
      cell: (m) =>
        m.expand?.goods_receipt ? (
          <button type="button" className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-ims-link hover:underline" onClick={() => navigate(`/dashboard/procurement/purchase-orders/${m.expand.goods_receipt.purchase_order}?tab=receipts`)}>
            {m.reference_number}
          </button>
        ) : (
          <span className="whitespace-nowrap">{m.reference_number || "—"}</span>
        ),
      sub: (m) => [m.batch && `Batch ${m.batch}`, m.reason, m.expand?.created_by?.name].filter(Boolean).join(" · ") || null,
      csv: (m) => `${m.reference_number} ${m.reason}`,
    },
  ];
  return (
    <RecordTable
      collection="stock_movements"
      columns={columns}
      filters={[
        { field: "movement_type", label: "Movement", options: Object.entries(MOVEMENT_TYPES).map(([value, t]) => ({ value, label: t.label })) },
        { field: "warehouse", label: "Warehouse", collection: "warehouses" },
      ]}
      dateField="created"
      dateLabel="Date"
      searchFields={["item.name", "reference_number", "reason", "batch"]}
      searchPlaceholder="Search item, reference, reason or batch"
      expand="item,warehouse,created_by,goods_receipt"
      defaultSort="-created"
      exportName="stock-ledger"
      exportTitle="Stock ledger"
      empty={{ icon: ArrowLeftRight, title: "No stock movements yet.", text: "No stock movements yet. Receipts and adjustments are listed here and cannot be edited." }}
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
      if (!edit.name?.trim() || !edit.code?.trim()) throw new Error("Enter the warehouse name and code.");
      const body = { name: edit.name, code: edit.code.toUpperCase(), location: edit.location || "", manager: edit.manager || "", active: edit.active ?? true };
      return edit.id ? pocketbase.collection("warehouses").update(edit.id, body) : pocketbase.collection("warehouses").create(body);
    },
    { onSuccess: () => { toast.success(`${edit?.name || "Warehouse"} saved`); setEdit(null); queryClient.invalidateQueries(["warehouses-all"]); }, onError: (e) => { toast.error(errorMessage(e)); } }
  );
  const columns: Column<any>[] = [
    { key: "name", header: "Warehouse", cell: (w) => <span className="font-semibold text-ims-text">{w.name}</span>, sub: (w) => w.code },
    { key: "location", header: "Location", clamp: true, cell: (w) => w.location || "—" },
    { key: "manager", header: "Manager", className: "max-w-[220px]", cell: (w) => (w.expand?.manager?.name ? <Person name={w.expand.manager.name} /> : <span className="text-ims-faint">—</span>) },
    { key: "status", header: "Status", cell: (w) => <StatusPill status={w.active ? "Active" : "Inactive"} /> },
  ];
  return (
    <Card padded={false}>
      <div className="px-5 pt-5">
        <CardHeader
          title="Warehouses and stores"
          subtitle="Where goods are received and kept."
          action={canManage ? <Button icon={Plus} onClick={() => setEdit({ active: true })}>Add warehouse</Button> : undefined}
        />
      </div>
      <DataTable
        columns={columns}
        rows={q.data || []}
        rowKey={(w) => w.id}
        loading={q.isLoading}
        error={q.isError ? q.error : undefined}
        onRetry={() => q.refetch()}
        minWidth={640}
        caption="Warehouses"
        onRowClick={canManage ? (w) => setEdit(w) : undefined}
        rowActions={canManage ? (w) => [{ label: "Edit", icon: Pencil, onSelect: () => setEdit(w) }] : undefined}
        empty={<EmptyState compact icon={Warehouse} text="No warehouses yet. Goods cannot be received until one exists." action={canManage ? <Button variant="primary" icon={Plus} onClick={() => setEdit({ active: true })}>Add warehouse</Button> : undefined} />}
      />
      <Modal
        open={Boolean(edit)}
        onClose={save.isLoading ? () => undefined : () => setEdit(null)}
        size="sm"
        title={edit?.id ? `Edit ${edit.name}` : "Add warehouse"}
        description="Goods are received into an active warehouse."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEdit(null)} disabled={save.isLoading}>Cancel</Button>
            <Button variant="primary" loading={save.isLoading} onClick={() => save.mutate()}>Save</Button>
          </>
        }
      >
        {edit && (
          <>
            <div className="grid grid-cols-3 gap-4">
              <Field label="Name" required htmlFor="wh-name" className="col-span-2">
                <Input id="wh-name" value={edit.name || ""} onChange={(e) => setEdit({ ...edit, name: e.target.value })} />
              </Field>
              <Field label="Code" required htmlFor="wh-code">
                <Input id="wh-code" value={edit.code || ""} onChange={(e) => setEdit({ ...edit, code: e.target.value })} placeholder="KGL" />
              </Field>
            </div>
            <Field label="Location" htmlFor="wh-location">
              <Input id="wh-location" value={edit.location || ""} onChange={(e) => setEdit({ ...edit, location: e.target.value })} />
            </Field>
            <Field label="Manager" htmlFor="wh-manager">
              <Select id="wh-manager" value={edit.manager || ""} onChange={(e) => setEdit({ ...edit, manager: e.target.value })}>
                <option value="">No manager</option>
                {users.data?.map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}
              </Select>
            </Field>
            <Checkbox label="Active" checked={edit.active ?? true} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />
          </>
        )}
      </Modal>
    </Card>
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
      toast.success("Stock movement recorded");
      ["record-table", "inventory-summary", "level"].forEach((k) => queryClient.invalidateQueries([k]));
      onClose();
    },
    onError: (e) => { toast.error(errorMessage(e)); },
  });
  const set = (k: string) => (e: any) => setV((x) => ({ ...x, [k]: e.target.value }));
  const unit = ref.data?.items.find((i: any) => i.id === v.item)?.unit;
  return (
    <Modal
      open
      onClose={run.isLoading ? () => undefined : onClose}
      size="sm"
      title="Issue or adjust stock"
      description="Every movement is written to the stock ledger and the audit trail. Stock cannot go below zero."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={run.isLoading}>Cancel</Button>
          <Button variant="primary" disabled={!v.item || !v.warehouse || !Number(v.quantity) || !v.reason.trim()} loading={run.isLoading} onClick={() => run.mutate()}>Record movement</Button>
        </>
      }
    >
      <Field label="Item" required htmlFor="adj-item">
        <Select id="adj-item" value={v.item} onChange={set("item")}>
          <option value="">Choose an item</option>
          {ref.data?.items.map((i: any) => <option key={i.id} value={i.id}>{i.code} · {i.name}</option>)}
        </Select>
      </Field>
      <Field label="Warehouse" required htmlFor="adj-warehouse" hint={v.item && v.warehouse ? <>On hand: <span className="font-semibold tabular-nums text-ims-text">{qtyText(level.data?.quantity ?? 0, unit)}</span></> : undefined}>
        <Select id="adj-warehouse" value={v.warehouse} onChange={set("warehouse")}>
          <option value="">Choose a warehouse</option>
          {ref.data?.warehouses.map((w: any) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </Select>
      </Field>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[minmax(0,1fr)_120px]">
        <Field label="Type" required htmlFor="adj-type">
          <Select id="adj-type" value={v.type} onChange={set("type")}>
            <option value="issue">Issue to staff or a unit</option>
            <option value="adjustment">Count adjustment (+ or −)</option>
            <option value="return_to_supplier">Return to supplier</option>
          </Select>
        </Field>
        <Field label="Quantity" required htmlFor="adj-qty" hint={v.type === "adjustment" ? "Negative to reduce" : undefined}>
          <Input id="adj-qty" type="number" step="any" inputMode="decimal" className="text-right tabular-nums" value={v.quantity} onChange={set("quantity")} />
        </Field>
      </div>
      <Field label="Reason" required htmlFor="adj-reason">
        <Input id="adj-reason" value={v.reason} onChange={set("reason")} placeholder="For example: issued to Finance for the Q4 audits" />
      </Field>
      <Field label="Reference" htmlFor="adj-reference">
        <Input id="adj-reference" value={v.reference} onChange={set("reference")} placeholder="Requisition or count sheet number" />
      </Field>
    </Modal>
  );
}
