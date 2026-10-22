/**
 * Setup → Tax & statutory rates. All rates are dated tables (never hard-coded). Seeded rates come
 * from the vendor and MUST be confirmed by Finance against rra.gov.rw / rssb.rw before go-live:
 * the DAF records the source when confirming, and changing a rate clears the confirmation.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { AlertTriangle, BadgeCheck, ExternalLink, Pencil, Percent, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { imsApi } from "@/lib/ims";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ImportButton } from "@/components/enterprise/ExcelImport";
import { IMPORTS } from "@/lib/importConfigs";
import { toInputDate } from "@/components/portal/kit";
import {
  Button,
  Card,
  Checkbox,
  Column,
  ConfirmDialog,
  DataTable,
  DatePicker,
  EmptyState,
  Field,
  Input,
  Modal,
  ModalSection,
  Num,
  Page,
  PageHeader,
  Select,
  StatusPill,
  Tabs,
  Textarea,
  fmtDate,
  sentence,
} from "@/components/ims";

type Table = "tax_rates" | "paye_bands" | "statutory_contributions";
const TABS: { key: Table; label: string }[] = [
  { key: "tax_rates", label: "VAT and withholding" },
  { key: "paye_bands", label: "PAYE bands" },
  { key: "statutory_contributions", label: "RSSB and statutory contributions" },
];

/** Finance confirmation in the glossary: confirmed = Approved, not yet = Pending approval. */
function Confirmed({ row }: { row: any }) {
  return row.confirmed_by_finance ? (
    <StatusPill status="Approved" sub={row.expand?.confirmed_by ? `${row.expand.confirmed_by.name} · ${fmtDate(row.confirmed_at)}` : "Confirmed by Finance"} />
  ) : (
    <StatusPill status="Pending approval" sub="To be confirmed by Finance" />
  );
}
const pct = (v: any) => (v === null || v === undefined || v === "" ? "—" : `${Number(v).toLocaleString("en-US", { maximumFractionDigits: 3 })}%`);
const inForce = (from?: string, to?: string) => `${from ? fmtDate(from) : "—"} – ${to ? fmtDate(to) : "open"}`;

export default function TaxRates() {
  const { can } = usePermissions();
  const canConfirm = can("confirm_tax_rates");
  const canManage = can("manage_tax_rates");
  const canPayroll = can("manage_payroll_settings");
  const queryClient = useQueryClient();
  const [tab, setTab] = React.useState<Table>("tax_rates");
  const [confirming, setConfirming] = React.useState<{ table: Table; row: any } | null>(null);
  const [editing, setEditing] = React.useState<any>(null);
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);

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

  async function confirm(source: string) {
    if (!confirming) return;
    if (source.trim().length < 5) {
      toast.error("Say where you checked the rate (law, article, RRA / RSSB notice).");
      throw new Error("source");
    }
    try {
      await imsApi.confirmRate(confirming.table, confirming.row.id, source.trim());
      toast.success("Rate confirmed — recorded in the audit log");
      setConfirming(null);
      queryClient.invalidateQueries(["tax-tables"]);
    } catch (e) {
      toast.error(errorMessage(e));
      throw e;
    }
  }

  async function saveRate() {
    if (!editing) return;
    setTried(true);
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

  const openNew = () => { setTried(false); setEditing({ category: "withholding", active: true, rate: "", effective_from: new Date().toISOString().slice(0, 10) }); };
  const openEdit = (r: any) => { setTried(false); setEditing({ ...r, effective_from: toInputDate(r.effective_from), effective_to: toInputDate(r.effective_to) }); };

  const confirmColumn: Column<any> = { key: "confirmed", header: "Finance confirmation", cell: (r) => <Confirmed row={r} /> };
  const columns: Column<any>[] =
    tab === "tax_rates"
      ? [
          { key: "rate_name", header: "Rate", clamp: true, cell: (r) => <span className="font-semibold">{r.name}</span>, sub: (r) => [r.code, r.legal_reference].filter(Boolean).join(" · ") },
          { key: "rate", header: "Rate (%)", numeric: true, cell: (r) => <span className="font-semibold">{pct(r.rate)}</span> },
          { key: "in_force", header: "In force", nowrap: true, cell: (r) => inForce(r.effective_from, r.effective_to) },
          { key: "gl", header: "GL account", clamp: true, cell: (r) => (r.expand?.gl_account ? `${r.expand.gl_account.code} ${r.expand.gl_account.name}` : <span className="text-ims-faint">—</span>) },
          confirmColumn,
        ]
      : tab === "paye_bands"
        ? [
            { key: "type", header: "Employee type", cell: (r) => sentence(r.employment_type) },
            { key: "from", header: "From (RWF)", numeric: true, cell: (r) => <Num value={r.min_amount} /> },
            { key: "to", header: "To (RWF)", numeric: true, cell: (r) => (r.max_amount ? <Num value={r.max_amount} /> : <span className="text-ims-muted">and above</span>) },
            { key: "rate", header: "Rate (%)", numeric: true, cell: (r) => <span className="font-semibold">{pct(r.rate)}</span> },
            { key: "in_force", header: "In force", nowrap: true, cell: (r) => inForce(r.effective_from, r.effective_to) },
            confirmColumn,
          ]
        : [
            { key: "name", header: "Contribution", clamp: true, cell: (r) => <span className="font-semibold">{r.name}</span>, sub: (r) => r.code },
            { key: "employee", header: "Employee (%)", numeric: true, cell: (r) => pct(r.employee_rate) },
            { key: "employer", header: "Employer (%)", numeric: true, cell: (r) => pct(r.employer_rate) },
            { key: "base", header: "Base", cell: (r) => sentence(String(r.base || "")) || <span className="text-ims-faint">—</span> },
            { key: "remit", header: "Remit to", cell: (r) => r.remit_to || <span className="text-ims-faint">—</span> },
            confirmColumn,
          ];

  const editable = canManage && tab === "tax_rates";

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Setup" }, { label: "Tax rates" }]}
        title="Tax and statutory rates"
        subtitle="Dated rate tables used by invoices, payment vouchers and payroll. Nothing is hard-coded."
        actions={
          <>
            <ExportMenu onExport={doExport} permission={["view_master_data", "export_reports"]} disabled={!rows.length} />
            {tab === "tax_rates" && <ImportButton config={IMPORTS.taxRates} size="default" />}
          </>
        }
        primary={editable ? { label: "New rate", icon: Plus, onClick: openNew } : undefined}
        secondary={canPayroll && tab !== "tax_rates" ? [{ label: "Edit in payroll settings", icon: ExternalLink, to: "/dashboard/settings/general-settings/payroll" }] : []}
      />

      {unconfirmed > 0 && (
        <div role="status" className="flex items-start gap-3 rounded-card border border-ims-priority-high/50 bg-ims-warning-bg px-5 py-4 text-ims-warning">
          <AlertTriangle size={20} className="mt-0.5 shrink-0" aria-hidden />
          <div>
            <p className="text-t-body font-bold">{unconfirmed} rate{unconfirmed > 1 ? "s" : ""} not yet confirmed by Finance</p>
            <p className="mt-0.5 text-t-small text-ims-body">The seeded rates reflect the vendor's understanding of Rwandan law. Check each one against the current law on rra.gov.rw and rssb.rw, then choose “Confirm rate” in the row menu and record the source.</p>
          </div>
        </div>
      )}

      <Card padded={false} className="overflow-hidden">
        <Tabs
          inset
          label="Rate tables"
          tabs={TABS.map((t) => ({ key: t.key, label: t.label, count: q.data ? q.data[t.key].length : undefined }))}
          active={tab}
          onChange={(k) => setTab(k as Table)}
        />
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.id}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={820}
          caption={TABS.find((t) => t.key === tab)?.label}
          rowClassName={(r) => r.active === false && "text-ims-muted"}
          onRowClick={editable ? openEdit : undefined}
          rowActions={
            editable || canConfirm
              ? (r) => [
                  ...(editable ? [{ label: "Edit", icon: Pencil, onSelect: openEdit }] : []),
                  ...(canConfirm && !r.confirmed_by_finance ? [{ label: "Confirm rate", icon: BadgeCheck, onSelect: () => setConfirming({ table: tab, row: r }) }] : []),
                ]
              : undefined
          }
          empty={<EmptyState icon={Percent} text="No rates in this table yet." action={editable ? <Button variant="primary" icon={Plus} onClick={openNew}>New rate</Button> : undefined} />}
        />
      </Card>

      <ConfirmDialog
        open={Boolean(confirming)}
        onClose={() => setConfirming(null)}
        title={`Confirm ${confirming?.row?.name || confirming?.row?.code || "this rate"} against the official source?`}
        description="You confirm that this rate matches the law in force. Your name, the time and the source are kept in the audit log."
        confirmLabel="Confirm rate"
        reason={{ label: "Source checked", placeholder: "For example: Law on income tax, article …; RRA public notice of …", min: 5, required: true }}
        onConfirm={confirm}
      />

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.id ? `Edit ${editing.code}` : "New tax rate"}
        description="To change a rate from a date, end the current one and add a new one — history is kept. Saving clears the Finance confirmation."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={saveRate} loading={busy}>Save rate</Button>
          </>
        }
      >
        {editing && (
          <>
            <ModalSection title="Rate">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Code" required htmlFor="tr-code" error={tried && !editing.code ? "Enter a code, such as WHT_SERVICES." : null}>
                  <Input id="tr-code" value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value.toUpperCase() })} className="font-mono" placeholder="WHT_SERVICES" invalid={tried && !editing.code} />
                </Field>
                <Field label="Category" required htmlFor="tr-category">
                  <Select id="tr-category" value={editing.category} onChange={(e) => setEditing({ ...editing, category: e.target.value })}>
                    <option value="vat">VAT</option><option value="withholding">Withholding</option><option value="excise">Excise</option><option value="other">Other</option>
                  </Select>
                </Field>
                <Field label="Name" required htmlFor="tr-name" className="sm:col-span-2" error={tried && !editing.name ? "Enter the name of the rate." : null}>
                  <Input id="tr-name" value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} invalid={tried && !editing.name} />
                </Field>
                <Field label="Rate (%)" required htmlFor="tr-rate" error={tried && editing.rate === "" ? "Enter the rate, between 0 and 100." : null}>
                  <Input id="tr-rate" type="number" step="0.01" min={0} max={100} value={editing.rate} onChange={(e) => setEditing({ ...editing, rate: e.target.value })} className="text-right tabular-nums" invalid={tried && editing.rate === ""} />
                </Field>
                <Field label="Payable / recoverable account" htmlFor="tr-gl">
                  <Select id="tr-gl" value={editing.gl_account || ""} onChange={(e) => setEditing({ ...editing, gl_account: e.target.value })}>
                    <option value="">— None —</option>
                    {(accounts.data || []).map((a: any) => <option key={a.id} value={a.id}>{a.code} — {a.name}</option>)}
                  </Select>
                </Field>
              </div>
            </ModalSection>
            <ModalSection title="Validity and source">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="In force from" required htmlFor="tr-from" error={tried && !editing.effective_from ? "Choose the first day the rate applies." : null}>
                  <DatePicker id="tr-from" value={editing.effective_from || ""} onChange={(v) => setEditing({ ...editing, effective_from: v })} invalid={tried && !editing.effective_from} />
                </Field>
                <Field
                  label="Until"
                  htmlFor="tr-to"
                  hint={
                    editing.effective_to ? (
                      <button type="button" className="font-bold text-ims-link hover:underline" onClick={() => setEditing({ ...editing, effective_to: "" })}>Clear the end date</button>
                    ) : (
                      "Leave empty while the rate is in force."
                    )
                  }
                >
                  <DatePicker id="tr-to" value={editing.effective_to || ""} min={editing.effective_from || undefined} onChange={(v) => setEditing({ ...editing, effective_to: v })} placeholder="Open" />
                </Field>
                <Field label="Applies to" htmlFor="tr-applies" className="sm:col-span-2">
                  <Input id="tr-applies" value={editing.applies_to || ""} onChange={(e) => setEditing({ ...editing, applies_to: e.target.value })} />
                </Field>
                <Field label="Legal reference" htmlFor="tr-legal" className="sm:col-span-2">
                  <Input id="tr-legal" value={editing.legal_reference || ""} onChange={(e) => setEditing({ ...editing, legal_reference: e.target.value })} />
                </Field>
                <Checkbox label="Active" checked={Boolean(editing.active)} onChange={(v) => setEditing({ ...editing, active: v })} className="sm:col-span-2" />
                <Field label="Notes" htmlFor="tr-notes" className="sm:col-span-2">
                  <Textarea id="tr-notes" value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} />
                </Field>
              </div>
            </ModalSection>
          </>
        )}
      </Modal>
    </Page>
  );
}
