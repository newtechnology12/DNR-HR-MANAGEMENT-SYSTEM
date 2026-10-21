/**
 * Bank & cash → Bank statements: every imported statement with its period, balances and how much of it is
 * matched to the cash book. The Accountant imports new ones here.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/context/auth.context";
import { PERMS, STATEMENT_STATUS, activeAccounts } from "@/lib/treasury";
import { showDay } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { PageHeader, StatusBadge } from "@/components/enterprise/ui";
import RecordTable from "@/components/enterprise/RecordTable";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { KindIcon } from "@/components/treasury/TreasuryKit";
import StatementImport from "./StatementImport";

export default function Statements() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [choosing, setChoosing] = React.useState(false);
  const [accounts, setAccounts] = React.useState<any[]>([]);
  const [account, setAccount] = React.useState<any>(null);
  const [refresh, setRefresh] = React.useState(0);

  async function start() {
    const list = await activeAccounts("bank");
    if (list.length === 1) setAccount(list[0]);
    else {
      setAccounts(list);
      setChoosing(true);
    }
  }

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Bank statements"
        description="Statements imported from the banks' Excel or CSV files. Each line is matched to the cash book automatically; the rest is matched on the reconciliation screen."
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Bank statements", link: "/dashboard/treasury/statements" }]}
        actions={can("prepare_bank_reconciliation") && <Button onClick={start}><Upload size={15} /> Import a statement</Button>}
      />
      <RecordTable<any>
        collection="bank_statements"
        expand="account,imported_by"
        searchFields={["number", "file_name"]}
        filters={[
          { field: "account", label: "Account", collection: "bank_accounts", optionLabel: (a) => `${a.code} · ${a.name}`, optionFilter: 'kind = "bank"' },
          { field: "status", label: "Status", options: Object.entries(STATEMENT_STATUS).map(([value, s]) => ({ value, label: s.label })) },
        ]}
        dateField="statement_to"
        dateLabel="Statement to"
        defaultSort="-statement_to"
        refreshKey={refresh}
        exportName="bank-statements"
        exportTitle="Bank statements imported"
        exportPermission={PERMS.export}
        onRowClick={(r) => navigate(`/dashboard/treasury/statements/${r.id}`)}
        empty={{ icon: FileSpreadsheet, title: "No statement imported", text: "The Accountant imports the bank's statement file every month." }}
        columns={[
          { key: "number", header: "Statement", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-mono text-[12.5px] font-semibold text-slate-800">{r.number}</span> },
          { key: "account", header: "Account", csv: (r) => r.expand?.account?.code || "", cell: (r) => <span className="text-[12.5px] text-slate-700">{r.expand?.account?.code} · {r.expand?.account?.name}</span> },
          { key: "period", header: "Period", sortField: "statement_from", csv: (r) => `${showDay(r.statement_from)} – ${showDay(r.statement_to)}`, cell: (r) => <span className="whitespace-nowrap text-[12.5px]">{showDay(r.statement_from)} – {showDay(r.statement_to)}</span> },
          { key: "opening", header: "Opening", align: "right", format: "money", csv: (r) => r.opening_balance, cell: (r) => <span className="whitespace-nowrap tabular-nums">{r.opening_balance.toLocaleString("en-US")}</span> },
          { key: "closing", header: "Closing", sortField: "closing_balance", align: "right", format: "money", csv: (r) => r.closing_balance, cell: (r) => <span className="whitespace-nowrap font-medium tabular-nums">{r.closing_balance.toLocaleString("en-US")}</span> },
          {
            key: "matched", header: "Matched", csv: (r) => `${r.matched_count}/${r.line_count}`,
            cell: (r) => {
              const pct = r.line_count ? Math.round((r.matched_count / r.line_count) * 100) : 0;
              return (
                <span className="flex min-w-[130px] items-center gap-2">
                  <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><span className="block h-full rounded-full bg-[#2a78d6]" style={{ width: `${pct}%` }} /></span>
                  <span className="text-[12px] tabular-nums text-slate-600">{r.matched_count}/{r.line_count}</span>
                </span>
              );
            },
          },
          { key: "by", header: "Imported by", exportOnly: true, csv: (r) => r.expand?.imported_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => STATEMENT_STATUS[r.status]?.label || r.status, cell: (r) => <StatusBadge status={r.status} map={STATEMENT_STATUS} /> },
        ]}
      />
      <Dialog open={choosing} onOpenChange={setChoosing}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Which account?</DialogTitle>
            <DialogDescription>Choose the bank account the statement belongs to.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            {accounts.map((a) => (
              <button key={a.id} type="button" onClick={() => { setChoosing(false); setAccount(a); }} className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 text-left hover:border-primary hover:bg-primary/5">
                <KindIcon kind="bank" />
                <span className="min-w-0">
                  <span className="block text-[13.5px] font-semibold text-slate-900">{a.code} · {a.name}</span>
                  <span className="block text-[12px] text-slate-500">{a.bank_name} · {a.statement_date ? `imported up to ${showDay(a.statement_date)}` : "no statement yet"}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
      {account && (
        <StatementImport
          account={account}
          onClose={() => setAccount(null)}
          onDone={(r) => {
            setAccount(null);
            setRefresh((n) => n + 1);
            toast.success(`${r.number}: ${r.lines} lines, ${r.matched} matched automatically`);
            navigate(`/dashboard/treasury/statements/${r.id}`);
          }}
        />
      )}
    </div>
  );
}
