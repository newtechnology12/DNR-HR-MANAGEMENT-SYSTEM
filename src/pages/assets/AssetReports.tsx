/**
 * Fixed assets → Reports: the register, the fixed asset schedule (movement by category), depreciation by month and
 * by department / funding source, movements, disposals, maintenance and the reconciliation with the GL.
 * The page frame, report menu, filters and table come from the shared ServerReportPage.
 */
import { assetsApi } from "@/lib/assets";
import { useFiscalYears } from "@/lib/fiscal";
import ServerReportPage from "@/components/enterprise/ServerReportPage";
import { Skeleton } from "@/components/ui/skeleton";
import { Page } from "@/components/ims";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Register", items: [["asset_register", "Fixed asset register"], ["asset_schedule", "Fixed asset schedule"], ["reconciliation", "Register against the general ledger"]] },
  { title: "Depreciation", items: [["depreciation_by_month", "By month and category"], ["depreciation_by_department", "By department and funding source"]] },
  { title: "Movements", items: [["movements", "Asset movements"], ["disposals", "Disposals register"], ["maintenance", "Maintenance log"]] },
];

export default function AssetReports() {
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
      title="Fixed asset reports"
      description="The register, depreciation, movements, disposals and maintenance, and the register against the general ledger."
      breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Reports", link: "/dashboard/assets/reports" }]}
      groups={GROUPS}
      run={(key, f) => assetsApi.report(key, f)}
      filters={["from", "to", "department"]}
      exportPermission={["export_assets", "view_asset_reports", "view_fixed_assets"]}
      defaultFrom={current ? `${current.year}-${String(current.startMonth).padStart(2, "0")}-01` : undefined}
    />
  );
}
