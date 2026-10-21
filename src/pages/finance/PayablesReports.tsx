/**
 * Payables → Reports: supplier ageing, outstanding liabilities, payment register, payment summary and
 * the withholding tax schedule (all computed on the server from the live records).
 */
import { payablesApi } from "@/lib/payables";
import { useFiscalYears } from "@/lib/fiscal";
import ServerReportPage from "@/components/enterprise/ServerReportPage";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "What we owe", items: [["ageing", "Supplier ageing"], ["outstanding", "Outstanding liabilities"]] },
  { title: "What we paid", items: [["payment_register", "Payment register"], ["payment_summary", "Payment summary by payee"], ["wht_schedule", "Withholding tax schedule"]] },
];

export default function PayablesReports() {
  const years = useFiscalYears();
  const current = years.data?.find((y) => y.is_current);
  if (years.isLoading) return null;
  return (
    <ServerReportPage
      title="Payables reports"
      description="Unpaid invoices by age, every payment made with the tax withheld, and the withholding tax schedule for RRA. Export to Excel or PDF."
      breadcrumbs={[{ title: "Payables", link: "/dashboard/finance/invoices" }, { title: "Reports", link: "/dashboard/finance/reports" }]}
      groups={GROUPS}
      run={(key, f) => payablesApi.report(key, f)}
      filters={["from", "to", "supplier", "department"]}
      exportPermission={["export_invoices", "view_payment_vouchers", "manage_payment_vouchers"]}
      defaultFrom={current ? `${current.year}-${String(current.startMonth).padStart(2, "0")}-01` : undefined}
    />
  );
}
