/**
 * One bank account or cash book: balances and reconciliation status, the cash book with its running balance,
 * the imported statements, the reconciliations and the account details.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { toast } from "sonner";
import { ArrowRightLeft, ExternalLink, FileSpreadsheet, Landmark, Pencil, PiggyBank, Scale, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { PERMS, REC_STATUS, STATEMENT_STATUS, treasuryApi } from "@/lib/treasury";
import { showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import {
  Button,
  ButtonLink,
  Card,
  CardHeader,
  Column,
  ConfirmDialog,
  DataTable,
  DatePicker,
  DetailHeader,
  Details,
  DocNo,
  EmptyState,
  KpiBand,
  MenuItem,
  MoreMenu,
  Num,
  Page,
  Tabs,
  fmtDate,
  fmtMoney,
  fmtNumber,
} from "@/components/ims";
import { KpiMoney, MatchBar, lastMonthEnd, periodText } from "@/components/treasury/TreasuryKit";
import { cn } from "@/utils";
import AccountDialog from "./AccountDialog";
import ReceiptDialog from "./ReceiptDialog";
import TransferDialog from "./TransferDialog";
import StatementImport from "./StatementImport";

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 7)}-01`;
const LIST = "/dashboard/treasury/accounts";

type Action = { key: string; label: string; icon: any; onClick: () => void };

export default function AccountDetail() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("cashbook");
  const [dialog, setDialog] = React.useState<"" | "edit" | "receipt" | "transfer" | "import">("");
  const q = useQuery(["bank-account", accountId], () => pocketbase.collection("bank_accounts").getOne(accountId!, { expand: "funding_source,custodian,gl_account,created_by" }));
  const used = useQuery(["bank-account-used", accountId], async () => (await pocketbase.collection("cash_book_entries").getList(1, 1, { filter: `account = "${accountId}"`, fields: "id" })).totalItems > 0);
  const a: any = q.data;
  if (q.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-16 w-full max-w-2xl" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-64 w-full" />
      </Page>
    );
  }
  if (!a) {
    return (
      <Page>
        <Card>
          <EmptyState icon={Landmark} text="This account is not available. It may be outside what your role can see." action={<ButtonLink to={LIST}>Back to accounts</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const bank = a.kind === "bank";
  const due = lastMonthEnd();
  const refresh = () => q.refetch();
  const isActive = a.status === "active";
  const reconciledTo = String(a.reconciled_to || "").slice(0, 10);
  const late = isActive && String(a.opening_date).slice(0, 10) <= due && (!reconciledTo || reconciledTo < due);
  const overLimit = !bank && a.cash_limit && a.book_balance > a.cash_limit;

  // The next step is the primary button, the next two are secondary, the rest go under "More".
  const actions: Action[] = [
    ...(can("prepare_bank_reconciliation") && isActive ? [{ key: "rec", label: bank ? "Reconcile" : "Count cash", icon: Scale, onClick: () => navigate(`/dashboard/treasury/reconcile/${a.id}`) }] : []),
    ...(can("manage_treasury") && isActive ? [{ key: "receipt", label: "Record a receipt", icon: PiggyBank, onClick: () => setDialog("receipt") }] : []),
    ...(bank && can("prepare_bank_reconciliation") && isActive ? [{ key: "import", label: "Import statement", icon: FileSpreadsheet, onClick: () => setDialog("import") }] : []),
    ...(can("manage_treasury") && isActive ? [{ key: "transfer", label: "New transfer", icon: ArrowRightLeft, onClick: () => setDialog("transfer") }] : []),
    ...(can("manage_bank_accounts") ? [{ key: "edit", label: "Edit account", icon: Pencil, onClick: () => setDialog("edit") }] : []),
  ];
  const [primary, ...rest] = actions;
  const secondary = rest.slice(0, 2);
  const more: MenuItem[] = rest.slice(2).map((x) => ({ label: x.label, icon: x.icon, onSelect: x.onClick }));

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to accounts", to: LIST }}
        number={a.code}
        type={bank ? "Bank account" : "Cash book"}
        status={a.status}
        statusMap={{ closed: "Inactive" }}
        statusNote={!isActive ? "Closed" : late ? `Reconciliation due to ${fmtDate(due)}` : undefined}
        title={a.name}
        facts={[
          ...(bank
            ? [`${a.bank_name}${a.branch ? `, ${a.branch}` : ""}`, a.account_number ? <span key="no" className="font-mono text-t-small">{a.account_number}</span> : null]
            : [{ label: "Held by", value: a.expand?.custodian?.name || "—" }]),
          a.expand?.gl_account?.code ? { label: "GL", value: a.expand.gl_account.code } : null,
          a.expand?.funding_source ? { label: "Restricted to", value: a.expand.funding_source.name } : "Unrestricted",
          a.is_default ? "Default for payments" : null,
        ]}
        actions={
          <>
            <MoreMenu items={more} />
            {secondary.map((x) => <Button key={x.key} icon={x.icon} onClick={x.onClick}>{x.label}</Button>)}
            {primary && <Button variant="primary" icon={primary.icon} onClick={primary.onClick}>{primary.label}</Button>}
          </>
        }
      />

      <KpiBand
        items={[
          { label: "Cash book balance", value: <KpiMoney value={a.book_balance} />, tone: overLimit ? "danger" : "default", sub: a.last_entry_date ? `Last movement ${fmtDate(a.last_entry_date)}` : `Opening balance on ${fmtDate(a.opening_date)}` },
          bank
            ? { label: "Bank statement balance", value: a.statement_date ? <KpiMoney value={a.statement_balance} /> : "—", sub: a.statement_date ? `Imported to ${fmtDate(a.statement_date)}` : "No statement imported" }
            : { label: "Cash limit", value: a.cash_limit ? <KpiMoney value={a.cash_limit} /> : "None", tone: overLimit ? "warning" : "default", sub: overLimit ? "Above the limit: bank the surplus" : "Most cash kept in the office" },
          { label: bank ? "Reconciled to" : "Last cash count", value: a.reconciled_to ? fmtDate(a.reconciled_to) : "Never", tone: a.reconciled_to && reconciledTo >= due ? "success" : "warning", sub: a.reconciled_to ? `${bank ? "Bank" : "Counted"}: ${fmtMoney(a.reconciled_balance)}` : undefined },
          bank
            ? { label: "Still to match", value: fmtNumber((a.unmatched_bank || 0) + (a.unmatched_book || 0)), sub: `${fmtNumber(a.unmatched_bank)} on the statement · ${fmtNumber(a.unmatched_book)} in the book` }
            : { label: "Entries since the count", value: fmtNumber(a.unmatched_book), sub: "Checked at the next cash count" },
        ]}
      />

      <Tabs
        label="Account sections"
        active={tab}
        onChange={setTab}
        tabs={[
          { key: "cashbook", label: "Cash book" },
          ...(bank ? [{ key: "statements", label: "Bank statements" }] : []),
          { key: "recs", label: bank ? "Reconciliations" : "Cash counts" },
          { key: "details", label: "Details" },
        ]}
      />

      {tab === "cashbook" && <CashBook account={a} />}
      {tab === "statements" && <Statements account={a} canDelete={can("prepare_bank_reconciliation")} onChanged={refresh} />}
      {tab === "recs" && <Reconciliations account={a} />}
      {tab === "details" && (
        <Card>
          <CardHeader title="Account details" />
          <Details
            columns={3}
            items={[
              { label: "Code", value: a.code },
              { label: "Type", value: bank ? "Bank account" : "Cash book" },
              { label: "Currency", value: a.currency || "RWF" },
              ...(bank
                ? [
                    { label: "Bank", value: a.bank_name },
                    { label: "Branch", value: a.branch },
                    { label: "Account number", value: a.account_number ? <span className="font-mono">{a.account_number}</span> : null },
                    { label: "Account name", value: a.account_name },
                    { label: "SWIFT / BIC", value: a.swift_code },
                    { label: "Signatories", value: a.signatories },
                  ]
                : [
                    { label: "Custodian", value: a.expand?.custodian?.name },
                    { label: "Cash limit", value: a.cash_limit ? fmtMoney(a.cash_limit) : "None" },
                  ]),
              { label: "GL cash account", value: a.expand?.gl_account ? `${a.expand.gl_account.code} ${a.expand.gl_account.name}` : "" },
              { label: "Funds", value: a.expand?.funding_source ? `Restricted to ${a.expand.funding_source.name}` : "Unrestricted" },
              { label: "Opening balance", value: `${fmtMoney(a.opening_balance)} on ${fmtDate(a.opening_date)}` },
              { label: "Default for payments", value: a.is_default ? "Yes" : "No" },
              { label: "Set up by", value: a.expand?.created_by?.name ? `${a.expand.created_by.name}, ${fmtDate(a.created)}` : fmtDate(a.created) },
              { label: "Notes", value: a.notes ? <span className="whitespace-pre-line">{a.notes}</span> : null, wide: true },
            ]}
          />
        </Card>
      )}

      <AccountDialog open={dialog === "edit"} account={a} locked={Boolean(used.data)} onClose={() => setDialog("")} onSaved={() => { setDialog(""); refresh(); }} />
      <ReceiptDialog open={dialog === "receipt"} prefill={{ account: a.id }} onClose={() => setDialog("")} onSaved={(id) => { setDialog(""); navigate(`/dashboard/treasury/receipts/${id}`); }} />
      <TransferDialog open={dialog === "transfer"} transfer={{ from_account: a.id }} onClose={() => setDialog("")} onSaved={(id) => { setDialog(""); navigate(`/dashboard/treasury/transfers/${id}`); }} />
      {dialog === "import" && <StatementImport account={a} onClose={() => setDialog("")} onDone={(r) => { setDialog(""); refresh(); toast.success(`${r.number}: ${r.lines} lines imported, ${r.matched} matched automatically`); }} />}
    </Page>
  );
}

function CashBook({ account }: { account: any }) {
  const [from, setFrom] = React.useState(() => (String(account.opening_date).slice(0, 10) > monthStart() ? String(account.opening_date).slice(0, 10) : monthStart()));
  const [to, setTo] = React.useState(today());
  const q = useQuery(["cash-book", account.id, from, to, account.book_balance], () => treasuryApi.report("cash_book", { account: account.id, from, to }), { keepPreviousData: true });
  const rows = q.data?.rows || [];
  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: `Cash book — ${account.code} ${account.name}`, subtitle: `${showDay(from)} to ${showDay(to)}`, rows, format, what: `treasury:cash_book:${account.code}`, orientation: "landscape",
      totals: ["Money in", "Money out"],
      columns: [
        { header: "Date", value: (r: any) => r.date, format: "date", width: 12 },
        { header: "Document", value: (r: any) => r.number, width: 16 },
        { header: "Type", value: (r: any) => r.type, width: 12 },
        { header: "Payee / payer · description", value: (r: any) => r.description, width: 40 },
        { header: "Reference", value: (r: any) => r.reference, width: 16 },
        { header: "Money in", value: (r: any) => r.money_in, format: "money", width: 14 },
        { header: "Money out", value: (r: any) => r.money_out, format: "money", width: 14 },
        { header: "Balance", value: (r: any) => r.balance, format: "money", width: 15 },
        { header: "Status", value: (r: any) => r.status, width: 18 },
      ],
    });

  const columns: Column<any>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (r) => fmtDate(r.date) },
    {
      key: "document",
      header: "Document",
      nowrap: true,
      cell: (r) => (r.link ? <Link to={r.link} className="whitespace-nowrap font-mono text-t-small font-semibold text-ims-link hover:underline">{r.number}</Link> : <DocNo value={r.number} />),
      sub: (r) => r.type,
    },
    { key: "description", header: "Payee / payer · description", clamp: true, cell: (r) => r.description, sub: (r) => (r.reference ? <span className="font-mono">{r.reference}</span> : null) },
    {
      key: "in",
      header: "Money in (RWF)",
      numeric: true,
      cell: (r) => (r.money_in ? <span className="text-ims-success"><Num value={r.money_in} /></span> : ""),
      total: <span className="text-ims-success"><Num value={q.data?.totals.money_in || 0} /></span>,
    },
    { key: "out", header: "Money out (RWF)", numeric: true, cell: (r) => (r.money_out ? <Num value={r.money_out} /> : ""), total: <Num value={q.data?.totals.money_out || 0} /> },
    { key: "balance", header: "Balance (RWF)", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.balance} /></span>, total: rows.length ? <Num value={rows[rows.length - 1].balance} /> : "" },
    {
      key: "status",
      header: "Status",
      nowrap: true,
      cell: (r) =>
        r.status ? (
          <span className={cn("text-t-small font-semibold", r.status.startsWith("Reconciled") ? "text-ims-success" : r.status === "On statement" ? "text-ims-link" : "text-ims-warning")}>{r.status}</span>
        ) : (
          ""
        ),
    },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader
          title="Cash book"
          subtitle="Every movement with the running balance; the last total is the closing balance."
          action={
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex flex-wrap items-center gap-1.5" role="group" aria-label="Cash book period">
            <span className="text-t-small font-semibold text-ims-muted">From</span>
            <DatePicker value={from} min={String(account.opening_date).slice(0, 10)} max={to || today()} onChange={setFrom} className="h-button w-[150px] text-t-body" />
            <span className="text-t-small font-semibold text-ims-muted">to</span>
            <DatePicker value={to} min={from} max={today()} onChange={setTo} className="h-button w-[150px] text-t-body" />
          </span>
          <ExportMenu onExport={doExport} permission={PERMS.export} disabled={!rows.length} size="default" />
        </div>
          }
        />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(_, i) => String(i)}
        loading={q.isLoading}
        fetching={q.isFetching}
        error={q.isError ? q.error : undefined}
        onRetry={() => q.refetch()}
        totalLabel="Period total"
        rowClassName={(r) => (r === rows[0] ? "bg-ims-thead font-semibold" : undefined)}
        minWidth={980}
        caption={`Cash book of ${account.code}`}
        empty={<EmptyState compact icon={Landmark} text="No movement in this period. Choose other dates." />}
      />
    </Card>
  );
}

function Statements({ account, canDelete, onChanged }: { account: any; canDelete: boolean; onChanged: () => void }) {
  const navigate = useNavigate();
  const [del, setDel] = React.useState<any>(null);
  const q = useQuery(["statements", account.id, account.statement_date, account.unmatched_bank], () => pocketbase.collection("bank_statements").getFullList({ filter: `account = "${account.id}"`, sort: "-statement_from", expand: "imported_by" }));
  const rows = (q.data || []) as any[];
  const open = (s: any) => navigate(`/dashboard/treasury/statements/${s.id}`);

  const columns: Column<any>[] = [
    { key: "number", header: "Statement", nowrap: true, cell: (s) => <DocNo value={s.number} />, sub: (s) => s.file_name },
    { key: "period", header: "Period", nowrap: true, cell: (s) => periodText(s.statement_from, s.statement_to) },
    { key: "opening", header: "Opening (RWF)", numeric: true, cell: (s) => <Num value={s.opening_balance} /> },
    { key: "closing", header: "Closing (RWF)", numeric: true, cell: (s) => <Num value={s.closing_balance} /> },
    { key: "lines", header: "Lines", numeric: true, cell: (s) => fmtNumber(s.line_count) },
    { key: "matched", header: "Matched", cell: (s) => <MatchBar matched={s.matched_count} total={s.line_count} /> },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} map={STATEMENT_STATUS} /> },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader title="Bank statements" subtitle="Imported from the bank's Excel or CSV file; lines are matched to the cash book automatically." />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(s) => s.id}
        onRowClick={open}
        rowActions={(s) => [
          { label: "Open", icon: ExternalLink, onSelect: open },
          ...(canDelete && s.status === "imported" ? [{ label: "Delete import", icon: Trash2, danger: true, onSelect: (x: any) => setDel(x) }] : []),
        ]}
        loading={q.isLoading}
        error={q.isError ? q.error : undefined}
        onRetry={() => q.refetch()}
        minWidth={820}
        caption="Imported bank statements"
        empty={<EmptyState compact icon={FileSpreadsheet} text="No statement imported yet. The Accountant imports the bank's statement file; its lines are matched to the cash book automatically." />}
      />
      <ConfirmDialog
        open={Boolean(del)}
        onClose={() => setDel(null)}
        danger
        title={`Delete ${del?.number || "this import"}?`}
        description={`Its ${fmtNumber(del?.line_count)} lines and their matches are removed, so the file can be imported again (for example after fixing the column mapping). Entries recorded from it stay in the cash book.`}
        confirmLabel="Delete import"
        onConfirm={async () => {
          try {
            await treasuryApi.deleteStatement(del.id);
            toast.success(`${del.number} deleted`);
            q.refetch();
            onChanged();
          } catch (e) {
            toast.error(errorMessage(e));
            throw e;
          }
        }}
      />
    </Card>
  );
}

function Reconciliations({ account }: { account: any }) {
  const navigate = useNavigate();
  const cash = account.kind !== "bank";
  const q = useQuery(["recs", account.id, account.reconciled_to], () => pocketbase.collection("bank_reconciliations").getFullList({ filter: `account = "${account.id}"`, sort: "-as_of", expand: "prepared_by" }));
  const rows = (q.data || []) as any[];

  const columns: Column<any>[] = [
    { key: "number", header: "Number", nowrap: true, cell: (r) => <DocNo value={r.number} /> },
    { key: "as_of", header: "As of", nowrap: true, cell: (r) => fmtDate(r.as_of) },
    { key: "bank", header: cash ? "Counted (RWF)" : "Bank (RWF)", numeric: true, cell: (r) => <Num value={r.statement_balance} /> },
    { key: "book", header: "Cash book (RWF)", numeric: true, cell: (r) => <Num value={r.book_balance} /> },
    { key: "items", header: "Items", numeric: true, cell: (r) => fmtNumber(r.item_count) },
    { key: "diff", header: "Difference (RWF)", numeric: true, cell: (r) => <span className={r.difference ? "font-semibold text-ims-danger" : "text-ims-success"}><Num value={r.difference} /></span> },
    { key: "by", header: "Prepared by", cell: (r) => r.expand?.prepared_by?.name || "—" },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} map={REC_STATUS} /> },
  ];

  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader title={cash ? "Cash counts" : "Reconciliations"} subtitle={cash ? "The Accountant counts the cash with the custodian; the DAF approves." : "Reconciled with the bank statement every month; the DAF approves."} />
      </div>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={(r) => navigate(`/dashboard/treasury/reconciliations/${r.id}`)}
        loading={q.isLoading}
        error={q.isError ? q.error : undefined}
        onRetry={() => q.refetch()}
        minWidth={820}
        caption={cash ? "Cash counts" : "Reconciliations"}
        empty={<EmptyState compact icon={Scale} text={cash ? "No cash count yet. The Accountant counts the cash with the custodian; the DAF approves." : "No reconciliation yet. The Accountant reconciles the account with the bank statement every month; the DAF approves."} />}
      />
    </Card>
  );
}
