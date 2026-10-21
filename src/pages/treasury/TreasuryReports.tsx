/**
 * Bank & cash → Reports: cash position, bank transaction summary, cash book, unreconciled items, receipts
 * register and reconciliation register (computed on the server; Excel / PDF with the RALGA header).
 */
import { treasuryApi, PERMS } from "@/lib/treasury";
import { useFiscalYears } from "@/lib/fiscal";
import ServerReportPage from "@/components/enterprise/ServerReportPage";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Position", items: [["cash_position", "Cash position"], ["transaction_summary", "Bank transaction summary"], ["cash_book", "Cash book (choose an account)"]] },
  { title: "Reconciliation", items: [["unreconciled", "Unreconciled items"], ["reconciliation_register", "Reconciliation register"]] },
  { title: "Receipts", items: [["receipts_register", "Receipts register"]] },
];

export default function TreasuryReports() {
  const years = useFiscalYears();
  const current = years.data?.find((y) => y.is_current);
  if (years.isLoading) return null;
  return (
    <ServerReportPage
      title="Bank & cash reports"
      description="Cash position, movements per account, the cash book, items not yet reconciled and the registers. The bank reconciliation statement itself is on each reconciliation."
      breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Reports", link: "/dashboard/treasury/reports" }]}
      groups={GROUPS}
      run={(key, f) => treasuryApi.report(key, f)}
      filters={["from", "to", "account"]}
      exportPermission={PERMS.export}
      defaultFrom={current ? `${current.year}-${String(current.startMonth).padStart(2, "0")}-01` : undefined}
    />
  );
}
