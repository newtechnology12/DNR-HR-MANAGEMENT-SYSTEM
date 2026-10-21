import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { differenceInCalendarDays } from "date-fns";
import { toast } from "sonner";
import { AlertTriangle, ExternalLink, FileSignature, Pencil, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { Button, DatePicker, DocNo, ErrorSummary, Field, FormError, Input, Modal, MoneyInput, Num, Page, PageHeader, Person, Select, Textarea, fmtDate, fmtMoney, overdue, toDate } from "@/components/ims";
import { CONTRACT_STATUS, CONTRACT_TYPES, errorMessage, money, phase5Api } from "@/lib/procurement";
import { FileDrop, Progress, toFormData, toInputDate, toPbDate, useMe } from "@/components/portal/kit";

/** Second line under the end date of an active contract: overdue, or how soon it ends. */
function endNote(r: any): React.ReactNode {
  if (r.status !== "active") return r.start_date ? `From ${fmtDate(r.start_date)}` : null;
  const late = overdue(r.end_date);
  if (late) return <span className="font-semibold text-ims-danger">{late}</span>;
  const end = toDate(r.end_date);
  const days = end ? differenceInCalendarDays(end, new Date()) : null;
  if (days !== null && days <= 60) return <span className="font-semibold text-ims-warning">Ends in {days} day{days === 1 ? "" : "s"}</span>;
  return r.start_date ? `From ${fmtDate(r.start_date)}` : null;
}

/** Server alert text with its dates shown as "25 Nov 2026". */
const alertText = (t: string) => t.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (d) => fmtDate(d));

export default function Contracts() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [editing, setEditing] = React.useState<any>(null);
  const alerts = useQuery(["contract-alerts"], phase5Api.contractAlerts);
  const view = params.get("view") || "all";
  const soon = new Date(Date.now() + 60 * 864e5).toISOString().replace("T", " ");
  // At most five tabs; expired and terminated contracts are found with the status filter.
  const views: RecordView[] = [
    { key: "all", label: "All contracts" },
    { key: "active", label: "Active", filter: `status = "active"` },
    { key: "expiring", label: "Ending within 60 days", filter: `status = "active" && end_date <= "${soon}"` },
    { key: "approval", label: "In approval", filter: `status = "pending_approval"` },
    { key: "draft", label: "Drafts", filter: `status = "draft" || status = "returned"` },
  ];
  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(CONTRACT_STATUS).map(([value, m]) => ({ value, label: m.note && m.label !== "Active" ? `${m.label} · ${m.note}` : m.label })) },
    { field: "contract_type", label: "Type", options: Object.entries(CONTRACT_TYPES).map(([value, label]) => ({ value, label })) },
    { field: "supplier", label: "Supplier", collection: "suppliers" },
  ];
  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, csv: (r) => r.number },
    {
      key: "title",
      header: "Title",
      sortField: "title",
      clamp: true,
      cell: (r) => r.title,
      sub: (r) => [r.expand?.supplier?.name, CONTRACT_TYPES[r.contract_type] || r.contract_type].filter(Boolean).join(" · "),
      csv: (r) => r.title,
    },
    { key: "supplier", header: "Supplier", exportOnly: true, cell: (r) => r.expand?.supplier?.name, csv: (r) => r.expand?.supplier?.name },
    { key: "end", header: "Ends", sortField: "end_date", nowrap: true, cell: (r) => fmtDate(r.end_date), sub: endNote, csv: (r) => `${r.start_date?.slice(0, 10)} – ${r.end_date?.slice(0, 10)}` },
    {
      key: "value",
      header: "Value (RWF)",
      sortField: "value",
      align: "right",
      sum: "value",
      format: "money",
      cell: (r) => <Num value={r.value} />,
      sub: (r) => (r.currency && r.currency !== "RWF" ? r.currency : null),
      csv: (r) => r.value,
    },
    { key: "used", header: "Used", width: "150px", cell: (r) => <Progress className="w-32" value={r.value ? (r.utilized_value / r.value) * 100 : 0} />, csv: (r) => r.utilized_value },
    { key: "responsible", header: "Contract manager", className: "max-w-[180px]", cell: (r) => <Person name={r.expand?.responsible?.name} />, csv: (r) => r.expand?.responsible?.name },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={CONTRACT_STATUS} />, csv: (r) => CONTRACT_STATUS[r.status]?.label },
  ];
  const list = alerts.data?.items || [];
  const canManage = canPerform("manage_contracts");
  const open = (r: any) => navigate(`/dashboard/procurement/contracts/${r.id}`);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Contracts" }]}
        title="Contracts"
        subtitle="Supplier contracts: approval, value used by purchase orders, renewal and expiry."
        primary={canManage ? { label: "New contract", icon: Plus, onClick: () => setEditing({}) } : undefined}
      />
      {list.length > 0 && (
        <section role="status" className="rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <p className="flex items-center gap-2 font-bold">
            <AlertTriangle size={16} className="shrink-0" aria-hidden /> {list.length} contract alert{list.length > 1 ? "s" : ""}
          </p>
          <ul className="mt-1.5 grid gap-x-6 gap-y-1 pl-6 sm:grid-cols-2">
            {list.slice(0, 8).map((a, i) => (
              <li key={i} className="min-w-0">
                <button type="button" className="text-left hover:underline" onClick={() => navigate(`/dashboard/procurement/contracts/${a.contract}`)}>
                  {alertText(a.text)} · <span className="text-ims-body">{a.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <RecordTable
        collection="contracts"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "title", "supplier.name", "scope"]}
        searchPlaceholder="Search number, title, supplier or scope"
        filters={filters}
        dateField="end_date"
        dateLabel="Ends"
        expand="supplier,responsible"
        defaultSort="-created"
        exportName="contracts"
        exportTitle="Contracts"
        onRowClick={open}
        rowActions={(r) => [
          { label: "Open", icon: ExternalLink, onSelect: open },
          ...(canManage && ["draft", "returned", "rejected"].includes(r.status) ? [{ label: "Edit", icon: Pencil, onSelect: () => setEditing(r) }] : []),
        ]}
        empty={{
          icon: FileSignature,
          title: "No contracts yet",
          text: "No contracts yet. Record framework agreements and service contracts so purchase orders are checked against their value and period.",
          action: canManage ? <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New contract</Button> : undefined,
        }}
      />
      {editing && <ContractFormDialog contract={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </Page>
  );
}

type Item = { description: string; unit: string; unit_price: number | string };

/** Numbered block inside a dialog: "1 · Contract". */
function DialogSection({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4 border-t border-ims-divider pt-4 first:border-t-0 first:pt-0">
      <h3 className="text-[15px] font-bold text-ims-text">
        {n}<span className="px-1.5 text-ims-faint">·</span>{title}
      </h3>
      {children}
    </section>
  );
}

/** Create / edit a contract. */
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
  const setValue = (k: keyof typeof v, value: string) => setV((x) => ({ ...x, [k]: value }));
  const errors = {
    title: v.title.trim().length < 5 && "Give the contract a clear title (at least 5 characters).",
    supplier: !v.supplier && "Choose the supplier.",
    value: !(Number(v.value) > 0) && "Enter the total contract value, above 0.",
    end: !v.end_date ? "Enter the end date." : v.end_date < v.start_date ? "Choose an end date after the start date." : false,
    renewal: v.renewal_date && v.end_date && v.renewal_date > v.end_date && "Choose a renewal decision date on or before the end date.",
  };
  const summary: FormError[] = tried
    ? ([
        ["ct-title", errors.title],
        ["ct-supplier", errors.supplier],
        ["ct-end", errors.end],
        ["ct-renewal", errors.renewal],
        ["ct-value", errors.value],
      ] as [string, unknown][]).filter(([, m]) => typeof m === "string" && m).map(([field, m]) => ({ field, message: m as string }))
    : [];
  const months = v.end_date && v.start_date ? Math.max(0, Math.round((new Date(v.end_date).getTime() - new Date(v.start_date).getTime()) / (30.4 * 864e5))) : 0;
  const save = useMutation(
    () => {
      const data = { ...v, value: Number(v.value), start_date: toPbDate(v.start_date), end_date: toPbDate(v.end_date), renewal_date: toPbDate(v.renewal_date), items: JSON.stringify(items.filter((i) => i.description.trim()).map((i) => ({ ...i, unit_price: Number(i.unit_price) || 0 }))) };
      const fd = toFormData(data, { documents: files });
      return contract ? pocketbase.collection("contracts").update(contract.id, fd) : pocketbase.collection("contracts").create(fd);
    },
    {
      onSuccess: (c: any) => {
        toast.success(contract ? `${contract.number} updated` : `${c.number} saved as a draft`);
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
  const submit = () => {
    setTried(true);
    if (!Object.values(errors).some(Boolean)) save.mutate();
  };
  const err = (m: string | boolean | undefined) => (tried && typeof m === "string" && m ? m : null);
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={contract ? `Edit ${contract.number}` : "New contract"}
      description="Saved as a draft; submit it for approval from the contract page."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} onClick={submit}>{contract ? "Save changes" : "Save draft"}</Button>
        </>
      }
    >
      <ErrorSummary errors={summary} title="Check these fields before you save" />

      <DialogSection n={1} title="Contract">
        <Field label="Title" required htmlFor="ct-title" error={err(errors.title)}>
          <Input id="ct-title" invalid={Boolean(err(errors.title))} value={v.title} onChange={set("title")} placeholder="e.g. Framework agreement — office stationery 2026–2027" />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Supplier" required htmlFor="ct-supplier" error={err(errors.supplier)} hint="Only approved (active) suppliers are listed.">
            <Select id="ct-supplier" invalid={Boolean(err(errors.supplier))} value={v.supplier} onChange={set("supplier")}>
              <option value="">{ref.isLoading ? "Loading…" : "Choose a supplier"}</option>
              {(ref.data?.suppliers || []).map((s: any) => <option key={s.id} value={s.id}>{s.name} ({s.code})</option>)}
            </Select>
          </Field>
          <Field label="Type" htmlFor="ct-type">
            <Select id="ct-type" value={v.contract_type} onChange={set("contract_type")}>{Object.entries(CONTRACT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>
          </Field>
          <Field label="Department" htmlFor="ct-dept">
            <Select id="ct-dept" value={v.department} onChange={set("department")}><option value="">Organisation-wide</option>{(ref.data?.depts || []).map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
          </Field>
          <Field label="Contract manager" htmlFor="ct-responsible" hint="The person responsible for the contract.">
            <Select id="ct-responsible" value={v.responsible} onChange={set("responsible")}>{(ref.data?.users || []).map((u: any) => <option key={u.id} value={u.id}>{u.name}</option>)}</Select>
          </Field>
        </div>
        <Field label="Scope" htmlFor="ct-scope">
          <Textarea id="ct-scope" rows={3} value={v.scope} onChange={set("scope")} placeholder="What the supplier provides, service levels, locations…" />
        </Field>
      </DialogSection>

      <DialogSection n={2} title="Period">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Start" required htmlFor="ct-start">
            <DatePicker id="ct-start" value={v.start_date} onChange={(d) => setValue("start_date", d)} />
          </Field>
          <Field label="End" required htmlFor="ct-end" error={err(errors.end)}>
            <DatePicker id="ct-end" invalid={Boolean(err(errors.end))} value={v.end_date} min={v.start_date} onChange={(d) => setValue("end_date", d)} />
          </Field>
          <Field label="Renewal decision by" htmlFor="ct-renewal" error={err(errors.renewal)} hint="You are alerted before this date.">
            <DatePicker id="ct-renewal" invalid={Boolean(err(errors.renewal))} value={v.renewal_date} max={v.end_date || undefined} onChange={(d) => setValue("renewal_date", d)} placeholder="Optional" />
          </Field>
        </div>
        {months > 0 && <p className="text-t-small text-ims-muted">About {months} month{months === 1 ? "" : "s"}.</p>}
        <label className="flex items-center gap-2 text-t-body text-ims-text">
          <input type="checkbox" className="h-4 w-4 accent-ims-primary" checked={v.auto_renew} onChange={set("auto_renew")} /> Renews automatically unless terminated
        </label>
      </DialogSection>

      <DialogSection n={3} title="Value and payment">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field label="Total contract value" required htmlFor="ct-value" error={err(errors.value)} hint={Number(v.value) > 0 ? (v.currency === "RWF" ? fmtMoney(Number(v.value)) : money(Number(v.value), v.currency)) : "Purchase orders cannot exceed it."}>
            {v.currency === "RWF" ? (
              <MoneyInput id="ct-value" invalid={Boolean(err(errors.value))} value={v.value === "" ? "" : Number(v.value)} onChange={(n) => setValue("value", n === "" ? "" : String(n))} />
            ) : (
              <Input id="ct-value" type="number" min={0} inputMode="numeric" invalid={Boolean(err(errors.value))} className="text-right tabular-nums" value={v.value} onChange={set("value")} />
            )}
          </Field>
          <Field label="Currency" htmlFor="ct-currency">
            <Select id="ct-currency" value={v.currency} onChange={set("currency")}>{["RWF", "USD", "EUR"].map((c) => <option key={c}>{c}</option>)}</Select>
          </Field>
          <Field label="Payment terms" htmlFor="ct-terms">
            <Input id="ct-terms" value={v.payment_terms} onChange={set("payment_terms")} />
          </Field>
        </div>
      </DialogSection>

      <DialogSection n={4} title="Price schedule (optional)">
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((it, i) => (
              <li key={i} className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_120px_160px_auto]">
                <Input className="col-span-2 sm:col-span-1" value={it.description} placeholder="Item or service" aria-label={`Price line ${i + 1}: item or service`} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
                <Input value={it.unit} placeholder="Unit" aria-label={`Price line ${i + 1}: unit`} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)))} />
                <Input type="number" min={0} className="text-right tabular-nums" value={it.unit_price} placeholder="Unit price" aria-label={`Price line ${i + 1}: unit price`} onChange={(e) => setItems((xs) => xs.map((x, j) => (j === i ? { ...x, unit_price: e.target.value } : x)))} />
                <Button variant="ghost" size="icon" icon={Trash2} aria-label={`Remove price line ${i + 1}`} onClick={() => setItems((xs) => xs.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" icon={Plus} onClick={() => setItems((xs) => [...xs, { description: "", unit: "Each", unit_price: "" }])}>Add a price line</Button>
      </DialogSection>

      <DialogSection n={5} title="Signed contract and annexes">
        <FileDrop files={files} onChange={setFiles} max={20} label={contract ? "Add documents" : "Attach the signed contract"} />
        <Field label="Notes" htmlFor="ct-notes">
          <Input id="ct-notes" value={v.notes} onChange={set("notes")} placeholder="Optional" />
        </Field>
      </DialogSection>
    </Modal>
  );
}
