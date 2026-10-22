import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Info, Plus, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/procurement";
import { CONTRIBUTION_BASES, payrollApi } from "@/lib/hr";
import {
  Button,
  Card,
  CardHeader,
  Checkbox,
  Column,
  DataTable,
  Field,
  Input,
  MoneyInput,
  Num,
  Select,
  checkboxClass,
  fmtMoney,
  fmtNumber,
  inputClass,
} from "@/components/ims";
import { cn } from "@/utils";

const cell = cn(inputClass, "h-9 text-right tabular-nums");

/** Shown as a tab of Settings (Payroll & taxes): the Settings page carries the page header. */
export default function PayrollTaxSettings() {
  const { canPerform } = useRoles();
  const canEdit = canPerform("manage_payroll_settings");
  return (
    <div className="flex flex-col gap-4 p-4">
      <p className="flex items-start gap-2 rounded-card border border-ims-info/30 bg-ims-info-bg px-4 py-3 text-t-body text-ims-info">
        <Info size={16} className="mt-0.5 shrink-0" aria-hidden />
        <span>
          Pre-filled with the Rwanda rates in force when the system was set up (PAYE per Law N° 027/2022 on income tax; RSSB pension 6% + 6%, maternity 0.3% + 0.3%, occupational hazards 2% employer, CBHI 0.5% of net salary). Check them against the latest RRA and RSSB notices before each financial year. Every rate here can be changed without development, and each payroll keeps the rates it was calculated with.
        </span>
      </p>
      {!canEdit && <p className="text-t-small text-ims-muted">You can view these settings. Changing them needs the “Configure PAYE bands and statutory contributions” permission.</p>}
      <Bands canEdit={canEdit} />
      <Contributions canEdit={canEdit} />
      <Options canEdit={canEdit} />
      <Tester />
    </div>
  );
}

function Bands({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery(["paye-bands"], () => pocketbase.collection("paye_bands").getFullList({ sort: "employment_type,min_amount" }));
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [removed, setRemoved] = React.useState<string[]>([]);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (q.data) setRows(q.data.map((b: any) => ({ ...b })));
  }, [q.data]);
  async function save() {
    for (const t of ["regular", "casual"]) {
      const list = rows!.filter((r) => r.employment_type === t && r.active !== false).sort((a, b) => a.min_amount - b.min_amount);
      for (let i = 1; i < list.length; i++) if (Number(list[i].min_amount) !== Number(list[i - 1].max_amount) + 1) return toast.error(`${t === "regular" ? "Employee" : "Casual"} bands must follow each other: a band starts one franc after the previous one ends.`);
      if (list.length && Number(list[list.length - 1].max_amount) !== 0) return toast.error("The last band must have no upper limit (0).");
    }
    setBusy(true);
    try {
      for (const id of removed) await pocketbase.collection("paye_bands").delete(id);
      for (const r of rows!) {
        const data = { employment_type: r.employment_type, min_amount: Number(r.min_amount), max_amount: Number(r.max_amount) || 0, rate: Number(r.rate), active: r.active !== false, effective_from: r.effective_from || "", notes: r.notes || "" };
        if (r.id) await pocketbase.collection("paye_bands").update(r.id, data);
        else await pocketbase.collection("paye_bands").create(data);
      }
      toast.success("PAYE bands saved");
      setRemoved([]);
      queryClient.invalidateQueries(["paye-bands"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!rows) return <Skeleton className="h-48 w-full" />;
  const up = (i: number, k: string, v: any) => setRows((xs) => xs!.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const label = (t: string) => (t === "regular" ? "Employees" : "Casual workers");
  const columns = (t: string): Column<{ r: any; i: number }>[] => [
    { key: "min", header: "From (RWF)", cell: ({ r, i }) => <input disabled={!canEdit} type="number" min={0} className={cell} value={r.min_amount} onChange={(e) => up(i, "min_amount", e.target.value)} aria-label={`${label(t)} band ${i + 1}: from`} /> },
    { key: "max", header: "To (RWF), 0 = no limit", cell: ({ r, i }) => <input disabled={!canEdit} type="number" min={0} className={cell} value={r.max_amount} onChange={(e) => up(i, "max_amount", e.target.value)} aria-label={`${label(t)} band ${i + 1}: to`} /> },
    { key: "rate", header: "Rate (%)", width: "110px", cell: ({ r, i }) => <input disabled={!canEdit} type="number" min={0} max={100} step={0.5} className={cell} value={r.rate} onChange={(e) => up(i, "rate", e.target.value)} aria-label={`${label(t)} band ${i + 1}: rate`} /> },
    ...(canEdit
      ? [{
          key: "remove", header: <span className="sr-only">Remove</span>, width: "56px", align: "center" as const,
          cell: ({ r, i }: { r: any; i: number }) => <Button variant="ghost" size="icon-sm" icon={Trash2} aria-label={`Remove ${label(t).toLowerCase()} band ${i + 1}`} onClick={() => { if (r.id) setRemoved((x) => [...x, r.id]); setRows((xs) => xs!.filter((_, j) => j !== i)); }} />,
        }]
      : []),
  ];
  return (
    <Card>
      <CardHeader title="PAYE tax bands" subtitle="Monthly taxable income. Progressive: each rate applies only to the part of the income inside its band." />
      <div className="grid gap-5 lg:grid-cols-2">
        {(["regular", "casual"] as const).map((t) => (
          <div key={t} className="min-w-0">
            <h3 className="mb-2 text-t-body font-bold text-ims-text">{label(t)}</h3>
            <div className="overflow-hidden rounded-card border border-ims-border">
              <DataTable
                minWidth={420}
                columns={columns(t)}
                rows={rows.map((r, i) => ({ r, i })).filter((x) => x.r.employment_type === t)}
                rowKey={({ r, i }) => r.id || `new-${i}`}
                caption={`PAYE bands for ${label(t).toLowerCase()}`}
              />
            </div>
            {canEdit && <Button size="sm" icon={Plus} className="mt-3" onClick={() => setRows((xs) => [...xs!, { employment_type: t, min_amount: 0, max_amount: 0, rate: 0, active: true }])}>Add band</Button>}
          </div>
        ))}
      </div>
      {canEdit && <div className="mt-4 flex justify-end border-t border-ims-divider pt-4"><Button variant="primary" loading={busy} onClick={save}>Save bands</Button></div>}
    </Card>
  );
}

function Contributions({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery(["statutory-contributions"], () => pocketbase.collection("statutory_contributions").getFullList({ sort: "sort" }));
  const [rows, setRows] = React.useState<any[] | null>(null);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (q.data) setRows(q.data.map((c: any) => ({ ...c })));
  }, [q.data]);
  async function save() {
    setBusy(true);
    try {
      for (const [i, r] of rows!.entries()) {
        const data = { code: String(r.code || "").toUpperCase().replace(/\W/g, "_"), name: r.name, employee_rate: Number(r.employee_rate) || 0, employer_rate: Number(r.employer_rate) || 0, base: r.base, cap_amount: Number(r.cap_amount) || 0, remit_to: r.remit_to || "", active: Boolean(r.active), sort: i + 1, description: r.description || "" };
        if (!data.code || !data.name) throw new Error("Each contribution needs a code and a name.");
        if (r.id) await pocketbase.collection("statutory_contributions").update(r.id, data);
        else await pocketbase.collection("statutory_contributions").create(data);
      }
      toast.success("Contributions saved");
      queryClient.invalidateQueries(["statutory-contributions"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!rows) return <Skeleton className="h-48 w-full" />;
  const up = (i: number, k: string, v: any) => setRows((xs) => xs!.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const name = (r: any, i: number) => r.name || `Contribution ${i + 1}`;
  const columns: Column<any>[] = [
    { key: "code", header: "Code", width: "150px", cell: (r, i) => <input disabled={!canEdit || Boolean(r.id)} className={cn(cell, "text-left")} value={r.code || ""} onChange={(e) => up(i, "code", e.target.value)} aria-label={`${name(r, i)}: code`} /> },
    {
      key: "name", header: "Name", className: "min-w-[270px]",
      cell: (r, i) => <input disabled={!canEdit} className={cn(cell, "text-left")} value={r.name || ""} onChange={(e) => up(i, "name", e.target.value)} aria-label={`Contribution ${i + 1}: name`} />,
      sub: (r) => r.description,
    },
    { key: "ee", header: "Employee (%)", width: "110px", cell: (r, i) => <input disabled={!canEdit} type="number" min={0} step={0.1} className={cell} value={r.employee_rate} onChange={(e) => up(i, "employee_rate", e.target.value)} aria-label={`${name(r, i)}: employee rate`} /> },
    { key: "er", header: "Employer (%)", width: "110px", cell: (r, i) => <input disabled={!canEdit} type="number" min={0} step={0.1} className={cell} value={r.employer_rate} onChange={(e) => up(i, "employer_rate", e.target.value)} aria-label={`${name(r, i)}: employer rate`} /> },
    {
      key: "base", header: "Calculated on", className: "min-w-[230px]",
      cell: (r, i) => <Select disabled={!canEdit} className="h-9" value={r.base} onChange={(e) => up(i, "base", e.target.value)} aria-label={`${name(r, i)}: calculated on`}>{Object.entries(CONTRIBUTION_BASES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</Select>,
    },
    { key: "cap", header: "Ceiling (RWF), 0 = none", width: "140px", cell: (r, i) => <input disabled={!canEdit} type="number" min={0} className={cell} value={r.cap_amount || 0} onChange={(e) => up(i, "cap_amount", e.target.value)} aria-label={`${name(r, i)}: ceiling, 0 for no ceiling`} /> },
    { key: "to", header: "Paid to", width: "110px", cell: (r, i) => <input disabled={!canEdit} className={cn(cell, "text-left")} value={r.remit_to || ""} onChange={(e) => up(i, "remit_to", e.target.value)} aria-label={`${name(r, i)}: paid to`} /> },
    { key: "active", header: "Active", width: "72px", align: "center", cell: (r, i) => <input disabled={!canEdit} type="checkbox" className={checkboxClass} checked={Boolean(r.active)} onChange={(e) => up(i, "active", e.target.checked)} aria-label={`${name(r, i)}: active`} /> },
  ];
  return (
    <Card padded={false} className="overflow-hidden">
      <div className="px-5 pt-5">
        <CardHeader title="Statutory contributions" subtitle="The employee part is deducted from the salary; the employer part is added to the cost of employment." />
      </div>
      <DataTable columns={columns} rows={rows} rowKey={(r, i) => r.id || `new-${i}`} minWidth={1180} caption="Statutory contributions" />
      {canEdit && (
        <div className="flex flex-wrap justify-between gap-3 border-t border-ims-divider px-5 py-4">
          <Button size="sm" icon={Plus} onClick={() => setRows((xs) => [...xs!, { code: "", name: "", employee_rate: 0, employer_rate: 0, base: "gross", cap_amount: 0, remit_to: "", active: true }])}>Add contribution</Button>
          <Button variant="primary" loading={busy} onClick={save}>Save contributions</Button>
        </div>
      )}
    </Card>
  );
}

function Options({ canEdit }: { canEdit: boolean }) {
  const queryClient = useQueryClient();
  const q = useQuery(["settings-record"], () => pocketbase.collection("settings").getList(1, 1).then((r) => r.items[0]));
  const [v, setV] = React.useState<any>(null);
  React.useEffect(() => {
    if (q.data) setV(q.data);
  }, [q.data]);
  if (!v) return null;
  async function save() {
    try {
      await pocketbase.collection("settings").update(v.id, { payroll_pension_deductible: Boolean(v.payroll_pension_deductible), payroll_employer_tin: v.payroll_employer_tin || "", payroll_rssb_number: v.payroll_rssb_number || "", payroll_bank_name: v.payroll_bank_name || "" });
      toast.success("Payroll options saved");
      queryClient.invalidateQueries(["settings-record"]);
    } catch (e) {
      toast.error(errorMessage(e));
    }
  }
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  return (
    <Card>
      <CardHeader title="Employer details and options" subtitle="Printed on payslips and on the RRA and RSSB schedules." />
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Field label="Employer TIN" htmlFor="po-tin"><Input id="po-tin" value={v.payroll_employer_tin || ""} onChange={set("payroll_employer_tin")} /></Field>
        <Field label="Employer RSSB number" htmlFor="po-rssb"><Input id="po-rssb" value={v.payroll_rssb_number || ""} onChange={set("payroll_rssb_number")} /></Field>
        <Field label="Paying bank" htmlFor="po-bank"><Input id="po-bank" value={v.payroll_bank_name || ""} onChange={set("payroll_bank_name")} /></Field>
        <Checkbox className="sm:col-span-3" label="Deduct the employee pension contribution before calculating PAYE" checked={Boolean(v.payroll_pension_deductible)} onChange={(c) => setV((x: any) => ({ ...x, payroll_pension_deductible: c }))} />
      </fieldset>
      {canEdit && <div className="mt-4 flex justify-end border-t border-ims-divider pt-4"><Button variant="primary" onClick={save}>Save</Button></div>}
    </Card>
  );
}

function Tester() {
  const [v, setV] = React.useState({ basic_salary: 500000, transport_allowance: 50000, housing_allowance: 0, employment_type: "permanent" });
  const q = useQuery(["tax-tester", v], () => payrollApi.preview(v), { keepPreviousData: true });
  const p = q.data;
  const lines: { key: string; label: string; detail?: string; amount: number | null; bold?: boolean }[] = p
    ? [
        { key: "gross", label: "Gross", amount: p.gross, bold: true },
        { key: "paye", label: "PAYE", detail: (p.paye_breakdown || []).map((b: any) => `${b.rate}% × ${fmtNumber(b.amount)}`).join(" + "), amount: -p.paye },
        ...(p.contributions || []).map((c: any) => ({ key: c.code, label: c.name, detail: `Base ${fmtNumber(c.base)} · employer ${fmtNumber(c.er)}`, amount: c.ee ? -c.ee : null })),
      ]
    : [];
  return (
    <Card>
      <CardHeader title="Check a salary" subtitle="Test the settings on any salary. Nothing is saved." />
      <div className="grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid h-fit grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Basic salary" htmlFor="tt-basic"><MoneyInput id="tt-basic" value={v.basic_salary} onChange={(n) => setV((x) => ({ ...x, basic_salary: Number(n) }))} /></Field>
          <Field label="Transport allowance" htmlFor="tt-transport"><MoneyInput id="tt-transport" value={v.transport_allowance} onChange={(n) => setV((x) => ({ ...x, transport_allowance: Number(n) }))} /></Field>
          <Field label="Housing allowance" htmlFor="tt-housing"><MoneyInput id="tt-housing" value={v.housing_allowance} onChange={(n) => setV((x) => ({ ...x, housing_allowance: Number(n) }))} /></Field>
          <Field label="Type" htmlFor="tt-type"><Select id="tt-type" value={v.employment_type} onChange={(e) => setV((x) => ({ ...x, employment_type: e.target.value }))}><option value="permanent">Employee</option><option value="casual">Casual worker</option></Select></Field>
        </div>
        {p && (
          <div className="min-w-0 overflow-hidden rounded-card border border-ims-border">
            <DataTable
              minWidth={0}
              rows={lines}
              rowKey={(x) => x.key}
              caption="Payslip of the tested salary"
              rowClassName={(x) => (x.bold ? "font-semibold" : undefined)}
              totalLabel="Net pay"
              columns={[
                { key: "label", header: "Line", cell: (x) => x.label, sub: (x) => x.detail },
                { key: "amount", header: "Amount (RWF)", numeric: true, cell: (x) => (x.amount === null ? <span className="text-ims-faint">—</span> : <Num value={x.amount} />), total: <Num value={p.net} /> },
              ]}
            />
            <p className="flex justify-between gap-3 border-t border-ims-divider px-3.5 py-3 text-t-body text-ims-body">
              <span>Total cost to the employer</span>
              <span className="font-semibold tabular-nums text-ims-text">{fmtMoney(p.employer_cost)}</span>
            </p>
          </div>
        )}
      </div>
    </Card>
  );
}
