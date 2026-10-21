/**
 * Bank & cash → Reconciliations: every bank reconciliation and cash count, prepared by the Accountant and
 * approved by the DAF, and where each account stands.
 */
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "react-query";
import { Scale } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { PERMS, REC_STATUS } from "@/lib/treasury";
import { showDay } from "@/lib/ims";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable, { RecordView } from "@/components/enterprise/RecordTable";
import { KindIcon, ReconState, lastMonthEnd } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";

export default function Reconciliations() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { can } = usePermissions();
  const accounts = useQuery(["rec-accounts"], () => pocketbase.collection("bank_accounts").getFullList({ filter: 'status = "active"', sort: "kind,code" }));
  const due = lastMonthEnd();
  const view = params.get("view") || (can("approve_bank_reconciliation") && !can("prepare_bank_reconciliation") ? "pending" : "all");
  const views: RecordView[] = [
    { key: "all", label: "All" },
    { key: "draft", label: "Being prepared", filter: 'status = "draft" || status = "returned"' },
    { key: "pending", label: "Waiting for the DAF", filter: 'status = "pending_approval"' },
    { key: "approved", label: "Approved", filter: 'status = "approved"' },
  ];
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Reconciliations"
        description="Each bank account is reconciled with its statement and each cash book is counted, at least every month end. The Accountant prepares; the DAF approves; whoever prepares cannot approve."
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Reconciliations", link: "/dashboard/treasury/reconciliations" }]}
      />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {(accounts.data || []).map((a: any) => {
          const reconciled = String(a.reconciled_to || "").slice(0, 10);
          const late = String(a.opening_date).slice(0, 10) <= due && (!reconciled || reconciled < due);
          return (
            <button key={a.id} type="button" disabled={!can("prepare_bank_reconciliation")} onClick={() => navigate(`/dashboard/treasury/reconcile/${a.id}`)} className={cn("flex items-center gap-3 rounded-lg border bg-white px-3.5 py-3 text-left shadow-card enabled:hover:border-primary", late ? "border-amber-200" : "border-slate-200")}>
              <KindIcon kind={a.kind} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13.5px] font-semibold text-slate-900">{a.code} · {a.name}</span>
                <ReconState reconciledTo={reconciled} due={String(a.opening_date).slice(0, 10) <= due ? due : undefined} kind={a.kind} />
              </span>
              {can("prepare_bank_reconciliation") && <span className="whitespace-nowrap text-[12.5px] font-medium text-primaryDark">{a.kind === "cash" ? "Count" : "Reconcile"} →</span>}
            </button>
          );
        })}
      </div>
      <RecordTable<any>
        collection="bank_reconciliations"
        expand="account,prepared_by"
        views={views}
        activeView={view}
        onViewChange={(v) => setParams(v === "all" ? {} : { view: v })}
        searchFields={["number", "notes"]}
        filters={[{ field: "account", label: "Account", collection: "bank_accounts", optionLabel: (a) => `${a.code} · ${a.name}` }]}
        dateField="as_of"
        dateLabel="As of"
        defaultSort="-as_of"
        exportName="bank-reconciliations"
        exportTitle="Bank reconciliations"
        exportPermission={PERMS.export}
        onRowClick={(r) => navigate(`/dashboard/treasury/reconciliations/${r.id}`)}
        empty={{ icon: Scale, title: "No reconciliation yet", text: "Choose an account above to start." }}
        columns={[
          { key: "number", header: "Number", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "account", header: "Account", csv: (r) => r.expand?.account?.code || "", cell: (r) => <span className="text-[12.5px] text-slate-700">{r.expand?.account?.code} · {r.expand?.account?.kind === "cash" ? "cash count" : r.expand?.account?.name}</span> },
          { key: "as_of", header: "As of", sortField: "as_of", format: "date", csv: (r) => showDay(r.as_of), cell: (r) => <span className="whitespace-nowrap text-[12.5px]">{showDay(r.as_of)}</span> },
          { key: "bank", header: "Bank / counted", align: "right", format: "money", csv: (r) => r.statement_balance, cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.statement_balance.toLocaleString("en-US")}</span> },
          { key: "book", header: "Cash book", align: "right", format: "money", csv: (r) => r.book_balance, cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.book_balance.toLocaleString("en-US")}</span> },
          { key: "items", header: "Open items", align: "right", format: "number", csv: (r) => r.item_count, cell: (r) => <span className="tabular-nums">{r.item_count}</span> },
          { key: "diff", header: "Difference", sortField: "difference", align: "right", format: "money", csv: (r) => r.difference, cell: (r) => <span className={cn("whitespace-nowrap tabular-nums", r.difference ? "font-semibold text-red-600" : "text-emerald-700")}>{r.difference.toLocaleString("en-US")}</span> },
          { key: "by", header: "Prepared by", csv: (r) => r.expand?.prepared_by?.name || "", cell: (r) => <span className="text-[12.5px] text-slate-600">{r.expand?.prepared_by?.name}</span> },
          { key: "status", header: "Status", sortField: "status", csv: (r) => REC_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={REC_STATUS} /> },
        ]}
      />
    </div>
  );
}
