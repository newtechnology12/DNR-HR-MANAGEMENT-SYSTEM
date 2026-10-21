import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, CalendarRange, FileSignature, ListOrdered, Paperclip, Plus, Trash2, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { CONTRACT_STATUS, CONTRACT_TYPES, errorMessage, money, phase5Api } from "@/lib/procurement";
import { Field, FileDrop, FormBlock, FormDialog, Progress, inputCls, showDate, textareaCls, toFormData, toInputDate, toPbDate, useMe } from "@/components/portal/kit";
import { cn } from "@/utils";

export default function Contracts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [editing, setEditing] = React.useState<any>(null);
  const alerts = useQuery(["contract-alerts"], phase5Api.contractAlerts);
  const view = params.get("view") || "all";
  const soon = new Date(Date.now() + 60 * 864e5).toISOString().replace("T", " ");
  const views: RecordView[] = [
    { key: "all", label: "All contracts" },
    { key: "active", label: "Active", filter: `status = "active"` },
    { key: "expiring", label: "Ending within 60 days", filter: `status = "active" && end_date <= "${soon}"` },
    { key: "approval", label: "In approval", filter: `status = "pending_approval"` },
    { key: "draft", label: "Drafts", filter: `status = "draft" || status = "returned"` },
    { key: "closed", label: "Expired / terminated", filter: `status = "expired" || status = "terminated"` },
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Contract", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number}</span> },
    { key: "title", header: "Title", className: "max-w-[280px]", cell: (r) => <div className="min-w-0"><p className="truncate">{r.title}</p><p className="truncate text-[12px] text-slate-500">{r.expand?.supplier?.name} · {CONTRACT_TYPES[r.contract_type] || r.contract_type}</p></div>, csv: (r) => r.title },
    { key: "supplier", header: "Supplier", exportOnly: true, cell: (r) => r.expand?.supplier?.name, csv: (r) => r.expand?.supplier?.name },
    { key: "period", header: "Period", sortField: "end_date", cell: (r) => <span className="whitespace-nowrap text-slate-600">{showDate(r.start_date, "d MMM yy")} – {showDate(r.end_date, "d MMM yy")}</span>, csv: (r) => `${r.start_date?.slice(0, 10)} – ${r.end_date?.slice(0, 10)}` },
    { key: "value", header: "Value", sortField: "value", align: "right", cell: (r) => <span className="whitespace-nowrap font-medium tabular-nums">{money(r.value, r.currency)}</span>, csv: (r) => r.value },
    { key: "used", header: "Used", cell: (r) => <Progress className="w-32" value={r.value ? (r.utilized_value / r.value) * 100 : 0} />, csv: (r) => r.utilized_value },
    { key: "responsible", header: "Responsible", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.responsible?.name}</span>, csv: (r) => r.expand?.responsible?.name },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={CONTRACT_STATUS} />, csv: (r) => CONTRACT_STATUS[r.status]?.label },
  ];
  const list = alerts.data?.items || [];
  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Contracts"
        description="Framework, supply and service contracts with suppliers: approval, value used by purchase orders, renewal and expiry alerts."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Contracts", link: "/dashboard/procurement/contracts" }]}
        actions={canPerform("manage_contracts") && <Button size="sm" onClick={() => setEditing({})}><Plus size={14} /> New contract</Button>}
      />
      {list.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12.5px] text-amber-900">
          <p className="mb-1 flex items-center gap-1.5 font-semibold"><AlertTriangle size={14} /> {list.length} contract alert{list.length > 1 ? "s" : ""}</p>
          <ul className="grid gap-x-6 gap-y-0.5 sm:grid-cols-2">
            {list.slice(0, 8).map((a, i) => (
              <li key={i}><button type="button" className="text-left hover:underline" onClick={() => navigate(`/dashboard/procurement/contracts/${a.contract}`)}>{a.text} — <span className="text-amber-800">{a.title}</span></button></li>
            ))}
          </ul>
        </div>
      )}
      <RecordTable
        collection="contracts"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "title", "supplier.name", "scope"]}
        expand="supplier,responsible"
        defaultSort="-created"
        exportName="contracts"
        onRowClick={(r) => navigate(`/dashboard/procurement/contracts/${r.id}`)}
        empty={{ icon: FileSignature, title: "No contracts yet", text: "Record framework agreements and service contracts so purchase orders are checked against their value and period." }}
      />
      {editing && <ContractFormDialog contract={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </div>
  );
}

type Item = { description: string; unit: string; unit_price: number | string };

/** Create / edit a contract — same design as the leave request form. */
export function ContractFormDialog({ contract, onClose }: { contract: any | null; onClose: () => void }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const me = useMe();
  const [v, setV] = React.useState({
    title: contract?.title || "",
    supplier: contract?.supplier || "",
    contract_type: contract?.contract_type || "framework",
    department: contract?.department || "",
    responsible: contract?.responsible || "",
    start_date: toInputDate(contract?.start_date) || new Date().toISOString().slice(0, 10),
    end_date: toInputDate(contract?.end_date) || "",
    renewal_date: toInputDate(contract?.renewal_date) || "",
    auto_renew: Boolean(contract?.auto_renew),
    value: contract?.value ? String(contract.value) : "",
    currency: contract?.currency || "RWF",
    payment_terms: contract?.payment_terms || "30 days after receipt of a valid invoice",
    scope: contract?.scope || "",
    notes: contract?.notes || "",
  });
  const [items, setItems] = React.useState<Item[]>(contract?.items || []);
  const [files, setFiles] = React.useState<File[]>([]);
  const [tried, setTried] = React.useState(false);
  const ref = useQuery(["contract-form-ref"], async () => {
    const [suppliers, depts, users] = await Promise.all([
      pocketbase.collection("suppliers").getFullList({ filter: 'status = "active"', sort: "name", fields: "id,name,code" }),
      pocketbase.collection("departments").getFullList({ sort: "name", fields: "id,name" }),
      pocketbase.collection("users").getFullList({ filter: 'status = "Active"', sort: "name", fields: "id,name" }),
    ]);
    return { suppliers, depts, users };
  });
  React.useEffect(() => {
    if (!contract && me.data) setV((x) => ({ ...x, responsible: x.responsible || me.data!.id, department: x.department || me.data!.department }));
  }, [me.data, contract]);
  const set = (k: keyof typeof v) => (e: any) => setV((x) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const errors = {
    title: v.title.trim().length < 5 && "Give the contract a clear title.",
    supplier: !v.supplier && "Choose the supplier.",
    value: !(Number(v.value) > 0) && "Enter the total contract value.",
    end: !v.end_date ? "Enter the end date." : v.end_date < v.start_date ? "The end date must be after the start date." : false,
    renewal: v.renewal_date && v.end_date && v.renewal_date > v.end_date && "The renewal decision must be on or before the end date.",
  };
  const months = v.end_date && v.start_date ? Math.max(0, Math.round((new Date(v.end_date).getTime() - new Date(v.start_date).getTime()) / (30.4 * 864e5))) : 0;
  const save = useMutation(
    () => {
      const data = { ...v, value: Number(v.value), start_date: toPbDate(v.start_date), end_date: toPbDate(v.end_date), renewal_date: toPbDate(v.renewal_date), items: JSON.stringify(items.filter((i) => i.description.trim()).map((i) => ({ ...i, unit_price: Number(i.unit_price) || 0 }))) };
      const fd = toFormData(data, { documents: files });
      return contract ? pocketbase.collection("contracts").update(contract.id, fd) : pocketbase.collection("contracts").create(fd);
    },
    {
      onSuccess: (c: any) => {
        toast.success(contract ? "Contract updated" : `${c.number} created as a draft`);
        queryClient.invalidateQueries(["contract"]);
        queryClient.invalidateQueries(["record-table"]);
        onClose();
        if (!contract) navigate(`/dashboard/procurement/contracts/${c.id}`);
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  return (
    <FormDialog
      open
      onClose={onClose}
      icon={FileSignature}
      title={contract ? `Edit ${contract.number}` : "New contract"}
      description={<>Saved as a draft; submit it for approval from the contract page. <span className="text-red-600">*</span> required</>}
      submitLabel={contract ? "Save changes" : "Create draft"}
      busy={save.isLoading}
      wide
      onSubmit={() => {
        setTried(true);
        if (!Object.values(errors).some(Boolean)) save.mutate();
      }}
    >
      <FormBlock icon={FileSignature} title="Contract">
        <Field label="Title" required error={tried && errors.title}><input className={inputCls} value={v.title} onChange={set("title")} placeholder="e.g. Framework agreement — office stationery 2026–2027" /></Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Supplier" required error={tried && errors.supplier} hint="Only approved (active) suppliers are listed.">
            <select className={inputCls} value={v.supplier} onChange={set("supplier")}>
              <option value="">{ref.isLoading ? "Loading…" : "Choose a supplier"}</option>
              {(ref.data?.suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </select>
          </Field>
          <Field label="Type">
            <select className={inputCls} value={v.contract_type} onChange={set("contract_type")}>{Object.entries(CONTRACT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </Field>
          <Field label="Department">
            <select className={inputCls} value={v.department} onChange={set("department")}><option value="">Organisation-wide</option>{(ref.data?.depts || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>
          </Field>
          <Field label="Contract manager (responsible)">
            <select className={inputCls} value={v.responsible} onChange={set("responsible")}>{(ref.data?.users || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</select>
          </Field>
        </div>
        <Field label="Scope"><textarea className={textareaCls} rows={3} value={v.scope} onChange={set("scope")} placeholder="What the supplier provides, service levels, locations…" /></Field>
      </FormBlock>

      <FormBlock icon={CalendarRange} title="Period">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Field label="Start" required><input type="date" className={inputCls} value={v.start_date} onChange={set("start_date")} /></Field>
          <Field label="End" required error={tried && errors.end}><input type="date" className={inputCls} value={v.end_date} min={v.start_date} onChange={set("end_date")} /></Field>
          <Field label="Renewal decision by" error={tried && errors.renewal} className="col-span-2 sm:col-span-1" hint="You are alerted before this date."><input type="date" className={inputCls} value={v.renewal_date} max={v.end_date || undefined} onChange={set("renewal_date")} /></Field>
        </div>
        {months > 0 && <p className="text-[12.5px] text-slate-500">About {months} month{months === 1 ? "" : "s"}.</p>}
        <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4" checked={v.auto_renew} onChange={set("auto_renew")} /> Renews automatically unless terminated</label>
      </FormBlock>

      <FormBlock icon={Wallet} title="Value and payment">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <Field label="Total contract value" required error={tried && errors.value} hint={Number(v.value) > 0 ? money(Number(v.value), v.currency) : "Purchase orders cannot exceed it."}>
            <input type="number" min={0} inputMode="numeric" className={`${inputCls} text-right tabular-nums`} value={v.value} onChange={set("value")} />
          </Field>
          <Field label="Currency"><select className={inputCls} value={v.currency} onChange={set("currency")}>{["RWF", "USD", "EUR"].map((c) => <option key={c}>{c}</option>)}</select></Field>
          <Field label="Payment terms"><input className={inputCls} value={v.payment_terms} onChange={set("payment_terms")} /></Field>
        </div>
      </FormBlock>

      <FormBlock icon={ListOrdered} title="Price schedule (optional)">
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_120px_150px_auto]">
                <input className={cn(inputCls, "col-span-2 sm:col-span-1")} value={it.description} placeholder="Item or service" onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <input className={inputCls} value={it.unit} placeholder="Unit" onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                <input type="number" min={0} className={`${inputCls} text-right`} value={it.unit_price} placeholder="Unit price" onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)))} />
                <button type="button" onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} className="rounded-md p-2 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove"><Trash2 size={16} /></button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => setItems((xs) => [...xs, { description: "", unit: "Each", unit_price: "" }])}><Plus size={14} /> Add a price line</Button>
      </FormBlock>

      <FormBlock icon={Paperclip} title="Signed contract and annexes">
        <FileDrop files={files} onChange={setFiles} max={20} label={contract ? "Add documents" : "Attach the signed contract"} />
        <Field label="Notes"><input className={inputCls} value={v.notes} onChange={set("notes")} placeholder="Optional" /></Field>
      </FormBlock>
    </FormDialog>
  );
}
