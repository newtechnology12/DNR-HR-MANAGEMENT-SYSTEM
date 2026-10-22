/**
 * Bank & cash → Bank statements: every imported statement with its period, balances and how much of it is
 * matched to the cash book. The Accountant imports new ones here.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { ExternalLink, FileSpreadsheet, Upload } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/context/auth.context";
import { PERMS, STATEMENT_STATUS, activeAccounts } from "@/lib/treasury";
import { showDay } from "@/lib/ims";
import { StatusBadge } from "@/components/enterprise/ui";
import RecordTable from "@/components/enterprise/RecordTable";
import { Button, DocNo, EmptyState, Modal, Num, Page, PageHeader, fmtDate, statusText } from "@/components/ims";
import { KindIcon, MatchBar, periodText } from "@/components/treasury/TreasuryKit";
import StatementImport from "./StatementImport";

export default function Statements() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [choosing, setChoosing] = React.useState(false);
  const [accounts, setAccounts] = React.useState<any[]>([]);
  const [account, setAccount] = React.useState<any>(null);
  const [refresh, setRefresh] = React.useState(0);
  const canImport = can("prepare_bank_reconciliation");

  async function start() {
    const list = await activeAccounts("bank");
    if (list.length === 1) setAccount(list[0]);
    else {
      setAccounts(list);
      setChoosing(true);
    }
  }

  const openStatement = (r: any) => navigate(`/dashboard/treasury/statements/${r.id}`);
  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Bank & cash", to: "/dashboard/treasury" }, { label: "Bank statements" }]}
        title="Bank statements"
        subtitle="Statements imported from the banks' Excel or CSV files, each line matched to the cash book."
        primary={canImport ? { label: "Import a statement", icon: Upload, onClick: start } : undefined}
      />
      <RecordTable<any>
        collection="bank_statements"
        expand="account,imported_by"
        searchFields={["number", "file_name"]}
        searchPlaceholder="Search number or file name"
        filters={[
          { field: "account", label: "Account", collection: "bank_accounts", optionLabel: (a) => `${a.code} · ${a.name}`, optionFilter: 'kind = "bank"' },
          { field: "status", label: "Status", options: Object.entries(STATEMENT_STATUS).map(([value, s]) => ({ value, label: statusText(s) })) },
        ]}
        dateField="statement_to"
        dateLabel="Statement to"
        defaultSort="-statement_to"
        refreshKey={refresh}
        exportName="bank-statements"
        exportTitle="Bank statements imported"
        exportPermission={PERMS.export}
        onRowClick={openStatement}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: openStatement }]}
        empty={{
          icon: FileSpreadsheet,
          title: "No statement imported",
          text: "No statement imported yet. The Accountant imports the bank's statement file every month.",
          action: canImport ? <Button variant="primary" icon={Upload} onClick={start}>Import a statement</Button> : undefined,
        }}
        columns={[
          { key: "number", header: "Statement", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => r.file_name },
          { key: "account", header: "Account", nowrap: true, csv: (r) => r.expand?.account?.code || "", cell: (r) => r.expand?.account?.code || "—", sub: (r) => r.expand?.account?.name },
          { key: "period", header: "Period", sortField: "statement_from", nowrap: true, csv: (r) => `${showDay(r.statement_from)} – ${showDay(r.statement_to)}`, cell: (r) => periodText(r.statement_from, r.statement_to) },
          { key: "opening", header: "Opening (RWF)", exportOnly: true, align: "right", format: "money", csv: (r) => r.opening_balance, cell: (r) => <Num value={r.opening_balance} /> },
          { key: "closing", header: "Closing (RWF)", sortField: "closing_balance", align: "right", format: "money", csv: (r) => r.closing_balance, cell: (r) => <span className="font-semibold"><Num value={r.closing_balance} /></span> },
          { key: "matched", header: "Matched", csv: (r) => `${r.matched_count}/${r.line_count}`, cell: (r) => <MatchBar matched={r.matched_count} total={r.line_count} /> },
          { key: "by", header: "Imported by", exportOnly: true, csv: (r) => r.expand?.imported_by?.name || "", cell: () => null },
          { key: "status", header: "Status", sortField: "status", csv: (r) => statusText(STATEMENT_STATUS[r.status], r.status), cell: (r) => <StatusBadge status={r.status} map={STATEMENT_STATUS} /> },
        ]}
      />
      <Modal
        open={choosing}
        onClose={() => setChoosing(false)}
        size="sm"
        title="Which account?"
        description="Choose the bank account the statement belongs to."
        footer={<Button variant="secondary" onClick={() => setChoosing(false)}>Cancel</Button>}
      >
        {accounts.length ? (
          <ul className="space-y-2">
            {accounts.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => { setChoosing(false); setAccount(a); }}
                  className="flex w-full items-center gap-3 rounded-control border border-ims-border px-3.5 py-3 text-left transition-colors hover:border-ims-link hover:bg-ims-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus"
                >
                  <KindIcon kind="bank" />
                  <span className="min-w-0">
                    <span className="block truncate text-t-body font-semibold text-ims-text">{a.code} · {a.name}</span>
                    <span className="block truncate text-t-small text-ims-muted">{a.bank_name} · {a.statement_date ? `imported up to ${fmtDate(a.statement_date)}` : "no statement yet"}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState compact icon={FileSpreadsheet} text="No active bank account. The Director of Finance sets up the bank accounts first." />
        )}
      </Modal>
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
    </Page>
  );
}
