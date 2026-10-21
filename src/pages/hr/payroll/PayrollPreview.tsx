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
import { AlertTriangle, ArrowLeft, Calculator, CheckCircle2, ChevronDown, ChevronRight, Info, Search, Users } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { MONTHS, payrollApi, rwf } from "@/lib/hr";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { Field, inputCls } from "@/components/portal/kit";
import { cn } from "@/utils";

type Row = Record<string, any>;
const n = (v: number) => Math.round(Number(v) || 0).toLocaleString("en-US");
const BASE_LABEL: Record<string, string> = { gross: "gross pay", gross_excl_transport: "gross pay excluding transport", basic: "basic salary", net_before_cbhi: "net pay before CBHI" };

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
      toast.success(`${p.number} created — ${data.totals.headcount} payslips calculated`);
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

  return (
    <Dialog open onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent className={cn("flex max-h-[94vh] flex-col bg-white", step === "preview" ? "max-w-[min(1280px,96vw)]" : "max-w-lg")}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Calculator size={18} className="text-ralga-navy" /> {step === "choose" ? "New payroll" : `Payroll preview — ${data?.period}`}</DialogTitle>
          <DialogDescription>
            {step === "choose"
              ? "First you see the whole payroll — every payslip, the totals for RRA and RSSB and the rates used. Nothing is saved until you create it."
              : `${office} · PAYE bands and RSSB rates in force on ${data?.rates_on}. Nothing is saved yet.`}
          </DialogDescription>
        </DialogHeader>

        {step === "choose" && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Month" required>
              <select className={inputCls} value={v.month} onChange={(e) => setV((x) => ({ ...x, month: Number(e.target.value) }))}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
            </Field>
            <Field label="Year" required>
              <select className={inputCls} value={v.year} onChange={(e) => setV((x) => ({ ...x, year: Number(e.target.value) }))}>
                {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </Field>
            <Field label="Office" hint="“All offices” makes one payroll for the whole organisation." className="col-span-2">
              <select className={inputCls} value={v.branch} onChange={(e) => setV((x) => ({ ...x, branch: e.target.value }))}>
                <option value="">All offices</option>
                {(branches.data || []).map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </Field>
            <Field label="Notes" className="col-span-2">
              <input className={inputCls} value={v.notes} onChange={(e) => setV((x) => ({ ...x, notes: e.target.value }))} placeholder="Optional, e.g. includes the 13th month for drivers" />
            </Field>
          </div>
        )}

        {step === "preview" && data && (
          <div className="flex min-h-0 flex-1 flex-col gap-3">
            <div className="grid shrink-0 grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Staff paid", String(T.headcount || 0), Users],
                ["Gross pay", rwf(T.gross)],
                ["PAYE to RRA", rwf(T.paye)],
                ["RSSB (employee + employer)", rwf(T.rssb)],
                ["Net pay to staff", rwf(T.net)],
                ["Cost to RALGA", rwf(T.employer_cost)],
              ].map(([k, val]) => (
                <div key={k as string} className="bg-white px-3 py-2.5">
                  <p className="text-[11.5px] text-slate-500">{k as string}</p>
                  <p className="text-[15px] font-semibold tabular-nums text-slate-900">{val as string}</p>
                </div>
              ))}
            </div>

            {(data.existing.length > 0 || data.skipped.length > 0 || data.rates.unconfirmed > 0 || data.rows.some((r: Row) => !r.has_structure)) && (
              <ul className="shrink-0 space-y-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
                {data.existing.length > 0 && <li className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> A payroll for {data.period} already exists ({data.existing.join(", ")}) — creating another one will be refused.</li>}
                {data.skipped.length > 0 && <li className="flex gap-2"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> Left out: {data.skipped.map((s: any) => `${s.name} (${s.reason.toLowerCase()})`).join(", ")}.</li>}
                {data.rows.some((r: Row) => !r.has_structure) && <li className="flex gap-2"><Info size={14} className="mt-0.5 shrink-0" /> {data.rows.filter((r: Row) => !r.has_structure).length} employee(s) have no salary structure: their whole salary is treated as basic pay.</li>}
                {data.rates.unconfirmed > 0 && <li className="flex gap-2"><Info size={14} className="mt-0.5 shrink-0" /> {data.rates.unconfirmed} rate(s) used are not yet confirmed by Finance (Settings → Payroll & taxes).</li>}
              </ul>
            )}

            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <div className="flex rounded-lg bg-slate-100 p-0.5 text-[12.5px] font-medium">
                {[["slips", `Payslips (${data.rows.length})`], ["rates", "Rates used"]].map(([k, l]) => (
                  <button key={k} type="button" onClick={() => setTab(k as any)} className={cn("rounded-md px-3 py-1.5", tab === k ? "bg-white text-ralga-navy shadow-sm" : "text-slate-600")}>{l}</button>
                ))}
              </div>
              {tab === "slips" && (
                <label className="relative">
                  <Search size={14} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input className={cn(inputCls, "h-9 w-60 pl-8")} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Employee or department" />
                </label>
              )}
              <div className="ml-auto"><ExportMenu onExport={doExport} permission={["create_payroll", "export_payroll"]} /></div>
            </div>

            {tab === "slips" ? (
              <div className="min-h-0 flex-1 overflow-auto rounded-md border border-slate-200">
                <table className="dnr-grid w-full min-w-[1150px] text-[12.5px]">
                  <thead className="sticky top-0 z-10 bg-white">
                    <tr>
                      <th className="sticky left-0 z-20 bg-white">Employee</th><th className="text-right">Days</th><th className="text-right">Basic</th><th className="text-right">Allowances</th><th className="text-right">Gross</th>
                      <th className="text-right">PAYE</th><th className="text-right">Pension</th><th className="text-right">Maternity</th><th className="text-right">CBHI</th><th className="text-right">Other</th>
                      <th className="text-right">Net pay</th><th className="text-right">Employer cost</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <React.Fragment key={r.employee}>
                        <tr className="cursor-pointer hover:bg-slate-50" onClick={() => setOpen(open === r.employee ? null : r.employee)}>
                          <td className="sticky left-0 bg-white">
                            <span className="flex items-center gap-1.5">
                              {open === r.employee ? <ChevronDown size={13} className="text-slate-400" /> : <ChevronRight size={13} className="text-slate-400" />}
                              <span>
                                <span className="block font-medium text-slate-900">{r.name}</span>
                                <span className="block text-[11.5px] text-slate-500">{[r.designation, r.department].filter(Boolean).join(" · ")}{!r.has_structure && " · no salary structure"}</span>
                              </span>
                            </span>
                          </td>
                          <td className="text-right tabular-nums text-slate-600">{r.working_days}</td>
                          <td className="text-right tabular-nums">{n(r.basic)}</td>
                          <td className="text-right tabular-nums text-slate-600">{n(r.allowances)}</td>
                          <td className="text-right font-medium tabular-nums">{n(r.gross)}</td>
                          <td className="text-right tabular-nums">{n(r.paye)}</td>
                          <td className="text-right tabular-nums text-slate-600">{n(r.pension_ee)}</td>
                          <td className="text-right tabular-nums text-slate-600">{n(r.maternity_ee)}</td>
                          <td className="text-right tabular-nums text-slate-600">{n(r.cbhi)}</td>
                          <td className="text-right tabular-nums text-slate-600">{n(r.other_deductions + r.advances + (r.medical_ee || 0))}</td>
                          <td className="text-right font-semibold tabular-nums text-slate-900">{n(r.net)}</td>
                          <td className="text-right tabular-nums text-slate-600">{n(r.employer_cost)}</td>
                        </tr>
                        {open === r.employee && (
                          <tr>
                            <td colSpan={12} className="bg-slate-50/70">
                              <div className="grid gap-3 py-1 sm:grid-cols-2">
                                <div>
                                  <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">PAYE on taxable income {rwf(r.taxable)}</p>
                                  <table className="w-full text-[12px]">
                                    <tbody>
                                      {(r.paye_breakdown || []).map((b: any, i: number) => (
                                        <tr key={i}><td className="py-0.5 text-slate-600">{n(b.from)} – {b.to ? n(b.to) : "and above"} at {b.rate}%</td><td className="py-0.5 text-right tabular-nums">{n(b.amount)}</td><td className="py-0.5 text-right font-medium tabular-nums">{n(b.tax)}</td></tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                                <div>
                                  <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wider text-slate-500">Paid by RALGA on top of the salary</p>
                                  <p className="text-[12px] text-slate-600">Pension {n(r.pension_er)} · Maternity {n(r.maternity_er)} · Occupational hazards {n(r.occ_hazard_er)}{r.medical_er ? ` · Medical ${n(r.medical_er)}` : ""}</p>
                                  <p className="mt-1 text-[12px] text-slate-600">Paid by {String(r.payment_method || "bank").replace(/_/g, " ")}</p>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    ))}
                  </tbody>
                  <tfoot className="sticky bottom-0 bg-white">
                    <tr className="border-t-2 border-slate-300 font-semibold">
                      <td className="sticky left-0 bg-white">Total · {T.headcount} staff</td><td />
                      <td className="text-right tabular-nums">{n(T.basic)}</td><td className="text-right tabular-nums">{n(T.allowances)}</td><td className="text-right tabular-nums">{n(T.gross)}</td>
                      <td className="text-right tabular-nums">{n(T.paye)}</td><td className="text-right tabular-nums">{n(T.pension_ee)}</td><td className="text-right tabular-nums">{n(T.maternity_ee)}</td>
                      <td className="text-right tabular-nums">{n(T.cbhi)}</td><td className="text-right tabular-nums">{n(T.other_deductions + T.advances + (T.medical_ee || 0))}</td>
                      <td className="text-right tabular-nums">{n(T.net)}</td><td className="text-right tabular-nums">{n(T.employer_cost)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <div className="grid min-h-0 flex-1 gap-3 overflow-auto lg:grid-cols-2">
                {(["regular", "casual"] as const).filter((t) => (data.rates.bands[t] || []).length).map((t) => (
                  <section key={t} className="rounded-md border border-slate-200">
                    <h3 className="border-b border-slate-100 px-3 py-2 text-[13px] font-semibold text-slate-900">PAYE bands — {t === "regular" ? "permanent and contract staff" : "casual workers"}</h3>
                    <table className="dnr-grid w-full text-[12.5px]">
                      <thead><tr><th>Monthly taxable income (RWF)</th><th className="text-right">Rate</th></tr></thead>
                      <tbody>{data.rates.bands[t].map((b: any, i: number) => <tr key={i}><td>{n(b.min)} – {b.max ? n(b.max) : "and above"}</td><td className="text-right font-medium">{b.rate}%</td></tr>)}</tbody>
                    </table>
                  </section>
                ))}
                <section className="rounded-md border border-slate-200 lg:col-span-2">
                  <h3 className="border-b border-slate-100 px-3 py-2 text-[13px] font-semibold text-slate-900">Statutory contributions</h3>
                  <table className="dnr-grid w-full text-[12.5px]">
                    <thead><tr><th>Contribution</th><th>Calculated on</th><th className="text-right">Employee</th><th className="text-right">Employer</th><th>Paid to</th></tr></thead>
                    <tbody>{data.rates.contributions.map((c: any) => <tr key={c.code}><td className="font-medium">{c.name}</td><td className="text-slate-600">{BASE_LABEL[c.base] || c.base}{c.cap ? ` (up to ${n(c.cap)})` : ""}</td><td className="text-right">{c.ee}%</td><td className="text-right">{c.er}%</td><td>{c.remit_to}</td></tr>)}</tbody>
                  </table>
                  <p className="px-3 py-2 text-[12px] text-slate-500">Employee pension {data.rates.pension_deductible ? "is" : "is not"} deducted before PAYE. Rates are edited under Settings → Payroll & taxes, with the date they apply from.</p>
                </section>
              </div>
            )}
          </div>
        )}

        <DialogFooter className="gap-2">
          {step === "choose" ? (
            <>
              <Button variant="outline" onClick={onClose}>Cancel</Button>
              <Button disabled={busy} onClick={preview}><Calculator size={14} /> {busy ? "Calculating…" : "Preview payroll"}</Button>
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => setStep("choose")} disabled={busy}><ArrowLeft size={14} /> Change period</Button>
              <Button disabled={busy || !data?.rows.length || data?.existing.length > 0} onClick={create}><CheckCircle2 size={14} /> {busy ? "Creating…" : `Create payroll for ${data?.totals.headcount || 0} staff`}</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
