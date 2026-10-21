/**
 * Setup → Chart of accounts: hierarchical tree (header / posting accounts), filters by type,
 * search, export, and create / edit for Finance (DAF). The server validates the hierarchy and
 * freezes code, type and posting flag once an account has postings.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FolderTree, ListTree, Pencil, Plus, Search, Settings2 } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, MetricGroup, PageHeader } from "@/components/enterprise/ui";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ImportButton } from "@/components/enterprise/ExcelImport";
import { IMPORTS } from "@/lib/importConfigs";
import { Field, FormBlock, FormDialog, inputCls, textareaCls } from "@/components/portal/kit";
import { cn } from "@/utils";

const TYPES = [
  { value: "asset", label: "Assets", tone: "info" as const },
  { value: "liability", label: "Liabilities", tone: "warning" as const },
  { value: "net_assets", label: "Net assets", tone: "violet" as const },
  { value: "revenue", label: "Revenue", tone: "success" as const },
  { value: "expense", label: "Expenses", tone: "danger" as const },
];
const SECTIONS: Record<string, string> = {
  current_assets: "Current assets", non_current_assets: "Non-current assets", current_liabilities: "Current liabilities",
  non_current_liabilities: "Non-current liabilities", net_assets: "Net assets", revenue_exchange: "Revenue — exchange",
  revenue_non_exchange: "Revenue — non-exchange", expenses: "Expenses",
};
const CASH_FLOW: Record<string, string> = { cash: "Cash and cash equivalents", operating: "Operating", investing: "Investing", financing: "Financing", none: "Non-cash" };

interface Account {
  id: string;
  code: string;
  name: string;
  type: string;
  parent: string;
  is_posting: boolean;
  normal_balance: string;
  level: number;
  statement_section: string;
  cash_flow_class: string;
  is_control: boolean;
  active: boolean;
  description: string;
}

export default function ChartOfAccounts() {
  const { can } = usePermissions();
  const canManage = can("manage_chart_of_accounts");
  const queryClient = useQueryClient();
  const q = useQuery(["gl-accounts"], () => pocketbase.collection("gl_accounts").getFullList<Account>({ sort: "code", batch: 1000 }));
  const [type, setType] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [showInactive, setShowInactive] = React.useState(false);
  const [collapsed, setCollapsed] = React.useState<Record<string, boolean>>({});
  const [editing, setEditing] = React.useState<Partial<Account> | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [tried, setTried] = React.useState(false);

  const accounts = q.data || [];
  const byId = React.useMemo(() => Object.fromEntries(accounts.map((a) => [a.id, a])), [accounts]);
  const children = React.useMemo(() => {
    const m: Record<string, Account[]> = {};
    for (const a of accounts) (m[a.parent || "root"] = m[a.parent || "root"] || []).push(a);
    return m;
  }, [accounts]);

  const term = search.trim().toLowerCase();
  const matches = (a: Account) => (!term || `${a.code} ${a.name}`.toLowerCase().includes(term)) && (type === "all" || a.type === type) && (showInactive || a.active);
  // Keep a header visible when any descendant matches.
  const visibleIds = React.useMemo(() => {
    const keep = new Set<string>();
    for (const a of accounts) {
      if (!matches(a)) continue;
      let cur: Account | undefined = a;
      while (cur) {
        keep.add(cur.id);
        cur = cur.parent ? byId[cur.parent] : undefined;
      }
    }
    return keep;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accounts, term, type, showInactive, byId]);

  const rows: { a: Account; depth: number }[] = [];
  const walk = (parent: string, depth: number) => {
    for (const a of children[parent] || []) {
      if (!visibleIds.has(a.id)) continue;
      rows.push({ a, depth });
      if (!collapsed[a.id] || term) walk(a.id, depth + 1);
    }
  };
  walk("root", 0);

  const posting = accounts.filter((a) => a.is_posting && a.active).length;
  const counts = Object.fromEntries(TYPES.map((t) => [t.value, accounts.filter((a) => a.type === t.value && a.is_posting).length]));

  const open = (a?: Account, parent?: Account) => {
    setTried(false);
    if (a) return setEditing({ ...a });
    setEditing({
      code: parent ? `${parent.code}` : "", name: "", type: parent?.type || "expense", parent: parent?.id || "", is_posting: true,
      statement_section: parent?.statement_section || "", cash_flow_class: parent?.cash_flow_class || "", is_control: false, active: true, description: "",
    });
  };

  async function save() {
    if (!editing) return;
    setTried(true);
    if (!editing.code?.trim() || !editing.name?.trim() || !editing.type) return toast.error("Code, name and type are required.");
    setBusy(true);
    const data = {
      code: editing.code.trim(), name: editing.name.trim(), type: editing.type, parent: editing.parent || "", is_posting: Boolean(editing.is_posting),
      statement_section: editing.statement_section || "", cash_flow_class: editing.cash_flow_class || "", is_control: Boolean(editing.is_control),
      active: Boolean(editing.active), description: editing.description || "", normal_balance: editing.normal_balance || "",
    };
    try {
      if (editing.id) await pocketbase.collection("gl_accounts").update(editing.id, data);
      else await pocketbase.collection("gl_accounts").create(data);
      toast.success(`Account ${data.code} saved`);
      setEditing(null);
      queryClient.invalidateQueries(["gl-accounts"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const doExport = (format: "xlsx" | "pdf" | "csv") =>
    exportReport({
      title: "Chart of accounts",
      subtitle: [type !== "all" ? TYPES.find((t) => t.value === type)?.label : "", term ? `Search: “${term}”` : "", showInactive ? "Including inactive" : "Active accounts"].filter(Boolean).join(" · "),
      rows: rows.map((r) => r.a),
      format,
      what: "gl_accounts",
      columns: [
        { header: "Code", value: (a: Account) => a.code, width: 10 },
        { header: "Account", value: (a: Account) => `${"  ".repeat(Math.max(0, (a.level || 1) - 1))}${a.name}`, width: 46 },
        { header: "Type", value: (a: Account) => TYPES.find((t) => t.value === a.type)?.label || a.type },
        { header: "Posting", value: (a: Account) => (a.is_posting ? "Posting" : "Header") },
        { header: "Normal balance", value: (a: Account) => a.normal_balance },
        { header: "Statement section", value: (a: Account) => SECTIONS[a.statement_section] || "" },
        { header: "Cash flow", value: (a: Account) => CASH_FLOW[a.cash_flow_class] || "" },
        { header: "Status", value: (a: Account) => (a.active ? "Active" : "Inactive") },
      ],
    });

  const headers = accounts.filter((a) => !a.is_posting && a.id !== editing?.id);

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Chart of accounts"
        description="Accrual chart of accounts (IPSAS-style). Header accounts group posting accounts; only posting accounts receive transactions."
        breadcrumbs={[{ title: "Setup", link: "#" }, { title: "Chart of accounts", link: "/dashboard/setup/accounts" }]}
        actions={
          <>
            <ExportMenu onExport={doExport} permission={["view_master_data", "export_reports"]} disabled={!rows.length} />
            <ImportButton config={IMPORTS.glAccounts} size="default" />
            {canManage && <Button onClick={() => open()}><Plus size={15} /> New account</Button>}
          </>
        }
      />
      <MetricGroup
        title="Accounts"
        icon={ListTree}
        loading={q.isLoading}
        columns={4}
        metrics={[
          { label: "Posting accounts", value: posting, sub: `${accounts.length} in total` },
          { label: "Assets / liabilities", value: `${counts.asset || 0} / ${counts.liability || 0}` },
          { label: "Revenue", value: counts.revenue || 0 },
          { label: "Expenses", value: counts.expense || 0 },
        ]}
      />
      <section className="rounded-lg border border-slate-200 bg-white shadow-card">
        <div className="flex flex-col gap-2 border-b border-slate-100 p-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="-mx-1 flex gap-1 overflow-x-auto px-1">
            {[{ value: "all", label: "All" }, ...TYPES].map((t) => (
              <button key={t.value} type="button" onClick={() => setType(t.value)} aria-pressed={type === t.value} className={cn("h-8 shrink-0 rounded-full border px-3 text-[12.5px] font-medium", type === t.value ? "border-primary bg-primary text-white" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
              <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-primary" /> Inactive
            </label>
            <label className="relative w-full lg:w-64">
              <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Code or name…" aria-label="Search accounts" className="h-9 w-full rounded-md border border-slate-200 pl-9 pr-3 text-[13px] outline-none focus:border-primary focus:ring-2 focus:ring-primary/20" />
            </label>
          </div>
        </div>
        {q.isLoading ? (
          <div className="p-4"><ListSkeleton rows={8} /></div>
        ) : !rows.length ? (
          <EmptyState icon={FolderTree} title="No accounts" text={term ? "No account matches your search." : "The chart of accounts is empty."} />
        ) : (
          <div className="overflow-x-auto">
            <table className="dnr-grid w-full min-w-[760px]">
              <thead>
                <tr>
                  <th className="w-[46%]">Account</th>
                  <th>Type</th>
                  <th>Statement</th>
                  <th>Cash flow</th>
                  <th>Balance</th>
                  {canManage && <th className="w-24" />}
                </tr>
              </thead>
              <tbody>
                {rows.map(({ a, depth }) => {
                  const hasKids = (children[a.id] || []).length > 0;
                  const t = TYPES.find((x) => x.value === a.type);
                  return (
                    <tr key={a.id} className={cn(!a.is_posting && "bg-slate-50/70", !a.active && "opacity-60")}>
                      <td>
                        <span className="flex items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
                          {hasKids ? (
                            <button type="button" onClick={() => setCollapsed((c) => ({ ...c, [a.id]: !c[a.id] }))} aria-label={collapsed[a.id] ? "Expand" : "Collapse"} className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700">
                              {collapsed[a.id] && !term ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
                            </button>
                          ) : (
                            <span className="w-5" />
                          )}
                          <span className={cn("font-mono text-[12.5px]", a.is_posting ? "text-slate-600" : "font-semibold text-slate-800")}>{a.code}</span>
                          <span className={cn("truncate", a.is_posting ? "text-slate-800" : "font-semibold text-slate-900")}>{a.name}</span>
                          {a.is_control && <Badge tone="violet" className="ml-1">Control</Badge>}
                          {!a.is_posting && <Badge className="ml-1">Header</Badge>}
                          {!a.active && <Badge className="ml-1">Inactive</Badge>}
                        </span>
                      </td>
                      <td>{t && <Badge tone={t.tone}>{t.label}</Badge>}</td>
                      <td className="text-[12.5px] text-slate-600">{SECTIONS[a.statement_section] || "—"}</td>
                      <td className="text-[12.5px] text-slate-600">{CASH_FLOW[a.cash_flow_class] || "—"}</td>
                      <td className="text-[12.5px] capitalize text-slate-600">{a.normal_balance}</td>
                      {canManage && (
                        <td className="text-right">
                          <span className="inline-flex gap-0.5">
                            {!a.is_posting && (
                              <button type="button" onClick={() => open(undefined, a)} title="Add sub-account" aria-label={`Add sub-account under ${a.code}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-primaryDark">
                                <Plus size={14} />
                              </button>
                            )}
                            <button type="button" onClick={() => open(a)} title="Edit" aria-label={`Edit ${a.code}`} className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                              <Pencil size={14} />
                            </button>
                          </span>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <FormDialog
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        icon={ListTree}
        title={editing?.id ? `Edit ${editing.code}` : "New GL account"}
        description="Code, type and the posting flag are frozen once the account has postings. Accounts are never deleted — deactivate them."
        submitLabel={editing?.id ? "Save account" : "Create account"}
        busy={busy}
        onSubmit={save}
      >
        {editing && (
          <>
            <FormBlock icon={ListTree} title="Account">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Code" required error={tried && !editing.code?.trim() ? "Required" : null}>
                  <input value={editing.code || ""} onChange={(e) => setEditing({ ...editing, code: e.target.value })} className={cn(inputCls, "font-mono")} placeholder="5217" />
                </Field>
                <Field label="Type" required>
                  <select value={editing.type} onChange={(e) => setEditing({ ...editing, type: e.target.value, normal_balance: "" })} className={inputCls}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label.replace(/s$/, "")}</option>)}
                  </select>
                </Field>
                <Field label="Name" required className="sm:col-span-2" error={tried && !editing.name?.trim() ? "Required" : null}>
                  <input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} className={inputCls} />
                </Field>
                <Field label="Parent (header) account" className="sm:col-span-2" hint="Sub-accounts must have the same type as their parent.">
                  <select value={editing.parent || ""} onChange={(e) => setEditing({ ...editing, parent: e.target.value })} className={inputCls}>
                    <option value="">— Top level —</option>
                    {headers.filter((h) => h.type === editing.type).map((h) => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
                  </select>
                </Field>
                <label className="flex items-center gap-2.5 text-[13.5px] text-slate-700">
                  <input type="checkbox" checked={Boolean(editing.is_posting)} onChange={(e) => setEditing({ ...editing, is_posting: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-primary" />
                  Posting account (receives transactions)
                </label>
                <label className="flex items-center gap-2.5 text-[13.5px] text-slate-700">
                  <input type="checkbox" checked={Boolean(editing.active)} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-primary" />
                  Active
                </label>
              </div>
            </FormBlock>
            <FormBlock icon={Settings2} title="Reporting">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Statement section" hint="Where it appears in the financial statements.">
                  <select value={editing.statement_section || ""} onChange={(e) => setEditing({ ...editing, statement_section: e.target.value })} className={inputCls}>
                    <option value="">— Inherit from parent —</option>
                    {Object.entries(SECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Cash flow class">
                  <select value={editing.cash_flow_class || ""} onChange={(e) => setEditing({ ...editing, cash_flow_class: e.target.value })} className={inputCls}>
                    <option value="">— Inherit from parent —</option>
                    {Object.entries(CASH_FLOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </Field>
                <Field label="Normal balance" hint="Defaults from the type (assets / expenses: debit).">
                  <select value={editing.normal_balance || ""} onChange={(e) => setEditing({ ...editing, normal_balance: e.target.value })} className={inputCls}>
                    <option value="">— By type —</option>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </select>
                </Field>
                <label className="mt-6 flex items-center gap-2.5 text-[13.5px] text-slate-700">
                  <input type="checkbox" checked={Boolean(editing.is_control)} onChange={(e) => setEditing({ ...editing, is_control: e.target.checked })} className="h-4 w-4 rounded border-slate-300 text-primary" />
                  Control account (sub-ledger only, no manual journals)
                </label>
                <Field label="Description" className="sm:col-span-2">
                  <textarea value={editing.description || ""} onChange={(e) => setEditing({ ...editing, description: e.target.value })} className={textareaCls} />
                </Field>
              </div>
            </FormBlock>
          </>
        )}
      </FormDialog>
    </div>
  );
}
