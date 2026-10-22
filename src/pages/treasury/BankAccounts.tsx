/**
 * Bank & cash → Accounts: RALGA's bank accounts and cash books with their cash book balance, the last bank
 * statement, how far each is reconciled and what is still to match. The DAF sets accounts up.
 */
import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "react-query";
import { ExternalLink, Landmark, Plus, Scale } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { PERMS } from "@/lib/treasury";
import { showDay } from "@/lib/ims";
import { exportReport } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Button, Card, Column, DataTable, EmptyState, Num, Page, PageHeader, Pill, RowAction, Tabs, fmtDate, fmtNumber } from "@/components/ims";
import { ReconState, lastMonthEnd } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";
import AccountDialog from "./AccountDialog";

type TabKey = "bank" | "cash" | "closed";

export default function BankAccounts() {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [open, setOpen] = React.useState(false);
  const [tab, setTab] = React.useState<TabKey | "">("");
  const q = useQuery(["bank-accounts"], () => pocketbase.collection("bank_accounts").getFullList({ sort: "kind,code", expand: "funding_source,custodian,gl_account" }));
  const all = (q.data || []) as any[];
  const active = all.filter((a) => a.status === "active");
  const closed = all.filter((a) => a.status !== "active");
  const due = lastMonthEnd();
  const lists: Record<TabKey, any[]> = { bank: active.filter((a) => a.kind === "bank"), cash: active.filter((a) => a.kind === "cash"), closed };
  const current: TabKey = tab || (lists.bank.length || !lists.cash.length ? "bank" : "cash");
  const canReconcile = can("prepare_bank_reconciliation");
  const canManage = can("manage_bank_accounts");

  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: "Bank and cash accounts", subtitle: `Balances as of ${showDay(new Date().toISOString())}`, rows: all, format, what: "treasury:accounts", orientation: "landscape",
      totals: ["Cash book balance"],
      columns: [
        { header: "Code", value: (a: any) => a.code, width: 12 },
        { header: "Name", value: (a: any) => a.name, width: 26 },
        { header: "Type", value: (a: any) => (a.kind === "cash" ? "Cash book" : "Bank"), width: 10 },
        { header: "Bank", value: (a: any) => a.bank_name, width: 18 },
        { header: "Account number", value: (a: any) => a.account_number, width: 20 },
        { header: "GL", value: (a: any) => a.expand?.gl_account?.code || "", width: 8 },
        { header: "Funds", value: (a: any) => (a.expand?.funding_source ? `Restricted: ${a.expand.funding_source.name}` : "Unrestricted"), width: 24 },
        { header: "Cash book balance", value: (a: any) => a.book_balance, format: "money", width: 16 },
        { header: "Statement balance", value: (a: any) => (a.kind === "bank" ? a.statement_balance : ""), format: "money", width: 16 },
        { header: "Statement to", value: (a: any) => a.statement_date, format: "date", width: 12 },
        { header: "Reconciled to", value: (a: any) => a.reconciled_to, format: "date", width: 12 },
        { header: "Status", value: (a: any) => (a.status === "active" ? "Active" : "Closed"), width: 10 },
      ],
    });

  const openAccount = (a: any) => navigate(`/dashboard/treasury/accounts/${a.id}`);
  const dueFor = (a: any) => (a.status === "active" && String(a.opening_date).slice(0, 10) <= due ? due : undefined);
  const rows = lists[current];
  const totalBook = rows.reduce((s, a) => s + (a.book_balance || 0), 0);

  const nameCol: Column<any> = {
    key: "name",
    header: "Account",
    className: "min-w-[220px]",
    cell: (a) => (
      <span className="flex flex-wrap items-center gap-1.5">
        <span className="font-semibold text-ims-text">{a.name}</span>
        {a.is_default && <Pill tone="neutral">Default for payments</Pill>}
        {a.expand?.funding_source && <Pill tone="info" title={`Only for ${a.expand.funding_source.name}`}>Restricted</Pill>}
      </span>
    ),
    sub: (a) =>
      a.kind === "bank"
        ? [a.code, a.bank_name, a.account_number].filter(Boolean).join(" · ")
        : `${a.code} · Held by ${a.expand?.custodian?.name || "—"}`,
  };
  const bookCol: Column<any> = {
    key: "book",
    header: "Cash book (RWF)",
    numeric: true,
    cell: (a) => {
      const over = a.kind === "cash" && a.cash_limit > 0 && a.book_balance > a.cash_limit;
      return <span className={cn("font-semibold", over && "text-ims-danger")}><Num value={a.book_balance} /></span>;
    },
    sub: (a) => (a.kind === "cash" && a.cash_limit > 0 && a.book_balance > a.cash_limit ? <span className="text-ims-danger">Above the limit: bank the surplus</span> : null),
    total: <Num value={totalBook} />,
  };
  const recCol: Column<any> = {
    key: "rec",
    header: current === "cash" ? "Cash count" : "Reconciliation",
    cell: (a) => <ReconState reconciledTo={String(a.reconciled_to || "").slice(0, 10)} due={dueFor(a)} kind={a.kind} />,
  };

  const columns: Column<any>[] =
    current === "bank"
      ? [
          nameCol,
          bookCol,
          {
            key: "statement",
            header: "Bank statement (RWF)",
            numeric: true,
            cell: (a) => (a.statement_date ? <Num value={a.statement_balance} /> : <span className="text-ims-faint">None imported</span>),
            sub: (a) => (a.statement_date ? `to ${fmtDate(a.statement_date)}` : null),
          },
          recCol,
          {
            key: "match",
            header: "To match",
            numeric: true,
            cell: (a) => {
              const n = (a.unmatched_bank || 0) + (a.unmatched_book || 0);
              return `${fmtNumber(n)} item${n === 1 ? "" : "s"}`;
            },
          },
        ]
      : current === "cash"
        ? [
            nameCol,
            bookCol,
            { key: "limit", header: "Cash limit (RWF)", numeric: true, cell: (a) => (a.cash_limit ? <Num value={a.cash_limit} /> : <span className="text-ims-faint">None</span>) },
            recCol,
            {
              key: "since",
              header: "Since last count",
              numeric: true,
              cell: (a) => `${fmtNumber(a.unmatched_book || 0)} entr${a.unmatched_book === 1 ? "y" : "ies"}`,
            },
          ]
        : [
            nameCol,
            { key: "type", header: "Type", cell: (a) => (a.kind === "cash" ? "Cash book" : "Bank account") },
            bookCol,
            { key: "reconciled", header: "Last reconciled", nowrap: true, cell: (a) => fmtDate(String(a.reconciled_to || "").slice(0, 10)) },
          ];

  const rowActions = (a: any): RowAction<any>[] => [
    { label: "Open", icon: ExternalLink, onSelect: openAccount },
    ...(canReconcile && a.status === "active" ? [{ label: a.kind === "bank" ? "Reconcile" : "Count cash", icon: Scale, onSelect: () => navigate(`/dashboard/treasury/reconcile/${a.id}`) }] : []),
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Bank & cash", to: "/dashboard/treasury" }, { label: "Accounts" }]}
        title="Bank and cash accounts"
        subtitle="Each account's cash book balance, its last bank statement and how far it is reconciled."
        actions={<ExportMenu onExport={doExport} permission={PERMS.export} disabled={!all.length} size="default" />}
        primary={canManage ? { label: "New account", icon: Plus, onClick: () => setOpen(true) } : undefined}
      />
      <Card padded={false} className="overflow-hidden">
        <Tabs
          inset
          label="Account types"
          active={current}
          onChange={(k) => setTab(k as TabKey)}
          tabs={[
            { key: "bank", label: "Bank accounts", count: q.isLoading ? null : lists.bank.length },
            { key: "cash", label: "Cash books", count: q.isLoading ? null : lists.cash.length },
            ...(closed.length ? [{ key: "closed", label: "Closed", count: closed.length }] : []),
          ]}
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(a) => a.id}
          onRowClick={openAccount}
          rowActions={rowActions}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={820}
          caption={current === "bank" ? "Bank accounts" : current === "cash" ? "Cash books" : "Closed accounts"}
          empty={
            <EmptyState
              icon={Landmark}
              text={
                all.length
                  ? current === "cash"
                    ? "No cash book is set up."
                    : current === "closed"
                      ? "No closed accounts."
                      : "No bank account is set up."
                  : "No accounts yet. The Director of Finance sets up the bank accounts and the petty cash book, with their opening balances."
              }
              action={canManage && current !== "closed" ? <Button variant="primary" icon={Plus} onClick={() => setOpen(true)}>New account</Button> : undefined}
            />
          }
        />
      </Card>
      <AccountDialog open={open} onClose={() => setOpen(false)} onSaved={(id) => { setOpen(false); q.refetch(); navigate(`/dashboard/treasury/accounts/${id}`); }} />
    </Page>
  );
}
