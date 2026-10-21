/**
 * Fixed assets → Reports: the register, the fixed asset schedule (movement by category), depreciation by month and
 * by department / funding source, movements, disposals, maintenance and the reconciliation with the GL.
 */
import { assetsApi } from "@/lib/assets";
import { useFiscalYears } from "@/lib/fiscal";
import ServerReportPage from "@/components/enterprise/ServerReportPage";

const GROUPS: { title: string; items: [string, string][] }[] = [
  { title: "Register", items: [["asset_register", "Fixed asset register"], ["asset_schedule", "Fixed asset schedule"], ["reconciliation", "Register against the general ledger"]] },
  { title: "Depreciation", items: [["depreciation_by_month", "By month and category"], ["depreciation_by_department", "By department and funding source"]] },
  { title: "Movements", items: [["movements", "Asset movements"], ["disposals", "Disposals register"], ["maintenance", "Maintenance log"]] },
];

export default function AssetReports() {
  const years = useFiscalYears();
  const current = years.data?.find((y) => y.is_current);
  if (years.isLoading) return null;
  return (
    <ServerReportPage
      title="Fixed asset reports"
      description="The register, the schedule of cost and depreciation by category, depreciation by month, department and funding source, movements, disposals and maintenance — and the reconciliation of the register with the general ledger."
      breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Reports", link: "/dashboard/assets/reports" }]}
      groups={GROUPS}
      run={(key, f) => assetsApi.report(key, f)}
      filters={["from", "to", "department"]}
      exportPermission={["export_assets", "view_asset_reports", "view_fixed_assets"]}
      defaultFrom={current ? `${current.year}-${String(current.startMonth).padStart(2, "0")}-01` : undefined}
    />
  );
}
