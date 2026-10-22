import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { Banknote, ExternalLink, Plus, Settings2, Users } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import RecordTable, { RecordColumn, RecordFilter } from "@/components/enterprise/RecordTable";
import { StatusBadge } from "@/components/enterprise/ui";
import { WithPeople } from "@/components/enterprise/WithCell";
import { Button, DocNo, KpiBand, Num, Page, PageHeader, Person, fmtMoneyShort, statusText } from "@/components/ims";
import { MONTHS, PAYROLL_STATUS } from "@/lib/hr";
import PayrollPreviewDialog from "./PayrollPreview";

const LIST = "/dashboard/hr/payroll";

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

  const filters: RecordFilter[] = [
    { field: "status", label: "Status", options: Object.entries(PAYROLL_STATUS).map(([value, m]) => ({ value, label: statusText(m) })) },
    { field: "branch", label: "Office", collection: "branches" },
  ];

  /** Who must act now: the approvers while it is in approval, HR while it is prepared, Finance once approved. */
  const withCell = (r: any) => {
    if (r.status === "pending_approval") return <WithPeople ids={r.pending_approvers} />;
    if (["draft", "computed", "returned"].includes(r.status)) return <Person name="HR & payroll" detail={r.status === "draft" ? "To calculate" : "To submit for approval"} />;
    if (r.status === "approved") return <Person name="Finance" detail="To record the payment" />;
    return <span className="text-ims-faint">—</span>;
  };

  const columns: RecordColumn<any>[] = [
    { key: "number", header: "Payroll", sortField: "number", nowrap: true, cell: (r) => <DocNo value={r.number} />, sub: (r) => r.expand?.branch?.name || "All offices" },
    { key: "period", header: "Period", sortField: "year", nowrap: true, cell: (r) => r.period_label || `${MONTHS[(r.month || 1) - 1]} ${r.year}`, csv: (r) => r.period_label },
    { key: "branch", header: "Office", exportOnly: true, cell: (r) => r.expand?.branch?.name || "All offices", csv: (r) => r.expand?.branch?.name || "All" },
    { key: "staff", header: "Staff", align: "right", cell: (r) => <Num value={r.headcount || null} />, csv: (r) => r.headcount },
    { key: "gross", header: "Gross pay (RWF)", sortField: "total_gross", align: "right", sum: "total_gross", format: "money", cell: (r) => <Num value={r.total_gross} />, csv: (r) => r.total_gross },
    { key: "paye", header: "PAYE (RWF)", exportOnly: true, format: "money", cell: (r) => <Num value={r.totals?.paye} />, csv: (r) => r.totals?.paye },
    { key: "rssb", header: "RSSB (RWF)", exportOnly: true, format: "money", cell: (r) => <Num value={r.totals?.rssb} />, csv: (r) => r.totals?.rssb },
    { key: "net", header: "Net pay (RWF)", sortField: "total_net", align: "right", sum: "total_net", format: "money", cell: (r) => <span className="font-semibold"><Num value={r.total_net} /></span>, csv: (r) => r.total_net },
    { key: "cost", header: "Employer cost (RWF)", sortField: "total_employer_cost", align: "right", sum: "total_employer_cost", format: "money", cell: (r) => <Num value={r.total_employer_cost} />, csv: (r) => r.total_employer_cost },
    { key: "status", header: "Status", sortField: "status", cell: (r) => <StatusBadge status={r.status || "draft"} map={PAYROLL_STATUS} />, csv: (r) => statusText(PAYROLL_STATUS[r.status], r.status) },
    { key: "with", header: "With", className: "max-w-[180px]", cell: withCell },
  ];

  const canCreate = canPerform("create_payroll");
  const open = (r: any) => navigate(`${LIST}/${r.id}`);

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Payroll" }]}
        title="Payroll"
        subtitle="Monthly payroll with Rwanda PAYE and RSSB, approved in several steps before it is paid."
        secondary={[
          ...(canPerform("manage_salaries") ? [{ label: "Salary structures", icon: Users, to: `${LIST}/salaries` }] : []),
          ...(canPerform("manage_payroll_settings") ? [{ label: "Tax settings", icon: Settings2, to: "/dashboard/settings/general-settings/payroll" }] : []),
        ]}
        primary={canCreate ? { label: "New payroll", icon: Plus, onClick: () => setCreating(true) } : undefined}
      />
      <KpiBand
        loading={all.isLoading}
        items={[
          { label: `Net salaries paid in ${year}`, value: fmtMoneyShort(sum(paid, "net")), sub: `${paid.length} payroll${paid.length === 1 ? "" : "s"} paid` },
          { label: "PAYE to RRA", value: fmtMoneyShort(sum(paid, "paye")), sub: "Due by the 15th of the next month" },
          { label: "Contributions to RSSB", value: fmtMoneyShort(sum(paid, "rssb")), sub: "Pension, maternity, hazards, CBHI" },
          { label: "Pending approval", value: inApproval.length, sub: inApproval.map((p) => p.period_label).join(", ") || "None", tone: inApproval.length ? "warning" : "default" },
        ]}
      />
      <RecordTable
        collection="payrolls"
        columns={columns}
        expand="branch"
        defaultSort="-year,-month"
        searchFields={["number", "period_label"]}
        searchPlaceholder="Search payroll number or period"
        filters={filters}
        exportName="payrolls"
        exportTitle="Payrolls"
        onRowClick={open}
        rowActions={() => [{ label: "Open", icon: ExternalLink, onSelect: open }]}
        empty={{
          icon: Banknote,
          title: "No payroll yet.",
          text: canCreate ? "No payroll yet. Create one with New payroll; it is calculated from the salary structures and the tax settings." : "No payroll to show.",
          action: canCreate ? <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>New payroll</Button> : undefined,
        }}
      />
      {creating && <PayrollPreviewDialog onClose={() => setCreating(false)} />}
    </Page>
  );
}
