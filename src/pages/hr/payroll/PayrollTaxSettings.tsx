import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Calculator, Landmark, Plus, Percent, Trash2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Panel } from "@/components/enterprise/ui";
import { errorMessage } from "@/lib/procurement";
import { CONTRIBUTION_BASES, payrollApi, rwf } from "@/lib/hr";
import { Field, inputCls } from "@/components/portal/kit";
import { cn } from "@/utils";

const cell = "h-9 w-full rounded-md border border-slate-200 px-2 text-right text-[13px] tabular-nums focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:bg-slate-50";

export default function PayrollTaxSettings() {
  const { canPerform } = useRoles();
  const canEdit = canPerform("manage_payroll_settings");
  return (
    <div className="space-y-4">
      <p className="rounded-lg border border-sky-100 bg-sky-50 px-3.5 py-2.5 text-[12.5px] text-sky-900">
        Pre-filled with the Rwanda rates in force when the system was set up (PAYE per Law N° 027/2022 on income tax; RSSB pension 6% + 6%, maternity 0.3% + 0.3%, occupational hazards 2% employer, CBHI 0.5% of net salary). Check them against the latest RRA and RSSB notices before each financial year — every rate here can be changed without development, and each payroll keeps the rates it was calculated with.
        {!canEdit && " Changing them requires the “Configure PAYE bands and statutory contributions” permission."}
      </p>
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
  return (
    <Panel title={<span className="flex items-center gap-2"><Percent size={16} className="text-slate-400" /> PAYE tax bands (monthly taxable income)</span>} subtitle="Progressive: each rate applies only to the part of the income inside its band.">
      <div className="grid gap-4 lg:grid-cols-2">
        {(["regular", "casual"] as const).map((t) => (
          <div key={t}>
            <p className="mb-2 text-[13px] font-semibold">{t === "regular" ? "Employees" : "Casual workers"}</p>
            <table className="w-full text-[13px]">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-slate-500"><th className="pb-1">From (RWF)</th><th className="pb-1">To (0 = no limit)</th><th className="pb-1">Rate %</th><th /></tr></thead>
              <tbody>
                {rows.map((r, i) => r.employment_type !== t ? null : (
                  <tr key={r.id || `new-${i}`}>
                    <td className="py-1 pr-2"><input disabled={!canEdit} type="number" min={0} className={cell} value={r.min_amount} onChange={(e) => up(i, "min_amount", e.target.value)} /></td>
                    <td className="py-1 pr-2"><input disabled={!canEdit} type="number" min={0} className={cell} value={r.max_amount} onChange={(e) => up(i, "max_amount", e.target.value)} /></td>
                    <td className="py-1 pr-2"><input disabled={!canEdit} type="number" min={0} max={100} step={0.5} className={cell} value={r.rate} onChange={(e) => up(i, "rate", e.target.value)} /></td>
                    <td className="py-1">{canEdit && <button type="button" onClick={() => { if (r.id) setRemoved((x) => [...x, r.id]); setRows((xs) => xs!.filter((_, j) => j !== i)); }} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label="Remove band"><Trash2 size={14} /></button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {canEdit && <Button size="sm" variant="outline" className="mt-2" onClick={() => setRows((xs) => [...xs!, { employment_type: t, min_amount: 0, max_amount: 0, rate: 0, active: true }])}><Plus size={14} /> Add band</Button>}
          </div>
        ))}
      </div>
      {canEdit && <div className="mt-4 flex justify-end"><Button disabled={busy} onClick={save}>Save bands</Button></div>}
    </Panel>
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
  return (
    <Panel title={<span className="flex items-center gap-2"><Landmark size={16} className="text-slate-400" /> Statutory contributions</span>} subtitle="Employee part is deducted from the salary; employer part is added to the cost of employment." bodyClassName="px-0">
      <div className="overflow-x-auto">
        <table className="dnr-grid w-full min-w-[980px] text-[13px]">
          <thead><tr className="border-y border-slate-100 bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500"><th className="px-3 py-2">Code</th><th className="px-3 py-2">Name</th><th className="w-24 px-3 py-2">Employee %</th><th className="w-24 px-3 py-2">Employer %</th><th className="px-3 py-2">Calculated on</th><th className="w-28 px-3 py-2">Ceiling</th><th className="w-24 px-3 py-2">Paid to</th><th className="px-3 py-2">Active</th></tr></thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((r, i) => (
              <tr key={r.id || `new-${i}`}>
                <td className="px-3 py-1.5"><input disabled={!canEdit || Boolean(r.id)} className={cn(cell, "text-left uppercase")} value={r.code || ""} onChange={(e) => up(i, "code", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input disabled={!canEdit} className={cn(cell, "text-left")} value={r.name || ""} onChange={(e) => up(i, "name", e.target.value)} /><p className="mt-0.5 text-[11px] text-slate-500">{r.description}</p></td>
                <td className="px-3 py-1.5"><input disabled={!canEdit} type="number" min={0} step={0.1} className={cell} value={r.employee_rate} onChange={(e) => up(i, "employee_rate", e.target.value)} /></td>
                <td className="px-3 py-1.5"><input disabled={!canEdit} type="number" min={0} step={0.1} className={cell} value={r.employer_rate} onChange={(e) => up(i, "employer_rate", e.target.value)} /></td>
                <td className="px-3 py-1.5"><select disabled={!canEdit} className={cn(cell, "text-left")} value={r.base} onChange={(e) => up(i, "base", e.target.value)}>{Object.entries(CONTRIBUTION_BASES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></td>
                <td className="px-3 py-1.5"><input disabled={!canEdit} type="number" min={0} className={cell} value={r.cap_amount || 0} onChange={(e) => up(i, "cap_amount", e.target.value)} title="0 = no ceiling" /></td>
                <td className="px-3 py-1.5"><input disabled={!canEdit} className={cn(cell, "text-left")} value={r.remit_to || ""} onChange={(e) => up(i, "remit_to", e.target.value)} /></td>
                <td className="px-3 py-1.5 text-center"><input disabled={!canEdit} type="checkbox" className="h-4 w-4" checked={Boolean(r.active)} onChange={(e) => up(i, "active", e.target.checked)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canEdit && (
        <div className="flex justify-between px-4 pt-3">
          <Button size="sm" variant="outline" onClick={() => setRows((xs) => [...xs!, { code: "", name: "", employee_rate: 0, employer_rate: 0, base: "gross", cap_amount: 0, remit_to: "", active: true }])}><Plus size={14} /> Add contribution</Button>
          <Button disabled={busy} onClick={save}>Save contributions</Button>
        </div>
      )}
    </Panel>
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
    <Panel title="Employer details and options">
      <fieldset disabled={!canEdit} className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Employer TIN"><input className={inputCls} value={v.payroll_employer_tin || ""} onChange={set("payroll_employer_tin")} /></Field>
        <Field label="Employer RSSB number"><input className={inputCls} value={v.payroll_rssb_number || ""} onChange={set("payroll_rssb_number")} /></Field>
        <Field label="Paying bank"><input className={inputCls} value={v.payroll_bank_name || ""} onChange={set("payroll_bank_name")} /></Field>
        <label className="flex items-center gap-2 text-[13px] sm:col-span-3"><input type="checkbox" className="h-4 w-4" checked={Boolean(v.payroll_pension_deductible)} onChange={set("payroll_pension_deductible")} /> Deduct the employee pension contribution before calculating PAYE</label>
      </fieldset>
      {canEdit && <div className="mt-3 flex justify-end"><Button onClick={save}>Save</Button></div>}
    </Panel>
  );
}

function Tester() {
  const [v, setV] = React.useState({ basic_salary: 500000, transport_allowance: 50000, housing_allowance: 0, employment_type: "permanent" });
  const q = useQuery(["tax-tester", v], () => payrollApi.preview(v), { keepPreviousData: true });
  const p = q.data;
  return (
    <Panel title={<span className="flex items-center gap-2"><Calculator size={16} className="text-slate-400" /> Check a salary</span>} subtitle="Test the settings on any salary">
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Basic salary"><input type="number" className={inputCls} value={v.basic_salary} onChange={(e) => setV((x) => ({ ...x, basic_salary: Number(e.target.value) }))} /></Field>
          <Field label="Transport allowance"><input type="number" className={inputCls} value={v.transport_allowance} onChange={(e) => setV((x) => ({ ...x, transport_allowance: Number(e.target.value) }))} /></Field>
          <Field label="Housing allowance"><input type="number" className={inputCls} value={v.housing_allowance} onChange={(e) => setV((x) => ({ ...x, housing_allowance: Number(e.target.value) }))} /></Field>
          <Field label="Type"><select className={inputCls} value={v.employment_type} onChange={(e) => setV((x) => ({ ...x, employment_type: e.target.value }))}><option value="permanent">Employee</option><option value="casual">Casual worker</option></select></Field>
        </div>
        {p && (
          <table className="w-full text-[13px]">
            <tbody className="divide-y divide-slate-100">
              <tr className="font-semibold"><td className="py-1">Gross</td><td className="py-1 text-right tabular-nums">{rwf(p.gross)}</td></tr>
              <tr><td className="py-1">PAYE<span className="block text-[11px] text-slate-500">{(p.paye_breakdown || []).map((b: any) => `${b.rate}% × ${rwf(b.amount)}`).join(" + ")}</span></td><td className="py-1 text-right tabular-nums">−{rwf(p.paye)}</td></tr>
              {(p.contributions || []).map((c: any) => (
                <tr key={c.code}><td className="py-1">{c.name}<span className="block text-[11px] text-slate-500">base {rwf(c.base)} · employer {rwf(c.er)}</span></td><td className="py-1 text-right tabular-nums">{c.ee ? `−${rwf(c.ee)}` : "—"}</td></tr>
              ))}
              <tr className="text-[14px] font-bold"><td className="py-1.5">Net pay</td><td className="py-1.5 text-right tabular-nums">{rwf(p.net)}</td></tr>
              <tr className="text-slate-600"><td className="py-1">Total cost to employer</td><td className="py-1 text-right tabular-nums">{rwf(p.employer_cost)}</td></tr>
            </tbody>
          </table>
        )}
      </div>
    </Panel>
  );
}
