/**
 * Setup → Tax & statutory rates. All rates are dated tables (never hard-coded). Seeded rates come
 * from the vendor and MUST be confirmed by Finance against rra.gov.rw / rssb.rw before go-live:
 * the DAF records the source when confirming, and changing a rate clears the confirmation.
 */
import * as React from "react";
import { Link } from "react-router-dom";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, CalendarRange, ExternalLink, Percent, Plus, ShieldAlert } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { imsApi, showDay } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ImportButton } from "@/components/enterprise/ExcelImport";
import { IMPORTS } from "@/lib/importConfigs";
import { Field, FormBlock, FormDialog, inputCls, showDate, textareaCls, toInputDate } from "@/components/portal/kit";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/utils";

type Table = "tax_rates" | "paye_bands" | "statutory_contributions";
const TABS: { key: Table; label: string }[] = [
  { key: "tax_rates", label: "VAT & withholding" },
  { key: "paye_bands", label: "PAYE bands" },
  { key: "statutory_contributions", label: "RSSB & statutory contributions" },
];

function Confirmed({ ok }: { ok: boolean }) {
  return ok ? (
    <Badge tone="success"><BadgeCheck size={12} className="mr-1" /> Confirmed by Finance</Badge>
  ) : (
    <Badge tone="warning"><ShieldAlert size={12} className="mr-1" /> To be confirmed</Badge>
  );
}

export default function TaxRates() {
  const { can } = usePermissions();
  const canConfirm = can("confirm_tax_rates");
  const canManage = can("manage_tax_rates");
  const canPayroll = can("manage_payroll_settings");
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<Table>("tax_rates");
  const [confirming, setConfirming] = React.useState<{ table: Table; row: any } | null>(null);
  const [source, setSource] = React.useState("");
  const [editing, setEditing] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);

  const q = useQuery(["tax-tables"], async () => {
    const [tax, paye, contributions] = await Promise.all([
      pocketbase.collection("tax_rates").getFullList({ sort: "category,code,-effective_from", expand: "gl_account,confirmed_by" }),
      pocketbase.collection("paye_bands").getFullList({ sort: "employment_type,min_amount" }),
      pocketbase.collection("statutory_contributions").getFullList({ sort: "sort" }),
    ]);
    return { tax_rates: tax, paye_bands: paye, statutory_contributions: contributions } as Record<Table, any[]>;
  });
  const accounts = useQuery(["gl-liability-accounts"], () => pocketbase.collection("gl_accounts").getFullList({ filter: 'is_posting = true && (type = "liability" || type = "asset")', sort: "code" }), { enabled: canManage });

  const unconfirmed = q.data ? Object.values(q.data).flat().filter((r: any) => !r.confirmed_by_finance && r.active !== false).length : 0;

  async function confirm() {
    if (!confirming) return;
    if (source.trim().length < 5) return toast.error("Say where you checked the rate (law, article, RRA / RSSB notice).");
    setBusy(true);
    try {
      await imsApi.confirmRate(confirming.table, confirming.row.id, source.trim());
      toast.success("Rate confirmed — recorded in the audit log");
      setConfirming(null);
      setSource("");
      queryClient.invalidateQueries(["tax-tables"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function saveRate() {
    if (!editing) return;
    if (!editing.code || !editing.name || editing.rate === "" || !editing.effective_from) return toast.error("Code, name, rate and start date are required.");
    setBusy(true);
    const data = {
      code: editing.code, name: editing.name, category: editing.category, rate: Number(editing.rate), active: Boolean(editing.active),
      effective_from: `${editing.effective_from} 00:00:00.000Z`, effective_to: editing.effective_to ? `${editing.effective_to} 23:59:59.999Z` : "",
      gl_account: editing.gl_account || "", applies_to: editing.applies_to || "", legal_reference: editing.legal_reference || "", notes: editing.notes || "",
    };
    try {
      if (editing.id) await pocketbase.collection("tax_rates").update(editing.id, data);
      else await pocketbase.collection("tax_rates").create(data);
      toast.success("Rate saved — it now needs Finance confirmation");
      setEditing(null);
      queryClient.invalidateQueries(["tax-tables"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const rows = q.data?.[tab] || [];
  const doExport = (format: "xlsx" | "pdf" | "csv") => {
    const base = [{ header: "Confirmed by Finance", value: (r: any) => (r.confirmed_by_finance ? "Yes" : "No") }, { header: "Legal reference", value: (r: any) => r.legal_reference || "" }];
    const columns =
      tab === "tax_rates"
        ? [{ header: "Code", value: (r: any) => r.code }, { header: "Name", value: (r: any) => r.name }, { header: "Rate %", value: (r: any) => r.rate, format: "number" as const }, { header: "From", value: (r: any) => r.effective_from, format: "date" as const }, { header: "To", value: (r: any) => r.effective_to, format: "date" as const }, ...base]
        : tab === "paye_bands"
          ? [{ header: "Employee type", value: (r: any) => r.employment_type }, { header: "From (RWF)", value: (r: any) => r.min_amount, format: "money" as const }, { header: "To (RWF)", value: (r: any) => r.max_amount || "and above" }, { header: "Rate %", value: (r: any) => r.rate, format: "number" as const }, ...base]
          : [{ header: "Code", value: (r: any) => r.code }, { header: "Contribution", value: (r: any) => r.name }, { header: "Employee %", value: (r: any) => r.employee_rate, format: "number" as const }, { header: "Employer %", value: (r: any) => r.employer_rate, format: "number" as const }, { header: "Base", value: (r: any) => r.base }, ...base];
    return exportReport({ title: `Tax rates — ${TABS.find((t) => t.key === tab)?.label}`, rows, columns, format, what: tab });
  };

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Tax & statutory rates"
        description="Dated rate tables used by invoices, payment vouchers and payroll. Nothing is hard-coded."
        breadcrumbs={[{ title: "Setup", link: "#" }, { title: "Tax rates", link: "/dashboard/setup/tax-rates" }]}
        actions={
          <>
            <ExportMenu onExport={doExport} permission={["view_master_data", "export_reports"]} disabled={!rows.length} />
            {tab === "tax_rates" && <ImportButton config={IMPORTS.taxRates} size="default" />}
            {canManage && tab === "tax_rates" && (
              <Button onClick={() => setEditing({ category: "withholding", active: true, rate: "", effective_from: new Date().toISOString().slice(0, 10) })}>
                <Plus size={15} /> New rate
              </Button>
            )}
            {canPayroll && tab !== "tax_rates" && (
              <Button asChild variant="outline">
                <Link to="/dashboard/settings/general-settings/payroll"><ExternalLink size={14} /> Edit in payroll settings</Link>
              </Button>
            )}
          </>
        }
      />

      {unconfirmed > 0 && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-[13px] text-amber-900">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">{unconfirmed} rate{unconfirmed > 1 ? "s" : ""} not yet confirmed by Finance</p>
            <p className="text-amber-800">The seeded rates reflect the vendor's understanding of Rwandan law. Check each one against the current law on rra.gov.rw and rssb.rw, then press “Confirm” and record the source.</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)} className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-[13px] font-medium", tab === t.key ? "border-primary text-primaryDark" : "border-transparent text-slate-500 hover:text-slate-800")}>
            {t.label}
          </button>
        ))}
      </div>

      <Panel bodyClassName="px-0 pb-0">
        {q.isLoading ? (
          <div className="p-4"><ListSkeleton rows={5} /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="dnr-grid w-full min-w-[720px]">
              <thead>
                {tab === "tax_rates" ? (
                  <tr><th>Rate</th><th className="text-right">%</th><th>In force</th><th>GL account</th><th>Status</th><th /></tr>
                ) : tab === "paye_bands" ? (
                  <tr><th>Employee type</th><th className="text-right">From (RWF)</th><th className="text-right">To (RWF)</th><th className="text-right">%</th><th>In force</th><th>Status</th><th /></tr>
                ) : (
                  <tr><th>Contribution</th><th className="text-right">Employee %</th><th className="text-right">Employer %</th><th>Base</th><th>Remit to</th><th>Status</th><th /></tr>
                )}
              </thead>
              <tbody>
                {rows.map((r: any) => (
                  <tr key={r.id} className={cn(r.active === false && "opacity-60")}>
                    {tab === "tax_rates" ? (
                      <>
                        <td>
                          <span className="block font-medium text-slate-900">{r.name}</span>
                          <span className="block font-mono text-[11.5px] text-slate-500">{r.code}</span>
                          {r.legal_reference && <span className="block text-[11.5px] text-slate-500">{r.legal_reference}</span>}
                        </td>
                        <td className="text-right text-[15px] font-semibold tabular-nums text-slate-900">{r.rate}%</td>
                        <td className="text-[12.5px] text-slate-600">{showDay(r.effective_from)} – {r.effective_to ? showDay(r.effective_to) : "open"}</td>
                        <td className="text-[12.5px] text-slate-600">{r.expand?.gl_account ? `${r.expand.gl_account.code} ${r.expand.gl_account.name}` : "—"}</td>
                      </>
                    ) : tab === "paye_bands" ? (
                      <>
                        <td className="capitalize">{r.employment_type}</td>
                        <td className="text-right tabular-nums">{Number(r.min_amount).toLocaleString()}</td>
                        <td className="text-right tabular-nums">{r.max_amount ? Number(r.max_amount).toLocaleString() : "and above"}</td>
                        <td className="text-right font-semibold tabular-nums">{r.rate}%</td>
                        <td className="text-[12.5px] text-slate-600">{r.effective_from ? showDay(r.effective_from) : "—"} – {r.effective_to ? showDay(r.effective_to) : "open"}</td>
                      </>
                    ) : (
                      <>
                        <td>
                          <span className="block font-medium text-slate-900">{r.name}</span>
                          <span className="block font-mono text-[11.5px] text-slate-500">{r.code}</span>
                        </td>
                        <td className="text-right tabular-nums">{r.employee_rate}%</td>
                        <td className="text-right tabular-nums">{r.employer_rate}%</td>
                        <td className="text-[12.5px] text-slate-600">{String(r.base || "").replace(/_/g, " ")}</td>
                        <td className="text-[12.5px] text-slate-600">{r.remit_to || "—"}</td>
                      </>
                    )}
                    <td>
                      <span className="flex flex-col items-start gap-1">
                        <Confirmed ok={r.confirmed_by_finance} />
                        {r.expand?.confirmed_by && <span className="text-[11px] text-slate-500">{r.expand.confirmed_by.name} · {showDate(r.confirmed_at)}</span>}
                      </span>
                    </td>
                    <td className="text-right">
                      <span className="inline-flex gap-1">
                        {canManage && tab === "tax_rates" && (
                          <Button size="sm" variant="ghost" onClick={() => setEditing({ ...r, effective_from: toInputDate(r.effective_from), effective_to: toInputDate(r.effective_to) })}>Edit</Button>
                        )}
                        {canConfirm && !r.confirmed_by_finance && (
                          <Button size="sm" variant="outline" onClick={() => setConfirming({ table: tab, row: r })}>
                            <BadgeCheck size={13} /> Confirm
                          </Button>
                        )}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog open={Boolean(confirming)} onOpenChange={(o) => !o && setConfirming(null)}>
        <DialogContent className="max-w-md bg-white">
          <DialogHeader>
            <DialogTitle>Confirm rate against the official source</DialogTitle>
            <DialogDescription>You confirm that this rate matches the law in force. Your name, the time and the source are kept in the audit log.</DialogDescription>
          </DialogHeader>
          <label className="block">
            <span className="mb-1 block text-[12.5px] font-medium text-slate-700">Source checked <span className="text-red-600">*</span></span>
            <textarea value={source} onChange={(e) => setSource(e.target.value)} placeholder="e.g. Law on income tax, article …; RRA public notice of …" className="h-24 w-full rounded-md border border-slate-200 px-3 py-2 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
          </label>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirming(null)}>Cancel</Button>
            <Button onClick={confirm} disabled={busy}><BadgeCheck size={14} /> Confirm rate</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        icon={Percent}
        title={editing?.id ? `Edit ${editing.code}` : "New tax rate"}
        description="To change a rate from a date, end the current one and add a new one — history is kept. Saving clears the Finance confirmation."
        submitLabel="Save rate"
        busy={busy}
        onSubmit={saveRate}
      >
        {editing && (
          <>
            <FormBlock icon={Percent} title="Rate">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Code" required><input value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} className={cn(inputCls, "font-mono")} placeholder="WHT_SERVICES" /></Field>
                <Field label="Category" required>
                  <select value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })} className={inputCls}>
                    <option value="vat">VAT</option><option value="withholding">Withholding</option><option value="excise">Excise</option><option value="other">Other</option>
                  </select>
                </Field>
                <Field label="Name" required className="sm:col-span-2"><input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} /></Field>
                <Field label="Rate (%)" required><input type="number" step="0.01" min={0} max={100} value={editing.rate} onChange={(e) => setEditing({ ...editing, rate: e.target.value })} className={cn(inputCls, "text-right")} /></Field>
                <Field label="Payable / recoverable account">
                  <select value={editing.gl_account || ""} onChange={(e) => setEditing({ ...editing, gl_account: e.target.value })} className={inputCls}>
                    <option value="">— None —</option>
                    {(accounts.data || []).map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </select>
                </Field>
              </div>
            </FormBlock>
            <FormBlock icon={CalendarRange} title="Validity and source">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="In force from" required><input type="date" value={editing.effective_from || ""} onChange={(e) => setEditing({ ...editing, effective_from: e.target.value })} className={inputCls} /></Field>
                <Field label="Until (optional)"><input type="date" value={editing.effective_to || ""} onChange={(e) => setEditing({ ...editing, effective_to: e.target.value })} className={inputCls} /></Field>
                <Field label="Applies to" className="sm:col-span-2"><input value={editing.applies_to || ""} onChange={(e) => setEditing({ ...editing, applies_to: e.target.value })} className={inputCls} /></Field>
                <Field label="Legal reference" className="sm:col-span-2"><input value={editing.legal_reference || ""} onChange={(e) => setEditing({ ...editing, legal_reference: e.target.value })} className={inputCls} /></Field>
                <label className="flex items-center gap-2.5 text-[13.5px] text-slate-700"><input type="checkbox" checked={Boolean(editing.active)} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-primary" /> Active</label>
                <Field label="Notes" className="sm:col-span-2"><textarea value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} className={textareaCls} /></Field>
              </div>
            </FormBlock>
          </>
        )}
      </FormDialog>
    </div>
  );
}
