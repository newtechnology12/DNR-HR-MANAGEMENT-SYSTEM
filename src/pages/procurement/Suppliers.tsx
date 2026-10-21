import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { AlertTriangle, Building2, Plus, Star } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { IMPORTS } from "@/lib/importConfigs";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { Badge, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { SUPPLIER_DOC_TYPES, SUPPLIER_STATUS, SUPPLIER_TYPES, expiryState } from "@/lib/procurement";
import SupplierFormDialog from "./SupplierFormDialog";

export function Rating({ value, count }: { value?: number; count?: number }) {
  if (!count) return <span className="text-[12px] text-slate-400">Not rated</span>;
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap text-[13px] tabular-nums text-slate-800" title={`${count} evaluation(s)`}>
      <Star size={13} className="fill-amber-400 text-amber-400" />
      {Number(value).toFixed(1)}
      <span className="text-[11.5px] text-slate-400">/5</span>
    </span>
  );
}

export default function Suppliers() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [adding, setAdding] = React.useState(false);
  const view = params.get("view") || "active";

  const expiring = useQuery(["supplier-docs-expiring"], () =>
    pocketbase.collection("supplier_documents").getFullList({
      filter: `expiry_date != "" && expiry_date <= "${new Date(Date.now() + 30 * 864e5).toISOString().replace("T", " ")}"`,
      expand: "supplier",
      sort: "expiry_date",
    })
  );

  const views: RecordView[] = [
    { key: "active", label: "Active", filter: `status = "active"` },
    { key: "all", label: "All suppliers" },
    { key: "top", label: "Top rated (4+)", filter: `rating >= 4` },
    { key: "inactive", label: "Inactive / blacklisted", filter: `status != "active"` },
  ];

  const columns: RecordColumn<any>[] = [
    { key: "code", header: "Code", sortField: "code", cell: (s) => <span className="whitespace-nowrap font-medium">{s.code}</span> },
    {
      key: "name",
      header: "Supplier",
      sortField: "name",
      className: "max-w-[280px]",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{s.name}</p>
          <p className="truncate text-[12px] text-slate-500">{(s.expand?.categories || []).map((c: any) => c.name).join(", ") || "—"}</p>
        </div>
      ),
    },
    { key: "type", header: "Type", exportOnly: true, cell: (s) => SUPPLIER_TYPES.find((t) => t.value === s.supplier_type)?.label || "—", csv: (s) => s.supplier_type },
    { key: "tin", header: "TIN", sortField: "tin", cell: (s) => <span className="tabular-nums">{s.tin || "—"}</span> },
    { key: "contact", header: "Contact", cell: (s) => <div className="text-[12.5px]"><p>{s.phone || "—"}</p><p className="text-slate-500">{s.email}</p></div>, csv: (s) => `${s.phone} ${s.email}` },
    { key: "rating", header: "Rating", sortField: "rating", cell: (s) => <Rating value={s.rating} count={s.evaluations_count} />, csv: (s) => s.rating },
    { key: "status", header: "Status", sortField: "status", cell: (s) => <StatusBadge status={s.status} map={SUPPLIER_STATUS} /> },
  ];

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Supplier directory"
        description="Approved vendors, their documents and performance. One record per supplier — duplicates are refused."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "Suppliers", link: "/dashboard/procurement/suppliers" }]}
        actions={canPerform("manage_suppliers") && <Button onClick={() => setAdding(true)}><Plus size={15} /> Add supplier</Button>}
      />

      {!!expiring.data?.length && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-900">
          <p className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle size={15} /> {expiring.data.length} supplier document(s) expired or expiring within 30 days</p>
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {expiring.data.slice(0, 8).map((d: any) => {
              const st = expiryState(d.expiry_date);
              return (
                <li key={d.id}>
                  <button className="hover:underline" onClick={() => navigate(`/dashboard/procurement/suppliers/${d.supplier}?tab=documents`)}>
                    {d.expand?.supplier?.name} — {SUPPLIER_DOC_TYPES[d.document_type]} <Badge tone={st.tone}>{st.label}</Badge>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      <RecordTable
        collection="suppliers"
        importConfig={IMPORTS.suppliers}
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "active" ? {} : { view: v })}
        searchFields={["name", "code", "tin", "email", "phone", "categories.name"]}
        expand="categories"
        defaultSort="name"
        exportName="suppliers"
        onRowClick={(s) => navigate(`/dashboard/procurement/suppliers/${s.id}`)}
        empty={{
          icon: Building2,
          title: "No suppliers found",
          text: "Try another view, or add your first supplier.",
          action: canPerform("manage_suppliers") && <Button size="sm" onClick={() => setAdding(true)}><Plus size={14} /> Add supplier</Button>,
        }}
      />

      <SupplierFormDialog open={adding} onClose={() => setAdding(false)} onSaved={(s) => navigate(`/dashboard/procurement/suppliers/${s.id}`)} />
    </div>
  );
}
