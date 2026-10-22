import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { errorMessage } from "@/lib/procurement";
import { EMPLOYMENT_TYPES, payrollApi } from "@/lib/hr";
import TableTools from "@/components/enterprise/TableTools";
import { IMPORTS } from "@/lib/importConfigs";
import {
  Button,
  Card,
  Checkbox,
  Column,
  DataTable,
  EmptyState,
  Field,
  Input,
  KpiBand,
  Modal,
  ModalSection,
  MoneyInput,
  Num,
  Page,
  PageHeader,
  SearchBox,
  Select,
  StatusPill,
  fmtMoney,
  fmtMoneyShort,
  fmtNumber,
} from "@/components/ims";
import { cn } from "@/utils";

const sentenceType = (t?: string) => EMPLOYMENT_TYPES.find((x) => x.value === t)?.label || (t ? t.charAt(0).toUpperCase() + t.slice(1) : "");

export default function SalaryStructures() {
  const { canPerform } = useRoles();
  const canEdit = canPerform("manage_salaries");
  const [search, setSearch] = React.useState("");
  const [editing, setEditing] = React.useState<{ user: any; structure: any } | null>(null);
  const q = useQuery(["salary-structures"], async () => {
    const [users, structures] = await Promise.all([
      pocketbase.collection("users").getFullList({ filter: 'status = "Active"', sort: "name", expand: "department,designation", fields: "id,name,email,salary,employment_type,bank_name,bank_account_number,expand" }),
      pocketbase.collection("salary_structures").getFullList(),
    ]);
    const byEmp = new Map(structures.map((s: any) => [s.employee, s]));
    return users.map((u: any) => ({ user: u, structure: byEmp.get(u.id) || null }));
  });
  const rows = (q.data || []).filter((r) => `${r.user.name} ${r.user.expand?.department?.name || ""}`.toLowerCase().includes(search.trim().toLowerCase()));
  const fundsQ = useQuery(["funding-sources-codes"], () => pocketbase.collection("funding_sources").getFullList({ fields: "id,code" }), { staleTime: 600_000 });
  const funds: Record<string, string> = Object.fromEntries(((fundsQ.data || []) as any[]).map((x) => [x.id, x.code]));
  const gross = (s: any) => (s ? s.basic_salary + s.transport_allowance + s.housing_allowance + s.communication_allowance + (s.other_allowances || []).reduce((a: number, x: any) => a + (Number(x.amount) || 0), 0) : 0);
  const otherOf = (s: any) => (s.other_allowances || []).reduce((a: number, x: any) => a + (Number(x.amount) || 0), 0);
  const withS = (q.data || []).filter((r) => r.structure?.active);
  const shownS = rows.filter((r) => r.structure).map((r) => r.structure);
  const total = (f: (s: any) => number) => <Num value={shownS.reduce((a, s) => a + (Number(f(s)) || 0), 0)} />;
  const money = (key: string, header: string, f: (s: any) => number, bold?: boolean): Column<any> => ({
    key, header, numeric: true, total: total(f),
    cell: ({ structure: s }) => (s ? <span className={cn(bold && "font-semibold")}><Num value={f(s)} /></span> : <span className="text-ims-faint">—</span>),
  });

  const columns: Column<any>[] = [
    {
      key: "employee", header: "Employee", className: "min-w-[250px] max-w-[300px]",
      cell: ({ user: u, structure: s }) => {
        const detail = `${u.expand?.department?.name || ""}${u.expand?.designation?.name ? ` · ${u.expand.designation.name}` : ""}`;
        return (
          <span className="block min-w-0">
            <span className="flex items-center gap-1.5">
              <span className="truncate font-semibold text-ims-text">{u.name}</span>
              {s?.grade && <span className="shrink-0 rounded bg-ims-subtle px-1.5 py-px font-mono text-t-hint text-ims-body">{s.grade}</span>}
            </span>
            <span className="line-clamp-1 text-t-small text-ims-muted" title={detail}>{detail}</span>
          </span>
        );
      },
      sub: ({ structure: s }) => ((s?.funding_split || []).length > 0 ? `Funded: ${(s.funding_split as any[]).map((x) => `${funds[x.funding_source] || "?"} ${x.percent}%`).join(" · ")}` : null),
    },
    {
      key: "type", header: "Type", className: "min-w-[130px] max-w-[200px]",
      cell: ({ structure: s }) =>
        s ? sentenceType(s.employment_type) : <span className="font-semibold text-ims-warning">No salary structure</span>,
      sub: ({ user: u, structure: s }) =>
        s ? (!s.active ? <StatusPill status="Inactive" /> : null) : u.salary ? `Profile salary ${fmtMoney(Number(u.salary))} is used as basic salary` : "Not included in payroll",
    },
    money("gross", "Gross (RWF)", gross, true),
    money("basic", "Basic (RWF)", (s) => s.basic_salary),
    money("transport", "Transport (RWF)", (s) => s.transport_allowance),
    money("housing", "Housing (RWF)", (s) => s.housing_allowance),
    money("communication", "Communication (RWF)", (s) => s.communication_allowance),
    money("other", "Other (RWF)", otherOf),
    {
      key: "bank", header: "Bank", className: "min-w-[150px]",
      cell: ({ structure: s }) => (s ? s.bank_name || <span className="font-semibold text-ims-danger">Missing</span> : <span className="text-ims-faint">—</span>),
      sub: ({ structure: s }) => (s?.bank_account ? <span className="tabular-nums">{s.bank_account}</span> : null),
    },
    { key: "rssb", header: "RSSB number", nowrap: true, cell: ({ structure: s }) => (s ? s.rssb_number || <span className="text-ims-warning">—</span> : <span className="text-ims-faint">—</span>) },
  ];

  const edit = (r: any) => setEditing({ user: r.user, structure: r.structure });

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "HR & payroll" }, { label: "Payroll", to: "/dashboard/hr/payroll" }, { label: "Salary structures" }]}
        title="Salary structures"
        subtitle="Basic salary, allowances and recurring deductions of each employee: the input of every payroll."
        actions={
          <TableTools
            importConfig={IMPORTS.salaryStructures}
            exportConfig={{
              title: "Salary structures", fileName: "salary-structures", what: "salary_structures", orientation: "landscape", permission: ["manage_salaries", "export_payroll"],
              rows: async () => (q.data || []).filter((r) => r.structure),
              totals: ["Basic salary", "Transport", "Housing", "Communication", "Gross"],
              columns: [
                { header: "Employee", value: (r: any) => r.user.name, width: 26 },
                { header: "Department", value: (r: any) => r.user.expand?.department?.name || "", width: 24 },
                { header: "Type", value: (r: any) => r.structure.employment_type || "" },
                { header: "Basic salary", value: (r: any) => r.structure.basic_salary || 0, format: "money" },
                { header: "Transport", value: (r: any) => r.structure.transport_allowance || 0, format: "money" },
                { header: "Housing", value: (r: any) => r.structure.housing_allowance || 0, format: "money" },
                { header: "Communication", value: (r: any) => r.structure.communication_allowance || 0, format: "money" },
                { header: "Gross", value: (r: any) => gross(r.structure), format: "money" },
                { header: "Paid by", value: (r: any) => r.structure.payment_method || "" },
                { header: "Grade", value: (r: any) => r.structure.grade || "" },
                { header: "Funding", value: (r: any) => (r.structure.funding_split || []).map((x: any) => `${funds[x.funding_source] || "?"} ${x.percent}%`).join(", ") || "Member contributions", width: 22 },
              ],
            }}
          />
        }
      />
      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Active employees", value: fmtNumber((q.data || []).length) },
          { label: "In the payroll", value: fmtNumber(withS.length), sub: "With an active salary structure", tone: withS.length < (q.data || []).length ? "warning" : "success" },
          { label: "Gross salary bill per month", value: fmtMoneyShort(withS.reduce((a, r) => a + gross(r.structure), 0)) },
          { label: "Missing bank details", value: fmtNumber(withS.filter((r) => !r.structure.bank_account).length), tone: withS.some((r) => !r.structure.bank_account) ? "warning" : "default" },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <div className="px-4 py-3.5 sm:px-5">
          <SearchBox value={search} onChange={setSearch} placeholder="Search employee or department" />
        </div>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.user.id}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          onRowClick={canEdit ? edit : undefined}
          rowActions={canEdit ? (r) => [{ label: r.structure ? "Edit salary" : "Add a salary structure", icon: r.structure ? Pencil : Plus, onSelect: edit }] : undefined}
          minWidth={1240}
          caption="Salary structures"
          empty={<EmptyState icon={Users} text={search ? "No employee matches this search." : "No active employees yet."} />}
        />
      </Card>
      {editing && <StructureDialog user={editing.user} structure={editing.structure} onClose={() => setEditing(null)} />}
    </Page>
  );
}

function StructureDialog({ user, structure, onClose }: { user: any; structure: any; onClose: () => void }) {
  const queryClient = useQueryClient();
  const init = structure || { employment_type: user.employment_type || "permanent", basic_salary: Number(user.salary) || 0, transport_allowance: 0, housing_allowance: 0, communication_allowance: 0, other_allowances: [], recurring_deductions: [], payment_method: "bank", bank_name: user.bank_name || "", bank_account: user.bank_account_number || "", active: true };
  const [v, setV] = React.useState<any>({ ...init, other_allowances: init.other_allowances || [], recurring_deductions: init.recurring_deductions || [], funding_split: init.funding_split || [], grade: init.grade || "" });
  const ref = useQuery(["salary-funding-ref"], async () => ({
    funds: await pocketbase.collection("funding_sources").getFullList({ filter: "active = true", sort: "code", fields: "id,code,name,type" }),
    projects: await pocketbase.collection("projects").getFullList({ sort: "code", fields: "id,code,name,funding_source,status" }),
  }), { staleTime: 600_000 });
  const split = (v.funding_split || []) as { funding_source: string; project: string; percent: number }[];
  const splitTotal = Math.round(split.reduce((a, x) => a + (Number(x.percent) || 0), 0) * 100) / 100;
  const setSplit = (i: number, patch: Record<string, unknown>) => setV((x: any) => ({ ...x, funding_split: x.funding_split.map((y: any, j: number) => (j === i ? { ...y, ...patch } : y)) }));
  const preview = useQuery(["salary-preview", JSON.stringify(v)], () => payrollApi.preview(v), { keepPreviousData: true, enabled: Number(v.basic_salary) > 0 });
  const save = useMutation(
    () => {
      const data = { ...v, employee: user.id, basic_salary: Number(v.basic_salary) || 0, transport_allowance: Number(v.transport_allowance) || 0, housing_allowance: Number(v.housing_allowance) || 0, communication_allowance: Number(v.communication_allowance) || 0, funding_split: split.filter((x) => x.funding_source).map((x) => ({ ...x, percent: Number(x.percent) || 0 })) };
      return structure ? pocketbase.collection("salary_structures").update(structure.id, data) : pocketbase.collection("salary_structures").create(data);
    },
    {
      onSuccess: () => {
        toast.success(`Salary structure of ${user.name} saved`);
        queryClient.invalidateQueries(["salary-structures"]);
        onClose();
      },
      onError: (e) => {
        toast.error(errorMessage(e));
      },
    }
  );
  const set = (k: string) => (e: any) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value }));
  const setMoney = (k: string) => (n: number | "") => setV((x: any) => ({ ...x, [k]: n }));
  const list = (key: "other_allowances" | "recurring_deductions", noun: string) => (
    <div className="space-y-3">
      {v[key].map((a: any, i: number) => (
        <div key={i} className="space-y-2">
          <div className="grid grid-cols-[minmax(0,1fr)_150px_auto] items-center gap-2">
            <Input value={a.name} placeholder="Name" aria-label={`${noun} ${i + 1}: name`} onChange={(e) => setV((x: any) => ({ ...x, [key]: x[key].map((y: any, j: number) => (j === i ? { ...y, name: e.target.value } : y)) }))} />
            <span>
              <label htmlFor={`ss-${key}-${i}`} className="sr-only">{`${noun} ${i + 1}: amount`}</label>
              <MoneyInput id={`ss-${key}-${i}`} value={a.amount} onChange={(n) => setV((x: any) => ({ ...x, [key]: x[key].map((y: any, j: number) => (j === i ? { ...y, amount: Number(n) } : y)) }))} />
            </span>
            <Button variant="ghost" size="icon" icon={Trash2} aria-label={`Remove ${noun.toLowerCase()} ${i + 1}`} onClick={() => setV((x: any) => ({ ...x, [key]: x[key].filter((_: any, j: number) => j !== i) }))} />
          </div>
          {key === "other_allowances" && (
            <div className="flex flex-wrap gap-x-5 gap-y-2 pl-1">
              <Checkbox label="Taxable (PAYE)" checked={a.taxable !== false} onChange={(c) => setV((x: any) => ({ ...x, [key]: x[key].map((y: any, j: number) => (j === i ? { ...y, taxable: c } : y)) }))} />
              <Checkbox label="Subject to RSSB" checked={a.pensionable !== false} onChange={(c) => setV((x: any) => ({ ...x, [key]: x[key].map((y: any, j: number) => (j === i ? { ...y, pensionable: c } : y)) }))} />
            </div>
          )}
        </div>
      ))}
      <Button size="sm" icon={Plus} onClick={() => setV((x: any) => ({ ...x, [key]: [...x[key], { name: "", amount: 0, taxable: true, pensionable: true }] }))}>Add {noun.toLowerCase()}</Button>
    </div>
  );
  const p = preview.data;
  const splitBad = split.length > 0 && splitTotal !== 100;
  return (
    <Modal
      open
      onClose={onClose}
      size="xl"
      title={`Salary of ${user.name}`}
      description="Monthly amounts in RWF. The payslip preview uses the current tax settings."
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" loading={save.isLoading} disabled={!(Number(v.basic_salary) > 0) || splitBad} onClick={() => save.mutate()}>Save</Button>
        </>
      }
    >
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="min-w-0 space-y-4">
          <ModalSection title="Pay">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Employment type" htmlFor="ss-type">
                <Select id="ss-type" value={v.employment_type} onChange={set("employment_type")}>{EMPLOYMENT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}</Select>
              </Field>
              <Field label="Grade" htmlFor="ss-grade" hint="Salary scale grade, e.g. M1, P3, S2">
                <Input id="ss-grade" className="font-mono" value={v.grade} maxLength={30} list="salary-grades" onChange={(e) => setV((x: any) => ({ ...x, grade: e.target.value.toUpperCase() }))} />
                <datalist id="salary-grades">{["E1", "E2", "M1", "M2", "P1", "P2", "P3", "P4", "S1", "S2", "S3"].map((g) => <option key={g} value={g} />)}</datalist>
              </Field>
              <Field label="Basic salary" required htmlFor="ss-basic" hint={!(Number(v.basic_salary) > 0) ? "Enter a basic salary above 0 to save." : undefined}>
                <MoneyInput id="ss-basic" value={v.basic_salary === "" ? "" : Number(v.basic_salary)} onChange={setMoney("basic_salary")} />
              </Field>
              <Field label="Transport allowance" htmlFor="ss-transport" hint="Not subject to RSSB pension">
                <MoneyInput id="ss-transport" value={v.transport_allowance === "" ? "" : Number(v.transport_allowance)} onChange={setMoney("transport_allowance")} />
              </Field>
              <Field label="Housing allowance" htmlFor="ss-housing">
                <MoneyInput id="ss-housing" value={v.housing_allowance === "" ? "" : Number(v.housing_allowance)} onChange={setMoney("housing_allowance")} />
              </Field>
              <Field label="Communication allowance" htmlFor="ss-communication">
                <MoneyInput id="ss-communication" value={v.communication_allowance === "" ? "" : Number(v.communication_allowance)} onChange={setMoney("communication_allowance")} />
              </Field>
            </div>
            <Checkbox label="Include in payroll" checked={Boolean(v.active)} onChange={(c) => setV((x: any) => ({ ...x, active: c }))} />
          </ModalSection>
          <ModalSection title="Other allowances">{list("other_allowances", "Allowance")}</ModalSection>
          <ModalSection title="Recurring deductions" description="For example staff savings, loan repayment, union fees.">{list("recurring_deductions", "Deduction")}</ModalSection>
          <ModalSection title="Bank and statutory numbers">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Bank" htmlFor="ss-bank"><Input id="ss-bank" value={v.bank_name || ""} onChange={set("bank_name")} /></Field>
              <Field label="Account number" htmlFor="ss-account"><Input id="ss-account" value={v.bank_account || ""} onChange={set("bank_account")} /></Field>
              <Field label="RSSB number" htmlFor="ss-rssb"><Input id="ss-rssb" value={v.rssb_number || ""} onChange={set("rssb_number")} /></Field>
              <Field label="TIN" htmlFor="ss-tin"><Input id="ss-tin" value={v.tin || ""} onChange={set("tin")} /></Field>
            </div>
          </ModalSection>
          <ModalSection title="Funding of this salary" description="For donor-funded staff: the share each funding source (and project) pays. The payroll charges the salary to those budget lines. Leave it empty to charge it all to member contributions.">
            <div className="space-y-2">
              {split.map((x, i) => {
                const projects = ((ref.data?.projects || []) as any[]).filter((p) => !x.funding_source || p.funding_source === x.funding_source);
                return (
                  <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_96px_auto]">
                    <Select aria-label={`Funding source ${i + 1}`} value={x.funding_source} onChange={(e) => setSplit(i, { funding_source: e.target.value, project: "" })}>
                      <option value="">Choose a funding source</option>
                      {((ref.data?.funds || []) as any[]).map((f) => <option key={f.id} value={f.id}>{f.code} · {f.name}</option>)}
                    </Select>
                    <Select aria-label={`Project ${i + 1}`} className="col-start-1 sm:col-start-auto" value={x.project} onChange={(e) => setSplit(i, { project: e.target.value })}>
                      <option value="">No project</option>
                      {projects.map((p) => <option key={p.id} value={p.id}>{p.code} · {p.name}</option>)}
                    </Select>
                    <span className="relative block">
                      <Input aria-label={`Percentage ${i + 1}`} type="number" min={0} max={100} className="pr-7 text-right tabular-nums" value={x.percent} onChange={(e) => setSplit(i, { percent: Number(e.target.value) })} />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-t-small text-ims-muted">%</span>
                    </span>
                    <Button variant="ghost" size="icon" icon={Trash2} aria-label={`Remove funding source ${i + 1}`} className="row-start-1 col-start-2 sm:row-start-auto sm:col-start-auto" onClick={() => setV((y: any) => ({ ...y, funding_split: y.funding_split.filter((_: any, j: number) => j !== i) }))} />
                  </div>
                );
              })}
              <div className="flex flex-wrap items-center gap-3">
                <Button size="sm" icon={Plus} onClick={() => setV((x: any) => ({ ...x, funding_split: [...(x.funding_split || []), { funding_source: "", project: "", percent: Math.max(0, 100 - splitTotal) }] }))}>Add a funding source</Button>
                {split.length > 0 && <span role={splitBad ? "alert" : undefined} className={cn("text-t-small font-semibold", splitBad ? "text-ims-danger" : "text-ims-success")}>Total {splitTotal}%{splitBad ? ". The shares must add up to 100%." : ""}</span>}
              </div>
            </div>
          </ModalSection>
        </div>
        <aside className="h-fit rounded-card border border-ims-border bg-ims-thead p-4 text-t-body lg:sticky lg:top-0">
          <h3 className="mb-2 text-t-body font-bold text-ims-text">Payslip preview</h3>
          {!p ? <p className="text-ims-muted">Enter a basic salary.</p> : (
            <dl className="space-y-1.5">
              {[["Gross", p.gross, true], ["PAYE", -p.paye], ["Pension (employee)", -p.pension_ee], ["Maternity (employee)", -p.maternity_ee], ["CBHI", -p.cbhi], ...(p.medical_ee ? [["Medical", -p.medical_ee]] : []), ...(p.other_deductions?.length ? [["Other deductions", -p.other_deductions.reduce((a: number, d: any) => a + d.amount, 0)]] : [])].map(([k, n, b]: any) => (
                <div key={k} className={cn("flex justify-between gap-3", b && "font-semibold")}><dt className={cn(!b && "text-ims-body")}>{k}</dt><dd className="tabular-nums">{fmtNumber(n)}</dd></div>
              ))}
              <div className="flex justify-between gap-3 border-t border-ims-field pt-1.5 font-bold"><dt>Net pay</dt><dd className="tabular-nums">{fmtMoney(p.net)}</dd></div>
              <div className="flex justify-between gap-3 pt-2 text-ims-body"><dt>Employer contributions</dt><dd className="tabular-nums">{fmtNumber(p.employer_cost - p.gross)}</dd></div>
              <div className="flex justify-between gap-3 font-semibold"><dt>Total cost</dt><dd className="tabular-nums">{fmtMoney(p.employer_cost)}</dd></div>
            </dl>
          )}
        </aside>
      </div>
    </Modal>
  );
}
