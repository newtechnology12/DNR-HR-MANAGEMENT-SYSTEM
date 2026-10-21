import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { Banknote, Plus, Settings2, Users, Wallet } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import RecordTable, { RecordColumn } from "@/components/enterprise/RecordTable";
import { MetricGroup, PageHeader, StatusBadge } from "@/components/enterprise/ui";
import { compactMoney } from "@/lib/procurement";
import { MONTHS, PAYROLL_STATUS, rwf } from "@/lib/hr";
import PayrollPreviewDialog from "./PayrollPreview";

export default function PayrollRuns() {
  const navigate = useNavigate();
  const { canPerform } = useRoles();
  const [creating, setCreating] = React.useState(false);
  const year = new Date().getFullYear();
  const all = useQuery(["payroll-summary", year], () => pocketbase.collection("payrolls").getFullList({ filter: `year = ${year} && status != "cancelled"`, sort: "-month" }));
  const rows = (all.data || []) as any[];
  const paid = rows.filter((p) => p.status === "paid");
  const sum = (xs: any[], k: string) => xs.reduce((a, p) => a + (Number(p.totals?.[k]) || 0), 0);
  const inApproval = rows.filter((p) => p.status === "pending_approval");

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Payroll", sortField: "number", cell: (r) => <span className="whitespace-nowrap font-medium">{r.number || "—"}</span> },
    { key: "period", header: "Period", sortField: "year", cell: (r) => <span className="whitespace-nowrap">{r.period_label || `${MONTHS[(r.month || 1) - 1]} ${r.year}`}</span>, csv: (r) => r.period_label },
    { key: "branch", header: "Office", cell: (r) => <span className="whitespace-nowrap text-slate-600">{r.expand?.branch?.name || "All offices"}</span>, csv: (r) => r.expand?.branch?.name || "All" },
    { key: "staff", header: "Staff", align: "right", cell: (r) => <span className="tabular-nums">{r.headcount || "—"}</span>, csv: (r) => r.headcount },
    { key: "gross", header: "Gross", sortField: "total_gross", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums">{rwf(r.total_gross)}</span>, csv: (r) => r.total_gross },
    { key: "paye", header: "PAYE (RRA)", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums text-slate-600">{rwf(r.totals?.paye)}</span>, csv: (r) => r.totals?.paye },
    { key: "rssb", header: "RSSB", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums text-slate-600">{rwf(r.totals?.rssb)}</span>, csv: (r) => r.totals?.rssb },
    { key: "net", header: "Net pay", sortField: "total_net", align: "right", cell: (r) => <span className="whitespace-nowrap font-semibold tabular-nums">{rwf(r.total_net)}</span>, csv: (r) => r.total_net },
    { key: "cost", header: "Employer cost", sortField: "total_employer_cost", align: "right", cell: (r) => <span className="whitespace-nowrap tabular-nums">{rwf(r.total_employer_cost)}</span>, csv: (r) => r.total_employer_cost },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status || "draft"} map={PAYROLL_STATUS} />, csv: (r) => PAYROLL_STATUS[r.status]?.label },
  ];

  return (
    <div className="space-y-4 px-4 py-4 sm:px-6">
      <PageHeader
        title="Payroll"
        description="Monthly payroll calculated with Rwanda PAYE and RSSB contributions, approved in several steps — the preparer never approves."
        breadcrumbs={[{ title: "HR", link: "/dashboard/hr/employees" }, { title: "Payroll", link: "/dashboard/hr/payroll" }]}
        actions={
          <>
            {canPerform("manage_salaries") && <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/hr/payroll/salaries")}><Users size={14} /> Salary structures</Button>}
            {canPerform("manage_payroll_settings") && <Button size="sm" variant="outline" onClick={() => navigate("/dashboard/settings/general-settings/payroll")}><Settings2 size={14} /> Tax settings</Button>}
            {canPerform("create_payroll") && <Button size="sm" onClick={() => setCreating(true)}><Plus size={14} /> New payroll</Button>}
          </>
        }
      />
      <MetricGroup
        title={`Year ${year}`}
        icon={Wallet}
        columns={4}
        loading={all.isLoading}
        metrics={[
          { label: "Net salaries paid", value: compactMoney(sum(paid, "net")), sub: `${paid.length} payroll${paid.length === 1 ? "" : "s"} paid` },
          { label: "PAYE to RRA", value: compactMoney(sum(paid, "paye")), sub: "Declared and due by the 15th of the following month" },
          { label: "Contributions to RSSB", value: compactMoney(sum(paid, "rssb")), sub: "Pension, maternity, occupational hazards, CBHI" },
          { label: "In approval", value: inApproval.length, sub: inApproval.map((p) => p.period_label).join(", ") || "Nothing waiting", tone: inApproval.length ? "warning" : "default" },
        ]}
      />
      <RecordTable
        collection="payrolls"
        columns={columns}
        expand="branch"
        defaultSort="-year,-month"
        searchFields={["number", "period_label"]}
        exportName="payrolls"
        onRowClick={(r) => navigate(`/dashboard/hr/payroll/${r.id}`)}
        empty={{ icon: Banknote, title: "No payroll yet", text: "Create the first payroll for a month; it is calculated from the salary structures and the tax settings." }}
      />
      {creating && <PayrollPreviewDialog onClose={() => setCreating(false)} />}
    </div>
  );
}
