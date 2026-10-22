/**
 * Fixed assets → Categories: the depreciation policy (method, useful life, rate, residual value), the
 * capitalisation threshold and the three GL accounts of each category. Changed by the Director of Finance; a
 * change applies from the next depreciation run. The Store & Asset Officer keeps the list of asset types.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Layers, Pencil, Plus } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { DEPRECIATION_METHODS } from "@/lib/assets";
import { errorMessage } from "@/lib/procurement";
import { Skeleton } from "@/components/ui/skeleton";
import { Button, Card, CardHeader, Checkbox, Details, EmptyState, ErrorState, Field, Input, Modal, ModalSection, MoneyInput, Page, PageHeader, Pill, Select, StatusPill, fmtMoney, fmtNumber } from "@/components/ims";

export default function AssetCategories() {
  const { can } = usePermissions();
  const qc = useQueryClient();
  const [editing, setEditing] = React.useState<any | null>(null);
  const [typeFor, setTypeFor] = React.useState<any | null>(null);
  const q = useQuery(["asset-categories"], async () => {
    const [cats, types, accounts, assets] = await Promise.all([
      pocketbase.collection("assets_categories").getFullList({ sort: "sort,name", expand: "asset_account,accumulated_account,expense_account" }),
      pocketbase.collection("assets_types").getFullList({ sort: "name", fields: "id,name,category" }),
      pocketbase.collection("gl_accounts").getFullList({ filter: 'is_posting = true && active = true && (type = "asset" || type = "expense")', sort: "code", fields: "id,code,name,type" }),
      pocketbase.collection("assets").getFullList({ filter: 'status != "disposed"', fields: "category" }).catch(() => [] as any[]),
    ]);
    return { cats: cats as any[], types: types as any[], accounts: accounts as any[], assets: assets as any[] };
  });
  const refresh = () => qc.invalidateQueries(["asset-categories"]);
  const canEdit = can("approve_fixed_assets");
  const header = (
    <PageHeader
      breadcrumbs={[{ label: "Fixed assets", to: "/dashboard/assets" }, { label: "Categories" }]}
      title="Asset categories"
      subtitle="How each kind of asset is depreciated and where it is posted. Changes apply from the next monthly run."
      primary={canEdit ? { label: "New category", icon: Plus, onClick: () => setEditing({}) } : undefined}
    />
  );
  if (q.isLoading) {
    return (
      <Page>
        {header}
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-72 w-full rounded-card" />
          <Skeleton className="h-72 w-full rounded-card" />
        </div>
      </Page>
    );
  }
  const { cats, types, accounts, assets } = q.data || { cats: [], types: [], accounts: [], assets: [] };
  const account = (a?: any) => (a ? <><span className="whitespace-nowrap font-mono text-t-small">{a.code}</span> {a.name}</> : <span className="font-semibold text-ims-danger">Not set</span>);
  return (
    <Page>
      {header}
      {q.isError ? (
        <Card>
          <ErrorState text="The categories could not be loaded." detail={errorMessage(q.error)} onRetry={() => q.refetch()} />
        </Card>
      ) : !cats.length ? (
        <Card>
          <EmptyState
            icon={Layers}
            text="No category yet. The Director of Finance creates the categories with their depreciation policy."
            action={canEdit ? <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>New category</Button> : undefined}
          />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cats.map((c) => {
            const x = c.expand || {};
            const mine = types.filter((t) => t.category === c.id);
            const n = assets.filter((a) => a.category === c.id).length;
            return (
              <Card key={c.id} className="flex flex-col">
                <CardHeader
                  title={
                    <span className="flex flex-wrap items-center gap-2">
                      {c.name}
                      {c.code && <span className="whitespace-nowrap rounded-control bg-ims-subtle px-1.5 py-px font-mono text-t-hint font-semibold text-ims-body">{c.code}</span>}
                      {c.active === false && <StatusPill status="Inactive" />}
                    </span>
                  }
                  subtitle={`${fmtNumber(n)} asset${n === 1 ? "" : "s"} in the register`}
                  action={canEdit ? <Button size="sm" icon={Pencil} onClick={() => setEditing(c)}>Edit</Button> : undefined}
                />
                <Details
                  className="mb-5"
                  items={[
                    {
                      label: "Depreciation",
                      value: DEPRECIATION_METHODS[c.method] || "Not set",
                      hint:
                        c.method === "straight_line" && c.useful_life_months
                          ? `${c.useful_life_months} months (${Math.round((c.useful_life_months / 12) * 10) / 10} years)`
                          : c.method === "reducing_balance"
                            ? `${c.rate}% a year`
                            : undefined,
                    },
                    { label: "Residual value", value: c.residual_percent ? `${c.residual_percent}% of cost` : "Nil" },
                    { label: "Capitalised from", value: fmtMoney(c.capitalisation_threshold) },
                    { label: "Cost account", value: account(x.asset_account) },
                    { label: "Accumulated depreciation", value: account(x.accumulated_account) },
                    { label: "Depreciation expense", value: account(x.expense_account) },
                  ]}
                />
                <div className="mt-auto flex flex-wrap items-center gap-1.5 border-t border-ims-divider pt-4">
                  <span className="mr-1 text-t-small text-ims-muted">Types</span>
                  {mine.length ? mine.map((t) => <Pill key={t.id} tone="neutral">{t.name}</Pill>) : <span className="text-t-small text-ims-faint">None yet</span>}
                  {can("manage_fixed_assets") && <Button size="sm" variant="ghost" icon={Plus} className="text-ims-link" onClick={() => setTypeFor(c)}>Add type</Button>}
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {editing && <CategoryDialog category={editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {typeFor && <TypeDialog category={typeFor} onClose={() => setTypeFor(null)} onSaved={() => { setTypeFor(null); refresh(); }} />}
    </Page>
  );
}

function CategoryDialog({ category, accounts, onClose, onSaved }: { category: any; accounts: any[]; onClose: () => void; onSaved: () => void }) {
  const [v, setV] = React.useState<any>({
    name: category.name || "", code: category.code || "", method: category.method || "straight_line", useful_life_months: category.useful_life_months || "", rate: category.rate || "",
    residual_percent: category.residual_percent || 0, capitalisation_threshold: category.capitalisation_threshold ?? "", asset_account: category.asset_account || "",
    accumulated_account: category.accumulated_account || "", expense_account: category.expense_account || "", active: category.active !== false, description: category.description || "",
  });
  const [busy, setBusy] = React.useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((x: any) => ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  const assetAccounts = accounts.filter((a) => a.type === "asset");
  const expenseAccounts = accounts.filter((a) => a.type === "expense");
  const save = async () => {
    setBusy(true);
    try {
      const data = { ...v, useful_life_months: Number(v.useful_life_months) || 0, rate: Number(v.rate) || 0, residual_percent: Number(v.residual_percent) || 0, capitalisation_threshold: Number(v.capitalisation_threshold) || 0 };
      if (category.id) await pocketbase.collection("assets_categories").update(category.id, data);
      else await pocketbase.collection("assets_categories").create(data);
      toast.success(category.id ? `${v.name} updated. The change applies from the next depreciation run.` : `${v.name} created`);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      title={category.id ? `Edit ${category.name}` : "New asset category"}
      description="The useful life and rate apply to every asset of the category that does not have its own."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={!v.name.trim() || !v.asset_account}>Save</Button>
        </>
      }
    >
      <ModalSection title="Category">
        <div className="grid gap-4 sm:grid-cols-[1fr_140px]">
          <Field label="Name" required htmlFor="cat-name">
            <Input id="cat-name" value={v.name} onChange={set("name")} />
          </Field>
          <Field label="Code" htmlFor="cat-code">
            <Input id="cat-code" className="font-mono" value={v.code} maxLength={20} onChange={set("code")} />
          </Field>
        </div>
        <Checkbox id="cat-active" label="In use for new assets" checked={v.active} onChange={(on) => setV((x: any) => ({ ...x, active: on }))} />
      </ModalSection>
      <ModalSection title="Depreciation policy">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Method" htmlFor="cat-method">
            <Select id="cat-method" value={v.method} onChange={set("method")}>
              {Object.entries(DEPRECIATION_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </Select>
          </Field>
          {v.method === "straight_line" && (
            <Field label="Useful life (months)" required htmlFor="cat-life">
              <Input id="cat-life" type="number" min={1} value={v.useful_life_months} onChange={set("useful_life_months")} />
            </Field>
          )}
          {v.method === "reducing_balance" && (
            <Field label="Rate (% a year)" required htmlFor="cat-rate">
              <Input id="cat-rate" type="number" min={0} max={100} step="0.5" value={v.rate} onChange={set("rate")} />
            </Field>
          )}
          {v.method !== "none" && (
            <Field label="Residual value (% of cost)" htmlFor="cat-residual">
              <Input id="cat-residual" type="number" min={0} max={99} value={v.residual_percent} onChange={set("residual_percent")} />
            </Field>
          )}
        </div>
        <Field label="Capitalisation threshold" htmlFor="cat-threshold" hint="Cheaper items are expensed, not registered">
          <MoneyInput id="cat-threshold" value={v.capitalisation_threshold} onChange={(x) => setV((y: any) => ({ ...y, capitalisation_threshold: x }))} />
        </Field>
      </ModalSection>
      <ModalSection title="General ledger accounts">
        <Field label="Cost account" required htmlFor="cat-asset-account">
          <Select id="cat-asset-account" value={v.asset_account} onChange={set("asset_account")}>
            <option value="">Choose…</option>
            {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
          </Select>
        </Field>
        {v.method !== "none" && (
          <>
            <Field label="Accumulated depreciation account" required htmlFor="cat-acc-account">
              <Select id="cat-acc-account" value={v.accumulated_account} onChange={set("accumulated_account")}>
                <option value="">Choose…</option>
                {assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </Select>
            </Field>
            <Field label="Depreciation expense account" required htmlFor="cat-exp-account">
              <Select id="cat-exp-account" value={v.expense_account} onChange={set("expense_account")}>
                <option value="">Choose…</option>
                {expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
              </Select>
            </Field>
          </>
        )}
      </ModalSection>
    </Modal>
  );
}

function TypeDialog({ category, onClose, onSaved }: { category: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await pocketbase.collection("assets_types").create({ name: name.trim(), description: `${name.trim()} (${category.name})`, category: category.id });
      toast.success(`${name.trim()} added to ${category.name}`);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      size="sm"
      title={`New type of ${category.name.toLowerCase()}`}
      description="Staff choose a type when they ask for equipment."
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button variant="primary" onClick={save} loading={busy} disabled={name.trim().length < 2}>Add</Button>
        </>
      }
    >
      <Field label="Name" required htmlFor="type-name" hint="At least 2 characters">
        <Input id="type-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Docking station" />
      </Field>
    </Modal>
  );
}
