import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { ExternalLink, FileSearch, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import RecordTable, { RecordColumn, RecordFilter, RecordView } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { Button, DatePicker, DocNo, EmptyState, Field, Modal, Num, Page, PageHeader, Person, fmtDate, fmtMoney, overdue } from "@/components/ims";
import { RFQ_STATUS, errorMessage, sourcingApi } from "@/lib/procurement";
import { cn } from "@/utils";

export default function Rfqs() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [picking, setPicking] = React.useState(false);
  const view = params.get("view") || "all";
  const now = new Date().toISOString().replace("T", " ");
  const awaitingFilter = `status = "closed" || (status = "sent" && closing_date < "${now}")`;

  const awaiting = useQuery(["rfqs-awaiting-award"], () => pocketbase.collection("rfqs").getList(1, 1, { filter: awaitingFilter, fields: "id" }).then((r) => r.totalItems));

  // At most five tabs; "Awarded" and the other states are in the status filter.
  const views: RecordView[] = [
    { key: "all", label: "All RFQs" },
    { key: "draft", label: "Drafts", filter: `status = "draft"` },
    { key: "open", label: "Open for quotes", filter: `status = "sent"` },
    { key: "evaluate", label: "Awaiting award", filter: awaitingFilter },
    { key: "mine", label: "My RFQs", filter: `buyer = "${pocketbase.authStore.model?.id}"` },
  ];

  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(RFQ_STATUS).map(([value, m]) => ({ value, label: m.note ? `${m.label} · ${m.note}` : m.label })) },
    { field: "department", label: "Department", collection: "departments" },
  ];

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
    {
      key: "title",
      header: "Title",
      sortField: "title",
      clamp: true,
      cell: (r) => r.title,
      sub: (r) => [r.expand?.requisition?.number, r.expand?.department?.name].filter(Boolean).join(" · "),
      csv: (r) => r.title || "",
    },
    { key: "suppliers", header: "Suppliers", align: "right", cell: (r) => <Num value={r.suppliers?.length || 0} />, csv: (r) => r.suppliers?.length || 0 },
    {
      key: "closing",
      header: "Closing",
      sortField: "closing_date",
      nowrap: true,
      cell: (r) => fmtDate(r.closing_date),
      sub: (r) => (r.status === "sent" ? (overdue(r.closing_date) ? <span className="font-semibold text-ims-warning">{overdue(r.closing_date)}</span> : null) : null),
      csv: (r) => r.closing_date?.slice(0, 10),
    },
    { key: "buyer", header: "Buyer", className: "max-w-[190px]", cell: (r) => <Person name={r.expand?.buyer?.name} />, csv: (r) => r.expand?.buyer?.name || "" },
    {
      key: "award",
      header: "Awarded (RWF)",
      align: "right",
      format: "money",
      cell: (r) => (r.expand?.awarded_quotation ? <Num value={r.expand.awarded_quotation.grand_total} /> : <span className="text-ims-faint">—</span>),
      sub: (r) =>
        r.expand?.awarded_quotation ? (
          <>
            {r.expand.awarded_quotation.currency && r.expand.awarded_quotation.currency !== "RWF" && <span>{r.expand.awarded_quotation.currency} · </span>}
            {r.award_not_lowest && <span className="font-semibold text-ims-warning">Not the lowest price</span>}
          </>
        ) : null,
      csv: (r) => r.expand?.awarded_quotation?.grand_total ?? "",
    },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={RFQ_STATUS} />, csv: (r) => RFQ_STATUS[r.status]?.label },
  ];

  const canCreate = canPerform("manage_rfqs");
  const open = (r: any) => navigate(`/dashboard/procurement/rfqs/${r.id}`);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Procurement", to: "/dashboard/procurement" }, { label: "Requests for quotation" }]}
        title="Requests for quotation"
        subtitle="Invite suppliers to quote for approved requisitions, compare their offers and award."
        primary={canCreate ? { label: "New RFQ", icon: Plus, onClick: () => setPicking(true) } : undefined}
      />
      <RecordTable
        collection="rfqs"
        columns={columns}
        views={views}
        activeView={view}
        viewCounts={{ evaluate: awaiting.data }}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "title", "requisition.number", "department.name"]}
        searchPlaceholder="Search number, title or requisition"
        filters={filters}
        dateField="closing_date"
        dateLabel="Closing"
        expand="requisition,department,buyer,awarded_quotation"
        defaultSort="-created"
        exportName="rfqs"
        exportTitle="Requests for quotation"
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: FileSearch,
          title: "No RFQs yet.",
          text: view === "evaluate" ? "No RFQs are waiting for an award." : "No RFQs yet. RFQs are created from approved purchase requisitions.",
          action: canCreate && view === "all" ? <Button variant="primary" icon={Plus} onClick={() => setPicking(true)}>New RFQ</Button> : undefined,
        }}
      />
      <PickRequisition open={picking} onClose={() => setPicking(false)} />
    </Page>
  );
}

/** Choose an approved requisition to source. */
export function PickRequisition({ open, onClose, requisitionId }: { open: boolean; onClose: () => void; requisitionId?: string }) {
  const navigate = useNavigate();
  const [selected, setSelected] = React.useState<string | undefined>(requisitionId);
  const [closing, setClosing] = React.useState(() => new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10));
  React.useEffect(() => setSelected(requisitionId), [requisitionId, open]);
  const q = useQuery(["approved-requisitions"], () =>
    pocketbase.collection("purchase_requisitions").getFullList({ filter: `status = "approved"`, sort: "-approved_at", expand: "department,category" }),
    { enabled: open && !requisitionId }
  );
  const create = useMutation(() => sourcingApi.createRfq(selected!, { closing_date: `${closing} 17:00:00.000Z` }), {
    onSuccess: (r) => {
      toast.success(`${r.number} created as a draft. Check the suppliers, then send it.`);
      onClose();
      navigate(`/dashboard/procurement/rfqs/${r.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create RFQ"
      description="Items are copied from the approved requisition, without estimated prices. Suppliers that serve its category are preselected."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Plus} disabled={!selected} loading={create.isLoading} onClick={() => create.mutate()}>Create RFQ</Button>
        </>
      }
    >
      {!requisitionId &&
        (q.isLoading ? (
          <div className="space-y-2" aria-busy="true" aria-label="Loading">
            {Array.from({ length: 3 }, (_, i) => <Skeleton key={i} className="h-14 w-full rounded-control" />)}
          </div>
        ) : !q.data?.length ? (
          <EmptyState compact icon={FileSearch} text="No approved requisitions are waiting for sourcing." />
        ) : (
          <fieldset>
            <legend className="mb-1.5 text-t-label text-ims-text">Approved requisition</legend>
            <ul className="max-h-64 divide-y divide-ims-divider overflow-y-auto rounded-control border border-ims-border">
              {q.data.map((r: any) => (
                <li key={r.id}>
                  <label className={cn("flex cursor-pointer items-start gap-3 px-3 py-2.5 text-t-body hover:bg-ims-hover", selected === r.id && "bg-ims-info-bg hover:bg-ims-info-bg")}>
                    <input type="radio" name="pick-requisition" className="mt-1 shrink-0 accent-ims-primary" checked={selected === r.id} onChange={() => setSelected(r.id)} />
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-baseline gap-x-2">
                        <DocNo value={r.number} />
                        <span className="min-w-0 font-semibold text-ims-text">{r.title}</span>
                      </span>
                      <span className="block truncate text-t-small text-ims-muted">{[r.expand?.department?.name, r.expand?.category?.name].filter(Boolean).join(" · ")}</span>
                    </span>
                    <span className="shrink-0 whitespace-nowrap text-t-body tabular-nums text-ims-body">{fmtMoney(r.total)}</span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        ))}
      <Field label="Quotation closing date" required htmlFor="rfq-closing">
        <DatePicker id="rfq-closing" value={closing} min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} onChange={setClosing} />
      </Field>
    </Modal>
  );
}
