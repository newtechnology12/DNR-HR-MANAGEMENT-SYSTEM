/**
 * Setup → Chart of accounts: hierarchical tree (header / posting accounts), filters by type,
 * search, export, and create / edit for Finance (DAF). The server validates the hierarchy and
 * freezes code, type and posting flag once an account has postings.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FolderTree, Pencil, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { exportReport } from "@/lib/exporter";
import ExportMenu from "@/components/enterprise/ExportMenu";
import { ImportButton } from "@/components/enterprise/ExcelImport";
import { IMPORTS } from "@/lib/importConfigs";
import {
  Button,
  Card,
  Checkbox,
  Column,
  DataTable,
  EmptyState,
  Field,
  FilterBar,
  FilterSelect,
  Input,
  KpiBand,
  Modal,
  ModalSection,
  Page,
  PageHeader,
  Pill,
  Select,
  StatusPill,
  Textarea,
  fmtNumber,
  sentence,
} from "@/components/ims";
import { cn } from "@/utils";

const TYPES = [
  { value: "asset", label: "Assets" },
  { value: "liability", label: "Liabilities" },
  { value: "net_assets", label: "Net assets" },
  { value: "revenue", label: "Revenue" },
  { value: "expense", label: "Expenses" },
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
  const set = (patch: Partial<Account>) => setEditing((e) => ({ ...(e || {}), ...patch }));

  const columns: Column<{ a: Account; depth: number }>[] = [
    {
      key: "account",
      header: "Account",
      width: "46%",
      cell: ({ a, depth }) => {
        const hasKids = (children[a.id] || []).length > 0;
        return (
          <span className="flex min-w-0 items-center gap-1.5" style={{ paddingLeft: depth * 18 }}>
            {hasKids ? (
              <button
                type="button"
                onClick={() => setCollapsed((c) => ({ ...c, [a.id]: !c[a.id] }))}
                aria-label={collapsed[a.id] && !term ? `Expand ${a.code}` : `Collapse ${a.code}`}
                aria-expanded={!(collapsed[a.id] && !term)}
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-ims-muted hover:bg-ims-subtle hover:text-ims-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ims-focus"
              >
                {collapsed[a.id] && !term ? <ChevronRight size={16} aria-hidden /> : <ChevronDown size={16} aria-hidden />}
              </button>
            ) : (
              <span className="w-7 shrink-0" aria-hidden />
            )}
            <span className={cn("shrink-0 whitespace-nowrap font-mono text-t-small", a.is_posting ? "text-ims-body" : "font-semibold text-ims-text")}>{a.code}</span>
            <span className={cn("min-w-0 truncate", a.is_posting ? "text-ims-text" : "font-bold text-ims-text")}>{a.name}</span>
            {a.is_control && <Pill tone="info" className="ml-1">Control</Pill>}
            {!a.is_posting && <Pill className="ml-1">Header</Pill>}
            {!a.active && <StatusPill status="Inactive" className="ml-1" />}
          </span>
        );
      },
    },
    { key: "type", header: "Type", nowrap: true, cell: ({ a }) => TYPES.find((x) => x.value === a.type)?.label || a.type },
    { key: "statement", header: "Statement", cell: ({ a }) => SECTIONS[a.statement_section] || <span className="text-ims-faint">—</span> },
    { key: "cashflow", header: "Cash flow", cell: ({ a }) => CASH_FLOW[a.cash_flow_class] || <span className="text-ims-faint">—</span> },
    { key: "balance", header: "Balance", nowrap: true, cell: ({ a }) => (a.normal_balance ? sentence(a.normal_balance) : <span className="text-ims-faint">—</span>) },
  ];

  const filtered = Boolean(term || type !== "all");

  return (
    <Page>
      <PageHeader
        breadcrumbs={[{ label: "Setup" }, { label: "Chart of accounts" }]}
        title="Chart of accounts"
        subtitle="Accrual chart (IPSAS-style): header accounts group the posting accounts that receive transactions."
        primary={canManage ? { label: "New account", icon: Plus, onClick: () => open() } : undefined}
      />
      <KpiBand
        loading={q.isLoading}
        items={[
          { label: "Posting accounts", value: fmtNumber(posting), sub: `${fmtNumber(accounts.length)} in total` },
          { label: "Assets / liabilities", value: `${counts.asset || 0} / ${counts.liability || 0}`, onClick: () => setType("asset") },
          { label: "Revenue", value: fmtNumber(counts.revenue || 0), onClick: () => setType("revenue") },
          { label: "Expenses", value: fmtNumber(counts.expense || 0), onClick: () => setType("expense") },
        ]}
      />
      <Card padded={false} className="overflow-hidden">
        <FilterBar
          search={{ value: search, onChange: setSearch, placeholder: "Search code or name" }}
          chips={type !== "all" ? [{ key: "type", label: `Type: ${TYPES.find((t) => t.value === type)?.label}`, onRemove: () => setType("all") }] : []}
          onClear={() => setType("all")}
          right={
            <>
              <ImportButton config={IMPORTS.glAccounts} size="default" />
              <ExportMenu onExport={doExport} permission={["view_master_data", "export_reports"]} disabled={!rows.length} />
            </>
          }
        >
          <FilterSelect label="Type" value={type === "all" ? "" : type} onChange={(v) => setType(v || "all")} options={TYPES} />
          <Checkbox label="Show inactive" checked={showInactive} onChange={setShowInactive} className="items-center px-1 [&_input]:mt-0" />
        </FilterBar>
        <DataTable
          columns={columns}
          rows={rows}
          rowKey={(r) => r.a.id}
          loading={q.isLoading}
          error={q.isError ? q.error : undefined}
          onRetry={() => q.refetch()}
          minWidth={820}
          caption="Chart of accounts"
          rowClassName={(r) => cn(!r.a.is_posting && "bg-ims-thead", !r.a.active && "text-ims-muted")}
          onRowClick={canManage ? (r) => open(r.a) : undefined}
          rowActions={
            canManage
              ? (r) => [
                  ...(!r.a.is_posting ? [{ label: "Add sub-account", icon: Plus, onSelect: () => open(undefined, r.a) }] : []),
                  { label: "Edit", icon: Pencil, onSelect: () => open(r.a) },
                ]
              : undefined
          }
          empty={
            <EmptyState
              icon={FolderTree}
              text={filtered ? "No account matches. Change the search or the type." : "The chart of accounts is empty."}
              action={!filtered && canManage ? <Button variant="primary" icon={Plus} onClick={() => open()}>New account</Button> : undefined}
            />
          }
        />
      </Card>

      <Modal
        open={Boolean(editing)}
        onClose={() => setEditing(null)}
        size="lg"
        title={editing?.id ? `Edit ${editing.code}` : "New GL account"}
        description="Code, type and the posting flag are frozen once the account has postings. Accounts are never deleted — deactivate them."
        footer={
          <>
            <Button variant="secondary" onClick={() => setEditing(null)} disabled={busy}>Cancel</Button>
            <Button variant="primary" onClick={save} loading={busy}>{editing?.id ? "Save account" : "Create account"}</Button>
          </>
        }
      >
        {editing && (
          <>
            <ModalSection title="Account">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Code" required htmlFor="coa-code" error={tried && !editing.code?.trim() ? "Enter the account code, such as 5217." : null}>
                  <Input id="coa-code" value={editing.code || ""} onChange={(e) => set({ code: e.target.value })} className="font-mono" placeholder="5217" invalid={tried && !editing.code?.trim()} />
                </Field>
                <Field label="Type" required htmlFor="coa-type">
                  <Select id="coa-type" value={editing.type} onChange={(e) => set({ type: e.target.value, normal_balance: "" })}>
                    {TYPES.map((t) => <option key={t.value} value={t.value}>{t.label.replace(/s$/, "")}</option>)}
                  </Select>
                </Field>
                <Field label="Name" required htmlFor="coa-name" className="sm:col-span-2" error={tried && !editing.name?.trim() ? "Enter the account name." : null}>
                  <Input id="coa-name" value={editing.name || ""} onChange={(e) => set({ name: e.target.value })} invalid={tried && !editing.name?.trim()} />
                </Field>
                <Field label="Parent (header) account" htmlFor="coa-parent" className="sm:col-span-2" hint="Sub-accounts must have the same type as their parent.">
                  <Select id="coa-parent" value={editing.parent || ""} onChange={(e) => set({ parent: e.target.value })}>
                    <option value="">— Top level —</option>
                    {headers.filter((h) => h.type === editing.type).map((h) => <option key={h.id} value={h.id}>{h.code} — {h.name}</option>)}
                  </Select>
                </Field>
                <Checkbox label="Posting account" hint="Receives transactions" checked={Boolean(editing.is_posting)} onChange={(v) => set({ is_posting: v })} />
                <Checkbox label="Active" checked={Boolean(editing.active)} onChange={(v) => set({ active: v })} />
              </div>
            </ModalSection>
            <ModalSection title="Reporting">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Statement section" htmlFor="coa-section" hint="Where it appears in the financial statements.">
                  <Select id="coa-section" value={editing.statement_section || ""} onChange={(e) => set({ statement_section: e.target.value })}>
                    <option value="">— Inherit from parent —</option>
                    {Object.entries(SECTIONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Cash flow class" htmlFor="coa-cashflow">
                  <Select id="coa-cashflow" value={editing.cash_flow_class || ""} onChange={(e) => set({ cash_flow_class: e.target.value })}>
                    <option value="">— Inherit from parent —</option>
                    {Object.entries(CASH_FLOW).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>
                <Field label="Normal balance" htmlFor="coa-balance" hint="Defaults from the type (assets and expenses: debit).">
                  <Select id="coa-balance" value={editing.normal_balance || ""} onChange={(e) => set({ normal_balance: e.target.value })}>
                    <option value="">— By type —</option>
                    <option value="debit">Debit</option>
                    <option value="credit">Credit</option>
                  </Select>
                </Field>
                <div className="sm:pt-7">
                  <Checkbox label="Control account" hint="Sub-ledger only, no manual journals" checked={Boolean(editing.is_control)} onChange={(v) => set({ is_control: v })} />
                </div>
                <Field label="Description" htmlFor="coa-description" className="sm:col-span-2">
                  <Textarea id="coa-description" value={editing.description || ""} onChange={(e) => set({ description: e.target.value })} />
                </Field>
              </div>
            </ModalSection>
          </>
        )}
      </Modal>
    </Page>
  );
}
