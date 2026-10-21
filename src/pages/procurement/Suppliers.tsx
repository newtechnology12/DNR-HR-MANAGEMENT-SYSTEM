import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Building2, ExternalLink, Pencil, Plus, Star } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { IMPORTS } from "@/lib/importConfigs";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { Button, DocNo, Page, PageHeader } from "@/components/ims";
import { cn } from "@/utils";
import { SUPPLIER_DOC_TYPES, SUPPLIER_STATUS, SUPPLIER_TYPES, expiryState } from "@/lib/procurement";
import SupplierFormDialog from "./SupplierFormDialog";

/** "4.0 / 5" with a star, or "Not rated". */
export function Rating({ value, count }: { value?: number; count?: number }) {
  if (!count) return <span className="whitespace-nowrap text-t-small text-ims-faint">Not rated</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-t-body tabular-nums text-ims-text" title={`${count} ${count === 1 ? "evaluation" : "evaluations"}`}>
      <Star size={13} className="fill-ims-priority-high text-ims-priority-high" aria-hidden />
      {Number(value).toFixed(1)}
      <span className="text-t-small text-ims-faint">/ 5</span>
    </span>
  );
}

/** Validity of a supplier document in words: "Expired 12 days ago", "Expires in 10 days", "Valid". */
export function expiryText(expiry?: string): { text: string; tone: "danger" | "warning" | "ok" | "none" } {
  const st = expiryState(expiry);
  if (st.daysLeft === null) return { text: "No expiry date", tone: "none" };
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  if (st.daysLeft < 0) return { text: `Expired ${days(-st.daysLeft)} ago`, tone: "danger" };
  if (st.tone === "warning") return { text: st.daysLeft === 0 ? "Expires today" : `Expires in ${days(st.daysLeft)}`, tone: "warning" };
  return { text: "Valid", tone: "ok" };
}

export default function Suppliers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [adding, setAdding] = React.useState(false);
  const [editing, setEditing] = React.useState<any | null>(null);
  const [editOpen, setEditOpen] = React.useState(false);
  const view = params.get("view") || "active";
  const canManage = canPerform("manage_suppliers");

  const expiring = useQuery(["supplier-docs-expiring"], () =>
    pocketbase.collection("supplier_documents").getFullList({
      filter: `expiry_date != "" && expiry_date <= "${new Date(Date.now() + 30 * 864e5).toISOString().replace("T", " ")}"`,
      expand: "supplier",
      sort: "expiry_date",
    })
  );

  // At most five tabs; status and type are filters.
  const views: RecordView[] = [
    { key: "active", label: "Active", filter: `status = "active"` },
    { key: "all", label: "All suppliers" },
    { key: "top", label: "Top rated (4+)", filter: `rating >= 4` },
    { key: "inactive", label: "Not active", filter: `status != "active"` },
  ];

  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(SUPPLIER_STATUS).map(([value, m]) => ({ value, label: m.note ? `${m.label} · ${m.note}` : m.label })) },
    { field: "supplier_type", label: "Type", options: SUPPLIER_TYPES.map((t) => ({ value: t.value, label: t.label })) },
  ];

  const columns: RecordColumn<any>[] = [
    { key: "code", header: "Code", sortField: "code", nowrap: true, cell: (s) => <DocNo value={s.code} /> },
    {
      key: "name",
      header: "Supplier",
      sortField: "name",
      clamp: true,
      cell: (s) => <span className="font-semibold">{s.name}</span>,
      sub: (s) => (s.expand?.categories || []).map((c: any) => c.name).join(", ") || "No categories",
      csv: (s) => s.name,
    },
    { key: "type", header: "Type", exportOnly: true, cell: (s) => SUPPLIER_TYPES.find((t) => t.value === s.supplier_type)?.label || "—", csv: (s) => s.supplier_type },
    { key: "tin", header: "TIN", sortField: "tin", nowrap: true, cell: (s) => <span className="tabular-nums">{s.tin || "—"}</span> },
    {
      key: "contact",
      header: "Contact",
      className: "max-w-[240px]",
      cell: (s) => <span className="whitespace-nowrap tabular-nums">{s.phone || "—"}</span>,
      sub: (s) => (s.email ? <span className="block truncate">{s.email}</span> : null),
      csv: (s) => `${s.phone} ${s.email}`,
    },
    { key: "rating", header: "Rating", sortField: "rating", nowrap: true, cell: (s) => <Rating value={s.rating} count={s.evaluations_count} />, csv: (s) => s.rating },
    { key: "status", header: "Status", sortField: "status", cell: (s) => <StatusBadge status={s.status} map={SUPPLIER_STATUS} />, csv: (s) => SUPPLIER_STATUS[s.status]?.label || s.status },
  ];

  const open = (s: any) => navigate(`/dashboard/procurement/suppliers/${s.id}`);
  const issues = expiring.data || [];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Suppliers" }]}
        title="Suppliers"
        subtitle="Approved vendors with their documents, bank details and performance."
        primary={canManage ? { label: "Add supplier", icon: Plus, onClick: () => setAdding(true) } : undefined}
      />

      {issues.length > 0 && (
        <div role="status" className="rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle size={16} className="shrink-0" aria-hidden />
            {issues.length === 1 ? "1 supplier document has expired or expires within 30 days" : `${issues.length} supplier documents have expired or expire within 30 days`}
          </p>
          <ul className="mt-1.5 flex flex-wrap gap-x-5 gap-y-1 pl-6">
            {issues.slice(0, 8).map((d: any) => {
              const st = expiryText(d.expiry_date);
              return (
                <li key={d.id}>
                  <button type="button" className="text-left text-ims-body hover:underline" onClick={() => navigate(`/dashboard/procurement/suppliers/${d.supplier}?tab=documents`)}>
                    <span className="font-semibold text-ims-text">{d.expand?.supplier?.name}</span> · {SUPPLIER_DOC_TYPES[d.document_type]} ·{" "}
                    <span className={cn("font-semibold", st.tone === "danger" ? "text-ims-danger" : "text-ims-warning")}>{st.text}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/* "relative" keeps the table's hidden Actions header inside the card on phones (see report: DataTable gap). */}
      <div className="relative min-w-0 overflow-hidden rounded-card">
        <RecordTable
          collection="suppliers"
          importConfig={IMPORTS.suppliers}
          columns={columns}
          views={views}
          activeView={view}
          onViewChange={(v) => setParams(v === "active" ? {} : { view: v })}
          searchFields={["name", "code", "tin", "email", "phone", "categories.name"]}
          searchPlaceholder="Search name, code, TIN or email"
          filters={filters}
          expand="categories"
          defaultSort="name"
          exportName="suppliers"
          exportTitle="Suppliers"
          onRowClick={open}
          rowActions={(s) => [
            { label: "Open", icon: ExternalLink, onSelect: open },
            ...(canManage && s.status !== "under_review" ? [{ label: "Edit", icon: Pencil, onSelect: () => { setEditing(s); setEditOpen(true); } }] : []),
          ]}
          empty={{
            icon: Building2,
            title: "No suppliers yet.",
            text: canManage ? "No suppliers in this view. Add one with Add supplier." : "No suppliers in this view.",
            action: canManage ? <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>Add supplier</Button> : undefined,
          }}
        />
      </div>

      <SupplierFormDialog open={adding} onClose={() => setAdding(false)} onSaved={(s) => navigate(`/dashboard/procurement/suppliers/${s.id}`)} />
      <SupplierFormDialog open={editOpen} onClose={() => setEditOpen(false)} supplier={editing || undefined} />
    </Page>
  );
}
