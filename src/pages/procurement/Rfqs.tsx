import * as React from "react";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { format, isPast } from "date-fns";
import { toast } from "sonner";
import { FileSearch, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import RecordTable, { RecordColumn, RecordView } from "@/components/enterprise/RecordTable";
import { Badge, EmptyState, ListSkeleton, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { RFQ_STATUS, errorMessage, money, sourcingApi } from "@/lib/procurement";
import { cn } from "@/utils";

export default function Rfqs() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { canPerform } = useRoles();
  const [picking, setPicking] = React.useState(false);
  const view = params.get("view") || "all";
  const now = new Date().toISOString().replace("T", " ");

  const views: RecordView[] = [
    { key: "all", label: "All RFQs" },
    { key: "draft", label: "Drafts", filter: `status = "draft"` },
    { key: "open", label: "Open for quotes", filter: `status = "sent"` },
    { key: "evaluate", label: "Awaiting award", filter: `status = "closed" || (status = "sent" && closing_date < "${now}")` },
    { key: "awarded", label: "Awarded", filter: `status = "awarded"` },
    { key: "mine", label: "My RFQs (buyer)", filter: `buyer = "${pocketbase.authStore.model?.id}"` },
  ];

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "RFQ", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number}</span> },
    {
      key: "title",
      header: "Title",
      sortField: "title",
      className: "max-w-[260px]",
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate text-slate-800">{r.title}</p>
          <p className="truncate text-[12px] text-slate-500">{r.expand?.requisition?.number} · {r.expand?.department?.name}</p>
        </div>
      ),
    },
    { key: "suppliers", header: "Suppliers", cell: (r) => <span className="tabular-nums">{r.suppliers?.length || 0}</span>, csv: (r) => r.suppliers?.length || 0 },
    {
      key: "closing",
      header: "Closing",
      sortField: "closing_date",
      cell: (r) => {
        const overdue = r.status === "sent" && isPast(new Date(r.closing_date));
        return <span className={cn("whitespace-nowrap", overdue ? "font-medium text-amber-700" : "text-slate-600")}>{r.closing_date ? format(new Date(r.closing_date), "d MMM yyyy") : "—"}{overdue && " · closed?"}</span>;
      },
      csv: (r) => r.closing_date?.slice(0, 10),
    },
    { key: "buyer", header: "Buyer", cell: (r) => <span className="whitespace-nowrap">{r.expand?.buyer?.name || "—"}</span>, csv: (r) => r.expand?.buyer?.name || "" },
    {
      key: "award",
      header: "Awarded",
      cell: (r) =>
        r.expand?.awarded_quotation ? (
          <span className="whitespace-nowrap tabular-nums">
            {money(r.expand.awarded_quotation.grand_total, r.expand.awarded_quotation.currency)}
            {r.award_not_lowest && <Badge tone="warning" className="ml-1.5">Not lowest</Badge>}
          </span>
        ) : "—",
      csv: (r) => r.expand?.awarded_quotation?.grand_total ?? "",
    },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status} map={RFQ_STATUS} />, csv: (r) => RFQ_STATUS[r.status]?.label },
  ];

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Requests for quotation"
        description="Sourcing for approved requisitions: invite suppliers, record their quotations, compare and award."
        breadcrumbs={[{ title: "Procurement", link: "/dashboard/procurement" }, { title: "RFQs", link: "/dashboard/procurement/rfqs" }]}
        actions={canPerform("manage_rfqs") && <Button onClick={() => setPicking(true)}><Plus size={15} /> New RFQ</Button>}
      />
      <RecordTable
        collection="rfqs"
        columns={columns}
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "title", "requisition.number", "department.name"]}
        expand="requisition,department,buyer,awarded_quotation"
        defaultSort="-created"
        exportName="rfqs"
        onRowClick={(r) => navigate(`/dashboard/procurement/rfqs/${r.id}`)}
        empty={{ icon: FileSearch, title: "No RFQs found", text: "RFQs are created from approved purchase requisitions." }}
      />
      <PickRequisition open={picking} onClose={() => setPicking(false)} />
    </div>
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
      toast.success(`${r.number} created as a draft — review suppliers and send it`);
      onClose();
      navigate(`/dashboard/procurement/rfqs/${r.id}`);
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>Create RFQ</DialogTitle>
          <DialogDescription>Items are copied from the approved requisition (without estimated prices). Suppliers serving its category are pre-selected.</DialogDescription>
        </DialogHeader>
        {!requisitionId && (
          q.isLoading ? <ListSkeleton rows={3} /> : !q.data?.length ? (
            <EmptyState icon={FileSearch} text="No approved requisitions are waiting for sourcing." />
          ) : (
            <ul className="max-h-64 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200">
              {q.data.map((r: any) => (
                <li key={r.id}>
                  <button type="button" onClick={() => setSelected(r.id)} className={cn("flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-[13px] hover:bg-slate-50", selected === r.id && "bg-primary/10")}>
                    <span className="min-w-0"><span className="font-medium">{r.number}</span> · <span className="text-slate-700">{r.title}</span><span className="block text-[12px] text-slate-500">{r.expand?.department?.name} · {r.expand?.category?.name}</span></span>
                    <span className="shrink-0 tabular-nums text-slate-600">{money(r.total)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        )}
        <label className="block text-[12.5px] font-medium text-slate-700">
          Quotation closing date
          <input type="date" className="mt-1 h-9 w-full rounded-md border border-slate-200 px-3 text-[13px]" value={closing} min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} onChange={(e) => setClosing(e.target.value)} />
        </label>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!selected || create.isLoading} onClick={() => create.mutate()}>{create.isLoading ? "Creating…" : "Create RFQ"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
