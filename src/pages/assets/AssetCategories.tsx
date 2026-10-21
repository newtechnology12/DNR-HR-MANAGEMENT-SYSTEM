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
import { DEPRECIATION_METHODS, money } from "@/lib/assets";
import { errorMessage } from "@/lib/procurement";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge, EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import { Field, inputCls } from "@/components/portal/kit";
import { MoneyInput } from "@/components/treasury/TreasuryKit";

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
  if (q.isLoading) return <div className="p-6"><ListSkeleton rows={5} /></div>;
  const { cats, types, accounts, assets } = q.data || { cats: [], types: [], accounts: [], assets: [] };
  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Asset categories"
        description="How each kind of asset is depreciated and where it is posted. Changed by the Director of Finance; a change applies from the next monthly run, posted months are not changed."
        breadcrumbs={[{ title: "Fixed assets", link: "/dashboard/assets" }, { title: "Categories", link: "/dashboard/assets/categories" }]}
        actions={can("approve_fixed_assets") && <Button onClick={() => setEditing({})}><Plus size={15} /> New category</Button>}
      />
      {!cats.length ? <EmptyState icon={Layers} title="No category" text="The Director of Finance creates the categories with their depreciation policy." /> : (
        <div className="grid gap-4 lg:grid-cols-2">
          {cats.map((c) => {
            const x = c.expand || {};
            const mine = types.filter((t) => t.category === c.id);
            const n = assets.filter((a) => a.category === c.id).length;
            return (
              <Panel
                key={c.id}
                title={<span className="flex items-center gap-2">{c.name}{c.code && <span className="rounded bg-slate-100 px-1.5 py-px font-mono text-[11px] text-slate-600">{c.code}</span>}{c.active === false && <Badge tone="neutral">not in use</Badge>}</span>}
                subtitle={`${n} asset${n === 1 ? "" : "s"} in the register`}
                action={can("approve_fixed_assets") ? <Button size="sm" variant="outline" onClick={() => setEditing(c)}><Pencil size={13} /> Edit</Button> : undefined}
              >
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
                  <dt className="text-slate-500">Depreciation</dt>
                  <dd className="font-medium">{DEPRECIATION_METHODS[c.method] || "Not set"}{c.method === "straight_line" && c.useful_life_months ? ` · ${c.useful_life_months} months (${Math.round((c.useful_life_months / 12) * 10) / 10} years)` : ""}{c.method === "reducing_balance" ? ` · ${c.rate}% a year` : ""}</dd>
                  <dt className="text-slate-500">Residual value</dt><dd>{c.residual_percent ? `${c.residual_percent}% of cost` : "Nil"}</dd>
                  <dt className="text-slate-500">Capitalised from</dt><dd>RWF {money(c.capitalisation_threshold)}</dd>
                  <dt className="text-slate-500">Cost account</dt><dd>{x.asset_account ? <><span className="font-mono">{x.asset_account.code}</span> {x.asset_account.name}</> : <span className="text-red-700">not set</span>}</dd>
                  <dt className="text-slate-500">Accumulated depreciation</dt><dd>{x.accumulated_account ? <><span className="font-mono">{x.accumulated_account.code}</span> {x.accumulated_account.name}</> : <span className="text-red-700">not set</span>}</dd>
                  <dt className="text-slate-500">Depreciation expense</dt><dd>{x.expense_account ? <><span className="font-mono">{x.expense_account.code}</span> {x.expense_account.name}</> : <span className="text-red-700">not set</span>}</dd>
                </dl>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
                  <span className="mr-1 text-[12px] text-slate-500">Types:</span>
                  {mine.map((t) => <span key={t.id} className="rounded-full border border-slate-200 px-2 py-0.5 text-[12px]">{t.name}</span>)}
                  {can("manage_fixed_assets") && <button type="button" onClick={() => setTypeFor(c)} className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-[12px] text-primaryDark hover:bg-slate-50"><Plus size={11} /> Add</button>}
                </div>
              </Panel>
            );
          })}
        </div>
      )}
      {editing && <CategoryDialog category={editing} accounts={accounts} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); refresh(); }} />}
      {typeFor && <TypeDialog category={typeFor} onClose={() => setTypeFor(null)} onSaved={() => { setTypeFor(null); refresh(); }} />}
    </div>
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
      toast.success(category.id ? `${v.name} updated — applies from the next depreciation run` : `${v.name} created`);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-xl overflow-y-auto bg-white">
        <DialogHeader>
          <DialogTitle>{category.id ? `Edit ${category.name}` : "New asset category"}</DialogTitle>
          <DialogDescription>The useful life and rate apply to every asset of the category that does not have its own.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
            <Field label="Name" required><input className={inputCls} value={v.name} onChange={set("name")} /></Field>
            <Field label="Code"><input className={`${inputCls} font-mono uppercase`} value={v.code} maxLength={20} onChange={set("code")} /></Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Method"><select className={inputCls} value={v.method} onChange={set("method")}>{Object.entries(DEPRECIATION_METHODS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
            {v.method === "straight_line" && <Field label="Useful life (months)" required><input type="number" min={1} className={inputCls} value={v.useful_life_months} onChange={set("useful_life_months")} /></Field>}
            {v.method === "reducing_balance" && <Field label="Rate (% a year)" required><input type="number" min={0} max={100} step="0.5" className={inputCls} value={v.rate} onChange={set("rate")} /></Field>}
            {v.method !== "none" && <Field label="Residual value (% of cost)"><input type="number" min={0} max={99} className={inputCls} value={v.residual_percent} onChange={set("residual_percent")} /></Field>}
          </div>
          <Field label="Capitalisation threshold" hint="Cheaper items are expensed, not registered"><MoneyInput value={v.capitalisation_threshold} onChange={(x) => setV((y: any) => ({ ...y, capitalisation_threshold: x }))} /></Field>
          <Field label="Cost account" required><select className={inputCls} value={v.asset_account} onChange={set("asset_account")}><option value="">Choose…</option>{assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
          {v.method !== "none" && (
            <>
              <Field label="Accumulated depreciation account" required><select className={inputCls} value={v.accumulated_account} onChange={set("accumulated_account")}><option value="">Choose…</option>{assetAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
              <Field label="Depreciation expense account" required><select className={inputCls} value={v.expense_account} onChange={set("expense_account")}><option value="">Choose…</option>{expenseAccounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
            </>
          )}
          <label className="flex items-center gap-2 text-[13px]"><input type="checkbox" className="h-4 w-4" checked={v.active} onChange={set("active")} /> In use for new assets</label>
        </div>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || !v.name.trim() || !v.asset_account} onClick={save}>{busy ? "Saving…" : "Save"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function TypeDialog({ category, onClose, onSaved }: { category: any; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await pocketbase.collection("assets_types").create({ name: name.trim(), description: `${name.trim()} (${category.name})`, category: category.id });
      toast.success(`${name.trim()} added`);
      onSaved();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm bg-white">
        <DialogHeader><DialogTitle>New type of {category.name.toLowerCase()}</DialogTitle><DialogDescription>Staff choose a type when they ask for equipment.</DialogDescription></DialogHeader>
        <Field label="Name" required><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Docking station" /></Field>
        <DialogFooter className="gap-2"><Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={busy || name.trim().length < 2} onClick={save}>Add</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
