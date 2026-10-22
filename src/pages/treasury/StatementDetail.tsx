/**
 * One imported bank statement: its balances, every line with what it is matched to, and the original file.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { AlertTriangle, FileSpreadsheet, Scale } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { FOLLOW_UP, STATEMENT_STATUS } from "@/lib/treasury";
import { DOCUMENT_LINKS } from "@/lib/ims";
import { Skeleton } from "@/components/ui/skeleton";
import DocumentUploads from "@/components/enterprise/Attachments";
import { Button, ButtonLink, Card, CardHeader, Column, DataTable, DetailHeader, EmptyState, FilterBar, FilterSelect, KpiBand, Num, Page, Pill, PillTone, Tabs, fmtDate, fmtNumber } from "@/components/ims";
import { Flow, KpiMoney, periodText } from "@/components/treasury/TreasuryKit";

type TabKey = "lines" | "file";
const LIST = "/dashboard/treasury/statements";

export default function StatementDetail() {
  const { statementId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState<TabKey>("lines");
  const [only, setOnly] = React.useState<"all" | "open" | "matched">("all");
  const q = useQuery(["statement", statementId], async () => {
    const s: any = await pocketbase.collection("bank_statements").getOne(statementId!, { expand: "account,imported_by" });
    const lines: any[] = await pocketbase.collection("bank_statement_lines").getFullList({ filter: `statement = "${s.id}"`, sort: "line_no" });
    const groups = [...new Set(lines.map((l) => l.match_group).filter(Boolean))];
    const entries: any[] = [];
    for (let i = 0; i < groups.length; i += 40) {
      const part = groups.slice(i, i + 40);
      entries.push(...(await pocketbase.collection("cash_book_entries").getFullList({ filter: part.map((g) => `match_group = "${g}"`).join(" || ") })));
    }
    return { s, lines, entries };
  });
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
  if (!q.data) {
    return (
      <Page>
        <Card>
          <EmptyState icon={FileSpreadsheet} text="This statement is not available. It may have been deleted." action={<ButtonLink to={LIST}>Back to bank statements</ButtonLink>} />
        </Card>
      </Page>
    );
  }
  const { s, lines, entries } = q.data;
  const byGroup: Record<string, any[]> = {};
  for (const e of entries) (byGroup[e.match_group] = byGroup[e.match_group] || []).push(e);
  const shown = lines.filter((l) => only === "all" || (only === "open" ? !l.match_group : Boolean(l.match_group)));
  const open = lines.filter((l) => !l.match_group).length;
  const link = (e: any) => (e.source_type && e.source_id ? DOCUMENT_LINKS[e.source_type]?.(e.source_id) || "" : "");
  const net = shown.reduce((t, l) => t + (l.direction === "in" ? l.amount : -l.amount), 0);
  const status = STATEMENT_STATUS[s.status];

  const columns: Column<any>[] = [
    { key: "no", header: "#", width: "52px", cell: (l) => <span className="text-ims-muted tabular-nums">{l.line_no}</span> },
    { key: "date", header: "Date", nowrap: true, cell: (l) => fmtDate(l.txn_date) },
    { key: "description", header: "Description", clamp: true, cell: (l) => l.description },
    { key: "reference", header: "Reference", nowrap: true, cell: (l) => (l.reference ? <span className="font-mono text-t-small text-ims-muted">{l.reference}</span> : "") },
    {
      key: "amount",
      header: "Amount (RWF)",
      numeric: true,
      cell: (l) => <Flow direction={l.direction} amount={l.amount} />,
      total: <span className={net > 0 ? "text-ims-success" : undefined}>{net > 0 ? "+" : net < 0 ? "−" : ""}{fmtNumber(Math.abs(net))}</span>,
    },
    { key: "balance", header: "Balance (RWF)", numeric: true, cell: (l) => (l.has_balance ? <span className="text-ims-muted"><Num value={l.balance} /></span> : "") },
    {
      key: "matched",
      header: "Matched to",
      className: "min-w-[220px]",
      cell: (l) => {
        if (!l.match_group) {
          return (
            <span className="flex flex-wrap items-center gap-1.5">
              <Pill tone="warning">Not matched</Pill>
              {l.follow_up && <Pill tone={(FOLLOW_UP[l.follow_up]?.tone as PillTone) || "neutral"} title={FOLLOW_UP[l.follow_up]?.hint}>{FOLLOW_UP[l.follow_up]?.label || l.follow_up}</Pill>}
            </span>
          );
        }
        const es = byGroup[l.match_group] || [];
        if (!es.length) return <span className="text-t-small text-ims-muted">Matched with other bank lines (they cancel out)</span>;
        return (
          <span className="block space-y-0.5">
            {es.map((e) => (
              <span key={e.id} className="block text-t-small">
                {link(e) ? <Link to={link(e)} className="whitespace-nowrap font-mono font-semibold text-ims-link hover:underline">{e.source_number}</Link> : <span className="whitespace-nowrap font-mono">{e.source_number}</span>}
                <span className="text-ims-muted"> · {e.type === "bank_charge" ? "bank charge recorded" : e.type === "interest" ? "interest recorded" : fmtDate(e.entry_date)}</span>
                {l.reconciliation && <span className="ml-1.5 font-semibold text-ims-success">Reconciled</span>}
              </span>
            ))}
          </span>
        );
      },
    },
  ];

  return (
    <Page>
      <DetailHeader
        back={{ label: "Back to bank statements", to: LIST }}
        number={s.number}
        type="Bank statement"
        status={status?.label || s.status}
        statusNote={status?.note}
        title={`${s.expand?.account?.code || ""} · ${s.expand?.account?.name || "Bank account"}`}
        facts={[
          periodText(s.statement_from, s.statement_to),
          { label: "Imported by", value: s.expand?.imported_by?.name || "—" },
          fmtDate(s.created),
          `${fmtNumber(lines.length - open)} of ${fmtNumber(lines.length)} lines matched`,
        ]}
        actions={
          can("prepare_bank_reconciliation") && open > 0 ? (
            <Button variant="primary" icon={Scale} onClick={() => navigate(`/dashboard/treasury/reconcile/${s.account}`)}>
              Match the {open} open line{open === 1 ? "" : "s"}
            </Button>
          ) : undefined
        }
      />

      <KpiBand
        items={[
          { label: "Opening balance", value: <KpiMoney value={s.opening_balance} />, sub: fmtDate(s.statement_from) },
          { label: "Money in", value: <KpiMoney value={s.total_in} />, tone: "success", sub: `${fmtNumber(lines.filter((l) => l.direction === "in").length)} credits` },
          { label: "Money out", value: <KpiMoney value={s.total_out} />, sub: `${fmtNumber(lines.filter((l) => l.direction === "out").length)} debits` },
          { label: "Closing balance", value: <KpiMoney value={s.closing_balance} />, sub: fmtDate(s.statement_to) },
        ]}
      />

      {s.notes && (
        <p className="flex items-start gap-2 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" aria-hidden /> <span>{s.notes}</span>
        </p>
      )}

      <Tabs
        label="Statement sections"
        active={tab}
        onChange={(k) => setTab(k as TabKey)}
        tabs={[
          { key: "lines", label: "Lines", count: lines.length },
          { key: "file", label: "Documents", count: (s.attachments || []).length },
        ]}
      />

      {tab === "lines" && (
        <Card padded={false} className="overflow-hidden">
          <FilterBar>
            <FilterSelect
              label="Lines"
              all={false}
              value={only}
              onChange={(v) => setOnly(v as typeof only)}
              options={[
                { value: "all", label: `All lines (${lines.length})` },
                { value: "open", label: `Not matched (${open})` },
                { value: "matched", label: `Matched (${lines.length - open})` },
              ]}
            />
          </FilterBar>
          <DataTable
            columns={columns}
            rows={shown}
            rowKey={(l) => l.id}
            totalLabel="Total"
            minWidth={980}
            caption={`Lines of ${s.number}`}
            empty={<EmptyState compact icon={FileSpreadsheet} text={only === "open" ? "Every line is matched." : only === "matched" ? "No line is matched yet." : "This statement has no lines."} />}
          />
        </Card>
      )}

      {tab === "file" && (
        <Card>
          <CardHeader title="Original file" subtitle="The statement as received from the bank (Excel, CSV or PDF)." />
          <DocumentUploads collection="bank_statements" record={s} canAdd={can("prepare_bank_reconciliation")} canRemove={s.status === "imported" && can("prepare_bank_reconciliation")} onChange={() => q.refetch()} hint="The statement as received from the bank (Excel, CSV or PDF)" />
        </Card>
      )}
    </Page>
  );
}
