/**
 * Bank & cash → Reconciliations: every bank reconciliation and cash count, prepared by the Accountant and
 * approved by the DAF, and where each account stands.
 */
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { ArrowRight, ExternalLink, Scale } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { PERMS, REC_STATUS } from "@/lib/treasury";
import { showDay } from "@/lib/ims";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { Card, CardHeader, DocNo, Num, Page, PageHeader, fmtDate, fmtNumber, statusText } from "@/components/ims";
import { KindIcon, ReconState, lastMonthEnd } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

export default function Reconciliations() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const accounts = useQuery(["rec-accounts"], () => pocketbase.collection("bank_accounts").getFullList({ filter: 'status = "active"', sort: "kind,code" }));
  const due = lastMonthEnd();
  const canPrepare = can("prepare_bank_reconciliation");
  const view = params.get("view") || (can("approve_bank_reconciliation") && !canPrepare ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All reconciliations" },
    { key: "draft", label: "Being prepared", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Pending approval", filter: 'status = "pending_approval"' },
    { key: "approved", label: "Approved", filter: 'status = "approved"' },
  ];
  const openRec = (r: any) => navigate(`/dashboard/treasury/reconciliations/${r.id}`);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Bank & cash", to: "/dashboard/treasury" }, { label: "Reconciliations" }]}
        title="Reconciliations"
        subtitle="Each bank account reconciled with its statement and each cash book counted, at least every month end."
      />

      {(accounts.data || []).length > 0 && (
        <Card>
          <CardHeader title="Where each account stands" subtitle={`Every account should be reconciled to ${fmtDate(due)}. The Accountant prepares; the DAF approves.`} />
          <ul className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {(accounts.data || []).map((a: any) => {
              const reconciled = String(a.reconciled_to || "").slice(0, 10);
              const counts = String(a.opening_date).slice(0, 10) <= due;
              const late = counts && (!reconciled || reconciled < due);
              const body = (
                <>
                  <KindIcon kind={a.kind} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-t-body font-semibold text-ims-text">{a.code} · {a.name}</span>
                    <ReconState reconciledTo={reconciled} due={counts ? due : undefined} kind={a.kind} />
                  </span>
                  {canPrepare && (
                    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-t-small font-bold text-ims-link">
                      {a.kind === "cash" ? "Count" : "Reconcile"} <ArrowRight size={13} aria-hidden />
                    </span>
                  )}
                </>
              );
              const cls = cn("flex min-h-[64px] items-center gap-3 rounded-control border px-3.5 py-3", late ? "border-ims-warning/40" : "border-ims-border");
              return (
                <li key={a.id}>
                  {canPrepare ? (
                    <Link to={`/dashboard/treasury/reconcile/${a.id}`} className={cn(cls, "transition-colors hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus")}>{body}</Link>
                  ) : (
                    <div className={cls}>{body}</div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      <RecordTable<any>
        collection="bank_reconciliations"
        expand="account,prepared_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "notes"]}
        searchPlaceholder="Search number or notes"
        filters={[{ field: "account", label: "Account", collection: "bank_accounts", optionLabel: (a) => `${a.code} · ${a.name}` }]}
        dateField="as_of"
        dateLabel="As of"
        defaultSort="-as_of"
        exportName="bank-reconciliations"
        exportTitle="Bank reconciliations"
        exportPermission={PERMS.export}
        onRowClick={openRec}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: openRec }]}
        empty={{ icon: Scale, title: "No reconciliation yet", text: view === "pending" ? "No reconciliation is waiting for the DAF." : "No reconciliation yet. Choose an account above to start." }}
        columns={[
          { key: "number", header: "Number", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
          { key: "account", header: "Account", nowrap: true, csv: (r) => r.expand?.account?.code || "", cell: (r) => r.expand?.account?.code || "—", sub: (r) => (r.expand?.account?.kind === "cash" ? "Cash count" : r.expand?.account?.name) },
          { key: "as_of", header: "As of", sortField: "as_of", nowrap: true, format: "date", csv: (r) => showDay(r.as_of), cell: (r) => fmtDate(r.as_of) },
          { key: "bank", header: "Bank or counted (RWF)", align: "right", format: "money", csv: (r) => r.statement_balance, cell: (r) => <Num value={r.statement_balance} /> },
          { key: "book", header: "Cash book (RWF)", align: "right", format: "money", csv: (r) => r.book_balance, cell: (r) => <Num value={r.book_balance} /> },
          { key: "items", header: "Open items", align: "right", format: "number", csv: (r) => r.item_count, cell: (r) => fmtNumber(r.item_count) },
          { key: "diff", header: "Difference (RWF)", sortField: "difference", align: "right", format: "money", csv: (r) => r.difference, cell: (r) => <span className={r.difference ? "font-semibold text-ims-danger" : "text-ims-success"}><Num value={r.difference} /></span> },
          { key: "by", header: "Prepared by", exportOnly: true, csv: (r) => r.expand?.prepared_by?.name || "", cell: (r) => r.expand?.prepared_by?.name || "—" },
          { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(REC_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={REC_STATUS} /> },
        ]}
      />
    </Page>
  );
}
