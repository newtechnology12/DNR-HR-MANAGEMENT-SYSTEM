/**
 * Bank & cash → Reports: cash position, bank transaction summary, cash book, unreconciled items, receipts
 * register and reconciliation register (computed on the server; Excel / PDF with the RALGA header).
 * The page frame, report menu, filters and table come from the shared ServerReportPage.
 */
import { treasuryApi, PERMS } from "@/lib/treasury";
import { useFiscalYears } from "@/lib/fiscal";
import ServerReportPage from "@/components/enterprise/ServerReportPage";
import { Skeleton } from "@/components/ui/skeleton";
import { Page } from "@/components/ims";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Position", items: [["cash_position", "Cash position"], ["transaction_summary", "Bank transaction summary"], ["cash_book", "Cash book (choose an account)"]] },
  { title: "Reconciliation", items: [["unreconciled", "Unreconciled items"], ["reconciliation_register", "Reconciliation register"]] },
  { title: "Receipts", items: [["receipts_register", "Receipts register"]] },
];

export default function TreasuryReports() {
  const years = useFiscalYears();
  const current = years.data?.find((y) => y.is_current);
  if (years.isLoading) {
    return (
      <Page>
        <Skeleton className="h-5 w-48" />
        <Skeleton className="h-10 w-80 max-w-full" />
        <Skeleton className="h-96 w-full rounded-card" />
      </Page>
    );
  }
  return (
    <ServerReportPage
      title="Bank and cash reports"
      description="Cash position, movements per account, the cash book, unreconciled items and the registers."
      breadcrumbs={[{ title: "Bank & cash", link: "/dashboard/treasury" }, { title: "Reports", link: "/dashboard/treasury/reports" }]}
      groups={GROUPS}
      run={(key, f) => treasuryApi.report(key, f)}
      filters={["from", "to", "account"]}
      exportPermission={PERMS.export}
      defaultFrom={current ? `${current.year}-${String(current.startMonth).padStart(2, "0")}-01` : undefined}
    />
  );
}
