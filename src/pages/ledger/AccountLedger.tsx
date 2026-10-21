/**
 * General ledger → Account ledger: every posting on one account for a period with the running balance, each line
 * linked to its journal and to the document that caused it. Opened from the trial balance with the same period and
 * filters.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { useDebounce } from "use-debounce";
import { ListOrdered, Scale } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { exportReport, ExportFormat } from "@/lib/exporter";
import { ACCOUNT_TYPES, AccountLedger as Ledger, JOURNAL_SOURCES, JOURNAL_TYPES, ledgerApi, sourceLink } from "@/lib/ledger";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Card, Column, DataTable, DocNo, EmptyState, FilterBar, KpiBand, Num, Page, PageHeader, Pager, TwoLine, fmtDate, fmtNumber } from "@/components/ims";
import { LedgerFilterControls, ledgerQuery, periodLabel, useLedgerChips, useLedgerFilter } from "@/components/ledger/LedgerFilters";

type Row = Ledger["rows"][number];

/** 1,250,000 Dr / 830,000 Cr / Nil. */
const drcr = (n: number) => (n ? `${fmtNumber(Math.abs(n))} ${n > 0 ? "Dr" : "Cr"}` : "Nil");
const sideOf = (n: number) => (n > 0 ? "debit balance" : n < 0 ? "credit balance" : "nil balance");

export default function AccountLedger() {
  const { accountId } = useParams();
  const navigate = useNavigate();
  const { f, set } = useLedgerFilter();
  const chips = useLedgerChips(f, set);
  const [search, setSearch] = React.useState("");
  const [needle] = useDebounce(search.trim().toLowerCase(), 200);
  const [page, setPage] = React.useState(1);
  const [perPage, setPerPage] = React.useState(50);
  const q = useQuery(["account-ledger", accountId, f], () => ledgerApi.account(accountId!, f), { keepPreviousData: true, enabled: Boolean(accountId) });
  const accounts = useQuery(["ledger-accounts"], () => pocketbase.collection("gl_accounts").getFullList({ filter: "is_posting = true", sort: "code", fields: "id,code,name" }), { staleTime: 300_000 });
  const led = q.data && q.data.account.id === accountId ? q.data : undefined;
  const rows = React.useMemo(
    () => (led?.rows || []).filter((r) => !needle || [r.number, r.description, r.source_number, r.department, r.funding, r.project].some((v) => String(v || "").toLowerCase().includes(needle))),
    [led, needle]
  );
  React.useEffect(() => setPage(1), [needle, f.from, f.to, f.department, f.funding_source, f.project, accountId]);
  const shown = rows.slice((page - 1) * perPage, page * perPage);
  const title = led ? `${led.account.code} · ${led.account.name}` : "Account ledger";
  const query = ledgerQuery(f, led);

  const doExport = async (format: ExportFormat) => {
    if (!led) return;
    const opening = { id: "opening", date: led.from, number: "", journal_type: "", source_type: "", source_number: "", description: "Opening balance", department: "", funding: "", project: "", debit: 0, credit: 0, balance: led.opening } as Row;
    await exportReport({
      title: `Account ledger — ${led.account.code} ${led.account.name}`,
      subtitle: [periodLabel(led.from, led.to), ...chips.map((c) => c.label), needle && `Search: “${search.trim()}”`, `Closing balance ${drcr(led.closing)}`].filter(Boolean).join(" · "),
      rows: [opening, ...rows],
      format,
      what: "gl_journal_lines",
      fileName: `ledger-${led.account.code}-${led.to}`,
      orientation: "landscape",
      totals: ["Debit", "Credit"],
      columns: [
        { header: "Date", value: (r) => r.date, format: "date" },
        { header: "Journal", value: (r) => r.number, width: 16 },
        { header: "Description", value: (r) => r.description, width: 44 },
        { header: "Source", value: (r) => (r.source_type ? `${JOURNAL_SOURCES[r.source_type] || r.source_type} ${r.source_number || ""}`.trim() : ""), width: 24 },
        { header: "Department", value: (r) => r.department, width: 20 },
        { header: "Fund", value: (r) => r.funding, width: 10 },
        { header: "Project", value: (r) => r.project, width: 10 },
        { header: "Debit", value: (r) => r.debit, format: "money" },
        { header: "Credit", value: (r) => r.credit, format: "money" },
        { header: "Balance", value: (r) => drcr(r.balance), width: 18 },
      ],
    });
  };

  const columns: Column<Row>[] = [
    { key: "date", header: "Date", nowrap: true, cell: (r) => fmtDate(r.date) },
    {
      key: "journal", header: "Journal", nowrap: true,
      cell: (r) => <Link data-no-row-click className="text-ims-link hover:underline" to={`/dashboard/finance/journals/${r.journal}`}><DocNo value={r.number} className="text-ims-link" /></Link>,
      sub: (r) => JOURNAL_TYPES[r.journal_type] || r.journal_type,
    },
    {
      key: "description", header: "Description", width: "34%",
      cell: (r) => (
        <TwoLine
          main={r.description}
          sub={r.source_type && r.source_type !== "manual" ? (
            <>
              {JOURNAL_SOURCES[r.source_type] || r.source_type}
              {r.source_number && (sourceLink(r.source_type, r.source_id)
                ? <> · <Link data-no-row-click className="font-mono text-ims-link hover:underline" to={sourceLink(r.source_type, r.source_id)}>{r.source_number}</Link></>
                : <> · <span className="font-mono">{r.source_number}</span></>)}
            </>
          ) : undefined}
        />
      ),
    },
    { key: "dims", header: "Department", width: "16%", clamp: true, cell: (r) => r.department || "—", sub: (r) => [r.funding, r.project].filter(Boolean).join(" · ") || undefined },
    { key: "debit", header: "Debit (RWF)", numeric: true, cell: (r) => (r.debit ? <Num value={r.debit} /> : "") },
    { key: "credit", header: "Credit (RWF)", numeric: true, cell: (r) => (r.credit ? <Num value={r.credit} /> : "") },
    { key: "balance", header: "Balance (RWF)", numeric: true, cell: (r) => <span className="font-semibold">{drcr(r.balance)}</span> },
  ];

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "General ledger", to: "/dashboard/finance/journals" }, { label: "Trial balance", to: `/dashboard/finance/trial-balance${query ? `?${query}` : ""}` }, { label: led ? led.account.code : "Account" }]}
        title={title}
        subtitle={led ? `${ACCOUNT_TYPES[led.account.type] || led.account.type} · every posting with the running balance. Select a journal number to open it.` : "Every posting on the account with the running balance."}
        meta={led ? periodLabel(led.from, led.to) : undefined}
        secondary={[{ label: "Trial balance", icon: Scale, to: `/dashboard/finance/trial-balance${query ? `?${query}` : ""}` }]}
        actions={
          <span className="relative inline-block">
            <select
              aria-label="Account"
              value={accountId}
              onChange={(e) => navigate(`/dashboard/finance/trial-balance/${e.target.value}${query ? `?${query}` : ""}`)}
              className="h-button max-w-[300px] appearance-none rounded-control border border-ims-field bg-ims-card pl-3 pr-9 text-[13.5px] font-semibold text-ims-text outline-none focus:border-ims-focus focus:ring-2 focus:ring-ims-focus/25"
            >
              {!accounts.data?.some((a: any) => a.id === accountId) && <option value={accountId}>{title}</option>}
              {(accounts.data || []).map((a: any) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
            </select>
          </span>
        }
      />
      <KpiBand
        loading={q.isLoading || !led}
        items={[
          { label: "Opening balance", value: led ? drcr(led.opening) : "—", sub: led ? `${sideOf(led.opening)} on ${fmtDate(led.from)}` : undefined },
          { label: "Debits", value: led ? fmtNumber(led.debit) : "—", sub: "RWF in the period" },
          { label: "Credits", value: led ? fmtNumber(led.credit) : "—", sub: "RWF in the period" },
          { label: "Closing balance", value: led ? drcr(led.closing) : "—", sub: led ? `${sideOf(led.closing)} on ${fmtDate(led.to)}` : undefined },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search journal or description" }}
          chips={chips}
          onClear={() => set({ department: "", funding_source: "", project: "" })}
          right={<ExportMenu permission={["export_ledger", "view_journals"]} onExport={doExport} />}
        >
          <LedgerFilterControls f={f} set={set} shown={led} />
        </FilterBar>
        {led?.truncated && (
          <p className="border-t border-ims-divider bg-ims-warning-bg px-5 py-2.5 text-t-small font-semibold text-ims-warning">
            Only the first 3,000 postings are shown — choose shorter dates to see the rest.
          </p>
        )}
        <DataTable
          columns={columns}
          rows={shown}
          rowKey={(r) => r.id}
          onRowClick={(r) => navigate(`/dashboard/finance/journals/${r.journal}`)}
          loading={q.isLoading || (!led && !q.error)}
          fetching={q.isFetching && !q.isLoading}
          error={q.error}
          onRetry={() => q.refetch()}
          minWidth={1020}
          empty={<EmptyState icon={ListOrdered} text={needle ? "No posting matches this search." : "Nothing was posted on this account in this period."} />}
          footer={<Pager page={page} perPage={perPage} total={rows.length} onPage={setPage} onPerPage={(n) => { setPerPage(n); setPage(1); }} sizes={[50, 100, 250]} />}
        />
      </Card>
    </Page>
  );
}
