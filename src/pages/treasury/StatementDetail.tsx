/**
 * One imported bank statement: its balances, every line with what it is matched to, and the original file.
 */
import * as React from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "react-query";
import { FileSpreadsheet, Scale } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { FOLLOW_UP, STATEMENT_STATUS } from "@/lib/treasury";
import { rwf, showDay } from "@/lib/ims";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { Notebook } from "@/components/enterprise/DocumentLayout";
import DocumentUploads from "@/components/enterprise/Attachments";
import { Flow, Stat } from "@/components/treasury/TreasuryKit";
import { Chip } from "@/components/portal/kit";

export default function StatementDetail() {
  const { statementId } = useParams();
  const navigate = useNavigate();
  const { can } = usePermissions();
  const [tab, setTab] = React.useState("lines");
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
  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={8} /></div>;
  if (!q.data) return <div className="p-6"><EmptyState icon={FileSpreadsheet} title="Statement not found" text="It may have been deleted." /></div>;
  const { s, lines, entries } = q.data;
  const byGroup: Record<string, any[]> = {};
  for (const e of entries) (byGroup[e.match_group] = byGroup[e.match_group] || []).push(e);
  const shown = lines.filter((l) => only === "all" || (only === "open" ? !l.match_group : Boolean(l.match_group)));
  const open = lines.filter((l) => !l.match_group).length;
  const link = (e: any) => (e.source_type === "cash_receipt" ? `/dashboard/treasury/receipts/${e.source_id}` : e.source_type === "bank_transfer" ? `/dashboard/treasury/transfers/${e.source_id}` : e.source_type === "payment_voucher" ? `/dashboard/finance/vouchers/${e.source_id}` : "");

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title={<span className="flex items-center gap-2">{s.number} <StatusBadge status={s.status} map={STATEMENT_STATUS} /></span>}
        description={`${s.expand?.account?.code} · ${s.expand?.account?.name} · ${showDay(s.statement_from)} – ${showDay(s.statement_to)} · imported by ${s.expand?.imported_by?.name || "—"} on ${showDay(s.created)}`}
        breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Bank statements", link: "/dashboard/treasury/statements" }, { title: s.number, link: `/dashboard/treasury/statements/${s.id}` }]}
        actions={can("prepare_bank_reconciliation") && open > 0 && <Button onClick={() => navigate(`/dashboard/treasury/reconcile/${s.account}`)}><Scale size={15} /> Match the {open} open line{open === 1 ? "" : "s"}</Button>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Opening balance" value={rwf(s.opening_balance)} sub={showDay(s.statement_from)} />
        <Stat label="Money in" value={rwf(s.total_in)} sub={`${lines.filter((l) => l.direction === "in").length} credits`} />
        <Stat label="Money out" value={rwf(s.total_out)} sub={`${lines.filter((l) => l.direction === "out").length} debits`} />
        <Stat label="Closing balance" value={rwf(s.closing_balance)} sub={showDay(s.statement_to)} />
      </div>
      {s.notes && <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">{s.notes}</p>}
      <section className="rounded-lg border border-slate-200 bg-white px-4 pb-4 pt-1 shadow-card">
        <Notebook tabs={[{ key: "lines", label: "Lines", count: lines.length }, { key: "file", label: "Original file", count: (s.attachments || []).length }]} active={tab} onChange={setTab} />
        <div className="pt-4">
          {tab === "lines" && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
                <Chip active={only === "all"} onClick={() => setOnly("all")} count={lines.length}>All lines</Chip>
                <Chip active={only === "open"} onClick={() => setOnly("open")} count={open}>Not matched</Chip>
                <Chip active={only === "matched"} onClick={() => setOnly("matched")} count={lines.length - open}>Matched</Chip>
              </div>
              <div className="overflow-x-auto">
                <table className="dnr-grid w-full min-w-[860px]">
                  <thead><tr><th>#</th><th>Date</th><th>Description</th><th>Reference</th><th className="text-right">Amount</th><th className="text-right">Balance</th><th>Matched to</th></tr></thead>
                  <tbody>
                    {shown.map((l) => {
                      const es = l.match_group ? byGroup[l.match_group] || [] : [];
                      return (
                        <tr key={l.id}>
                          <td className="text-[12px] text-slate-400">{l.line_no}</td>
                          <td className="whitespace-nowrap text-[12.5px]">{showDay(l.txn_date)}</td>
                          <td className="max-w-[300px] text-[12.5px]"><span className="line-clamp-2">{l.description}</span></td>
                          <td className="whitespace-nowrap font-mono text-[12px] text-slate-500">{l.reference}</td>
                          <td className="text-right"><Flow direction={l.direction} amount={l.amount} /></td>
                          <td className="whitespace-nowrap text-right tabular-nums text-slate-500">{l.has_balance ? l.balance.toLocaleString("en-US") : ""}</td>
                          <td className="min-w-[200px] text-[12.5px]">
                            {l.match_group ? (
                              es.length ? es.map((e) => (
                                <span key={e.id} className="block">
                                  {link(e) ? <Link to={link(e)} className="font-mono text-primaryDark hover:underline">{e.source_number}</Link> : <span className="font-mono">{e.source_number}</span>}
                                  <span className="text-slate-500"> · {e.type === "bank_charge" ? "bank charge recorded" : e.type === "interest" ? "interest recorded" : showDay(e.entry_date)}</span>
                                  {l.reconciliation && <Badge tone="success" className="ml-1.5">Reconciled</Badge>}
                                </span>
                              )) : <span className="text-slate-500">Matched with other bank lines (they cancel out)</span>
                            ) : (
                              <span className="flex flex-wrap items-center gap-1.5">
                                <Badge tone="warning">Not matched</Badge>
                                {l.follow_up && <Badge tone={FOLLOW_UP[l.follow_up]?.tone}>{FOLLOW_UP[l.follow_up]?.label}</Badge>}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
          {tab === "file" && <DocumentUploads collection="bank_statements" record={s} canAdd={can("prepare_bank_reconciliation")} canRemove={s.status === "imported" && can("prepare_bank_reconciliation")} onChange={() => q.refetch()} hint="The statement as received from the bank (Excel, CSV or PDF)" />}
        </div>
      </section>
    </div>
  );
}
