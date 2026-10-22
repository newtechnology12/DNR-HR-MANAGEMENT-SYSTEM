/**
 * New payroll in two steps: choose the month and office, then review the whole payroll before it is
 * created — every employee's payslip lines, the totals for RRA and RSSB, the employer cost, who is left
 * out and why, and the PAYE bands and contribution rates in force that month. Nothing is saved until
 * "Create payroll".
 */
import * as React from "react";
import { useQuery } from "react-query";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { AlertTriangle, ArrowLeft, Calculator, CheckCircle2, Info } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { MONTHS, payrollApi } from "@/lib/hr";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import {
  Button,
  Card,
  CardHeader,
  Column,
  DataTable,
  Field,
  Input,
  KpiBand,
  Modal,
  Num,
  Person,
  SearchBox,
  Select,
  Tabs,
  fmtDate,
  fmtMoney,
  fmtMoneyShort,
  fmtNumber,
} from "@/components/ims";

type Row = Record<string, any>;
const BASE_LABEL: Record<string, string> = { gross: "gross pay", gross_excl_transport: "gross pay excluding transport", basic: "basic salary", net_before_cbhi: "net pay before CBHI" };
const other = (r: Row) => r.other_deductions + r.advances + (r.medical_ee || 0);

export default function PayrollPreviewDialog({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const now = new Date();
  const [v, setV] = React.useState({ year: now.getFullYear(), month: now.getMonth() + 1, branch: "", notes: "" });
  const [step, setStep] = React.useState<"choose" | "preview">("choose");
  const [data, setData] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [tab, setTab] = React.useState<"slips" | "rates">("slips");
  const [q, setQ] = React.useState("");
  const [open, setOpen] = React.useState<string | null>(null);
  const branches = useQuery(["branches-simple"], () => pocketbase.collection("branches").getFullList({ sort: "name", fields: "id,name" }));

  async function preview() {
    setBusy(true);
    try {
      setData(await payrollApi.previewRun({ year: v.year, month: v.month, branch: v.branch }));
      setStep("preview");
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function create() {
    setBusy(true);
    try {
      const p = await payrollApi.create(v);
      await payrollApi.action(p.id, "compute");
      toast.success(`${p.number} created with ${data.totals.headcount} payslips calculated`);
      navigate(`/dashboard/hr/payroll/${p.id}`);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const rows: Row[] = (data?.rows || []).filter((r: Row) => `${r.name} ${r.department} ${r.designation}`.toLowerCase().includes(q.trim().toLowerCase()));
  const T = data?.totals || {};
  const office = (branches.data || []).find((b: any) => b.id === v.branch)?.name || "All offices";
  const ratesOn = data ? fmtDate(data.rates_on, data.rates_on) : "";
  const chosen = open ? (data?.rows || []).find((r: Row) => r.employee === open) : null;

  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: `Payroll preview — ${data.period}`, subtitle: `${office} · rates in force on ${data.rates_on} · not yet created`, rows: data.rows, format, orientation: "landscape", what: "payroll_preview",
      totals: ["Basic", "Allowances", "Gross", "PAYE", "Pension (employee)", "Maternity (employee)", "CBHI", "Other deductions", "Net pay", "Employer cost"],
      columns: [
        { header: "Employee", value: (r: Row) => r.name, width: 24 },
        { header: "Department", value: (r: Row) => r.department, width: 22 },
        { header: "Days", value: (r: Row) => r.working_days, format: "number" },
        { header: "Basic", value: (r: Row) => r.basic, format: "money" },
        { header: "Allowances", value: (r: Row) => r.allowances, format: "money" },
        { header: "Gross", value: (r: Row) => r.gross, format: "money" },
        { header: "PAYE", value: (r: Row) => r.paye, format: "money" },
        { header: "Pension (employee)", value: (r: Row) => r.pension_ee, format: "money" },
        { header: "Maternity (employee)", value: (r: Row) => r.maternity_ee, format: "money" },
        { header: "CBHI", value: (r: Row) => r.cbhi, format: "money" },
        { header: "Other deductions", value: (r: Row) => r.other_deductions + r.advances + (r.medical_ee || 0), format: "money" },
        { header: "Net pay", value: (r: Row) => r.net, format: "money" },
        { header: "Employer cost", value: (r: Row) => r.employer_cost, format: "money" },
      ],
    });

  const columns: Column<Row>[] = [
    {
      key: "employee", header: "Employee", className: "min-w-[220px]",
      cell: (r) => <span className="block max-w-[280px]"><Person name={r.name} detail={`${[r.designation, r.department].filter(Boolean).join(" · ")}${!r.has_structure ? " · no salary structure" : ""}`} /></span>,
    },
    { key: "days", header: "Days", numeric: true, cell: (r) => <Num value={r.working_days} /> },
    { key: "basic", header: "Basic (RWF)", numeric: true, cell: (r) => <Num value={r.basic} />, total: <Num value={T.basic} /> },
    { key: "allowances", header: "Allowances (RWF)", numeric: true, cell: (r) => <Num value={r.allowances} />, total: <Num value={T.allowances} /> },
    { key: "gross", header: "Gross (RWF)", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.gross} /></span>, total: <Num value={T.gross} /> },
    { key: "paye", header: "PAYE (RWF)", numeric: true, cell: (r) => <Num value={r.paye} />, total: <Num value={T.paye} /> },
    { key: "pension", header: "Pension (RWF)", numeric: true, cell: (r) => <Num value={r.pension_ee} />, total: <Num value={T.pension_ee} /> },
    { key: "maternity", header: "Maternity (RWF)", numeric: true, cell: (r) => <Num value={r.maternity_ee} />, total: <Num value={T.maternity_ee} /> },
    { key: "cbhi", header: "CBHI (RWF)", numeric: true, cell: (r) => <Num value={r.cbhi} />, total: <Num value={T.cbhi} /> },
    { key: "other", header: "Other (RWF)", numeric: true, cell: (r) => <Num value={other(r)} />, total: <Num value={T.other_deductions + T.advances + (T.medical_ee || 0)} /> },
    { key: "net", header: "Net pay (RWF)", numeric: true, cell: (r) => <span className="font-semibold"><Num value={r.net} /></span>, total: <Num value={T.net} /> },
    { key: "cost", header: "Employer cost (RWF)", numeric: true, cell: (r) => <Num value={r.employer_cost} />, total: <Num value={T.employer_cost} /> },
  ];

  const warnings = data
    ? [
        data.existing.length > 0 && { icon: AlertTriangle, text: `A payroll for ${data.period} already exists (${data.existing.join(", ")}). Creating another one is refused.` },
        data.skipped.length > 0 && { icon: AlertTriangle, text: `Left out: ${data.skipped.map((s: any) => `${s.name} (${s.reason.toLowerCase()})`).join(", ")}.` },
        data.rows.some((r: Row) => !r.has_structure) && { icon: Info, text: `${data.rows.filter((r: Row) => !r.has_structure).length} employee(s) have no salary structure: their whole salary is treated as basic pay.` },
        data.rates.unconfirmed > 0 && { icon: Info, text: `${data.rates.unconfirmed} rate(s) used are not yet confirmed by Finance (Settings › Payroll & taxes).` },
      ].filter(Boolean) as { icon: typeof Info; text: string }[]
    : [];

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      size={step === "preview" ? "xl" : "sm"}
      title={step === "choose" ? "New payroll" : `${data?.period} payroll preview`}
      description={
        step === "choose"
          ? "You first see the whole payroll: every payslip, the totals for RRA and RSSB and the rates used. Nothing is saved until you create it."
          : `${office} · PAYE bands and RSSB rates in force on ${ratesOn}. Nothing is saved yet.`
      }
      footer={
        step === "choose" ? (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button variant="primary" icon={Calculator} loading={busy} onClick={preview}>Preview payroll</Button>
          </>
        ) : (
          <>
            <Button icon={ArrowLeft} onClick={() => setStep("choose")} disabled={busy}>Change period</Button>
            <Button variant="primary" icon={CheckCircle2} loading={busy} disabled={!data?.rows.length || data?.existing.length > 0} onClick={create}>
              Create payroll for {data?.totals.headcount || 0} staff
            </Button>
          </>
        )
      }
    >
      {step === "choose" && (
        <div className="grid grid-cols-2 gap-4">
          <Field label="Month" required htmlFor="pp-month">
            <Select id="pp-month" value={v.month} onChange={(e) => setV((x) => ({ ...x, month: Number(e.target.value) }))}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
          </Field>
          <Field label="Year" required htmlFor="pp-year">
            <Select id="pp-year" value={v.year} onChange={(e) => setV((x) => ({ ...x, year: Number(e.target.value) }))}>
              {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </Field>
          <Field label="Office" htmlFor="pp-office" hint="“All offices” makes one payroll for the whole organisation." className="col-span-2">
            <Select id="pp-office" value={v.branch} onChange={(e) => setV((x) => ({ ...x, branch: e.target.value }))}>
              <option value="">All offices</option>
              {(branches.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </Select>
          </Field>
          <Field label="Notes" htmlFor="pp-notes" className="col-span-2">
            <Input id="pp-notes" value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} placeholder="Optional, e.g. includes the 13th month for drivers" />
          </Field>
        </div>
      )}

      {step === "preview" && data && (
        <>
          <KpiBand
            items={[
              { label: "Gross pay", value: fmtMoneyShort(T.gross) },
              { label: "PAYE to RRA", value: fmtMoneyShort(T.paye) },
              { label: "RSSB, both parts", value: fmtMoneyShort(T.rssb) },
              { label: "Net pay to staff", value: fmtMoneyShort(T.net) },
              { label: "Cost to RALGA", value: fmtMoneyShort(T.employer_cost) },
            ]}
          />

          {warnings.length > 0 && (
            <ul role="status" className="space-y-1.5 rounded-card border border-ims-warning/30 bg-ims-warning-bg px-4 py-3 text-t-body text-ims-warning">
              {warnings.map((w) => (
                <li key={w.text} className="flex gap-2"><w.icon size={16} className="mt-0.5 shrink-0" aria-hidden /> {w.text}</li>
              ))}
            </ul>
          )}

          <Card padded={false} className="overflow-hidden">
            <Tabs
              inset
              label="Preview sections"
              active={tab}
              onChange={(k) => setTab(k as "slips" | "rates")}
              tabs={[
                { key: "slips", label: "Payslips", count: data.rows.length },
                { key: "rates", label: "Rates used" },
              ]}
            />
            {tab === "slips" ? (
              <>
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3.5 sm:px-5">
                  <SearchBox value={q} onChange={setQ} placeholder="Search employee or department" />
                  <ExportMenu onExport={doExport} permission={["create_payroll", "export_payroll"]} />
                </div>
                <DataTable
                  columns={columns}
                  rows={rows}
                  rowKey={(r) => r.employee}
                  onRowClick={(r) => setOpen(r.employee)}
                  minWidth={1500}
                  caption="Payslips in this payroll"
                  totalLabel={`Total · ${T.headcount} staff`}
                />
                <p className="border-t border-ims-divider px-5 py-3 text-t-small text-ims-muted">Select an employee to see how their PAYE and the employer contributions are calculated.</p>
              </>
            ) : (
              <div className="grid gap-4 p-4 sm:p-5 lg:grid-cols-2">
                {(["regular", "casual"] as const).filter((t) => (data.rates.bands[t] || []).length).map((t) => (
                  <div key={t} className="min-w-0 overflow-hidden rounded-card border border-ims-border">
                    <h3 className="border-b border-ims-divider px-4 py-3 text-t-body font-bold text-ims-text">PAYE bands, {t === "regular" ? "permanent and contract staff" : "casual workers"}</h3>
                    <DataTable
                      minWidth={0}
                      rows={data.rates.bands[t] as any[]}
                      rowKey={(_, i) => String(i)}
                      caption={`PAYE bands for ${t === "regular" ? "staff" : "casual workers"}`}
                      columns={[
                        { key: "band", header: "Monthly taxable income (RWF)", cell: (b: any) => <span className="tabular-nums">{fmtNumber(b.min)} – {b.max ? fmtNumber(b.max) : "and above"}</span> },
                        { key: "rate", header: "Rate (%)", numeric: true, cell: (b: any) => <span className="font-semibold">{b.rate}</span> },
                      ]}
                    />
                  </div>
                ))}
                <div className="min-w-0 overflow-hidden rounded-card border border-ims-border lg:col-span-2">
                  <h3 className="border-b border-ims-divider px-4 py-3 text-t-body font-bold text-ims-text">Statutory contributions</h3>
                  <DataTable
                    minWidth={640}
                    rows={data.rates.contributions as any[]}
                    rowKey={(c: any) => c.code}
                    caption="Statutory contributions"
                    columns={[
                      { key: "name", header: "Contribution", className: "font-semibold", cell: (c: any) => c.name },
                      { key: "base", header: "Calculated on", cell: (c: any) => `${BASE_LABEL[c.base] || c.base}${c.cap ? ` (up to ${fmtNumber(c.cap)})` : ""}` },
                      { key: "ee", header: "Employee (%)", numeric: true, cell: (c: any) => c.ee },
                      { key: "er", header: "Employer (%)", numeric: true, cell: (c: any) => c.er },
                      { key: "to", header: "Paid to", cell: (c: any) => c.remit_to },
                    ]}
                  />
                  <p className="border-t border-ims-divider px-4 py-3 text-t-small text-ims-muted">Employee pension {data.rates.pension_deductible ? "is" : "is not"} deducted before PAYE. Rates are edited under Settings › Payroll & taxes, with the date they apply from.</p>
                </div>
              </div>
            )}
          </Card>
        </>
      )}

      {/* One payslip's working: PAYE per band and what RALGA pays on top of the salary. */}
      <Modal
        open={Boolean(chosen)}
        onClose={() => setOpen(null)}
        title={chosen?.name || "Payslip"}
        description={chosen ? [chosen.designation, chosen.department].filter(Boolean).join(" · ") : undefined}
        footer={<Button onClick={() => setOpen(null)}>Close</Button>}
      >
        {chosen && (
          <>
            <Card padded={false} className="overflow-hidden">
              <div className="px-5 pt-5">
                <CardHeader className="mb-3" title="PAYE" subtitle={`On a taxable income of ${fmtMoney(chosen.taxable)}`} />
              </div>
              <DataTable
                minWidth={0}
                rows={(chosen.paye_breakdown || []) as any[]}
                rowKey={(_, i) => String(i)}
                caption="PAYE per band"
                columns={[
                  { key: "band", header: "Band (RWF)", cell: (b: any) => <span className="tabular-nums">{fmtNumber(b.from)} – {b.to ? fmtNumber(b.to) : "and above"} at {b.rate}%</span> },
                  { key: "amount", header: "Income in band (RWF)", numeric: true, cell: (b: any) => <Num value={b.amount} /> },
                  { key: "tax", header: "Tax (RWF)", numeric: true, cell: (b: any) => <Num value={b.tax} />, total: <Num value={chosen.paye} /> },
                ]}
              />
            </Card>
            <Card>
              <CardHeader className="mb-3" title="Paid by RALGA on top of the salary" />
              <dl className="space-y-2 text-t-body">
                {[
                  ["Pension", chosen.pension_er],
                  ["Maternity", chosen.maternity_er],
                  ["Occupational hazards", chosen.occ_hazard_er],
                  ...(chosen.medical_er ? [["Medical", chosen.medical_er]] : []),
                ].map(([k, n]) => (
                  <div key={k} className="flex justify-between gap-3"><dt className="text-ims-muted">{k}</dt><dd className="font-semibold tabular-nums">{fmtMoney(n)}</dd></div>
                ))}
              </dl>
              <p className="mt-3 text-t-small text-ims-muted">Paid by {String(chosen.payment_method || "bank").replace(/_/g, " ")}.</p>
            </Card>
          </>
        )}
      </Modal>
    </Modal>
  );
}
