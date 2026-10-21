/**
 * Setup → Posting accounts: which GL account each automatic posting uses (payroll now; vouchers, receipts
 * and depreciation as they are connected). The DAF changes them; a change applies to the next posting only,
 * posted journals are never touched. A key without a choice uses the default chart-of-accounts code.
 */
import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Link2, Save } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { usePermissions } from "@/context/auth.context";
import { errorMessage } from "@/lib/procurement";
import { ledgerApi, PostingAccount } from "@/lib/ledger";
import { Button } from "@/components/ui/button";
import { Badge, EmptyState, ListSkeleton, PageHeader, Panel } from "@/components/enterprise/ui";
import { cn } from "@/utils";

const MODULES: Record<string, { title: string; text: string }> = {
  payroll: { title: "Payroll", text: "Posted when a payroll is approved (costs and liabilities) and when it is paid (salaries payable against the bank)." },
};
const TYPE_OF: Record<string, string> = { "1": "asset", "2": "liability", "3": "net_assets", "4": "revenue", "5": "expense" };

export default function PostingAccounts() {
  const { can } = usePermissions();
  const canEdit = can("manage_chart_of_accounts");
  const queryClient = useQueryClient();
  const [draft, setDraft] = React.useState<Record<string, string>>({});
  const [busy, setBusy] = React.useState(false);
  const q = useQuery(["posting-accounts"], async () => {
    const [items, records, accounts] = await Promise.all([
      ledgerApi.postingAccounts(),
      pocketbase.collection("posting_accounts").getFullList({ fields: "id,key" }),
      pocketbase.collection("gl_accounts").getFullList({ filter: "is_posting = true && active = true", sort: "code", fields: "id,code,name,type" }),
    ]);
    return { items, ids: Object.fromEntries((records as any[]).map((r) => [r.key, r.id])) as Record<string, string>, accounts: accounts as any[] };
  });
  const items = q.data?.items || [];
  const changed = Object.entries(draft).filter(([k, v]) => v && v !== items.find((i) => i.key === k)?.account?.id);
  const groups = Object.entries(items.reduce((g: Record<string, PostingAccount[]>, i) => ({ ...g, [i.module]: [...(g[i.module] || []), i] }), {}));

  async function save() {
    setBusy(true);
    try {
      for (const [key, account] of changed) {
        const item = items.find((i) => i.key === key)!;
        const id = q.data?.ids[key];
        if (id) await pocketbase.collection("posting_accounts").update(id, { account });
        else await pocketbase.collection("posting_accounts").create({ key, label: item.label, module: item.module, account, sort: item.sort });
      }
      toast.success(`${changed.length} posting account${changed.length === 1 ? "" : "s"} changed — used from the next posting`);
      setDraft({});
      queryClient.invalidateQueries(["posting-accounts"]);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4 px-3 sm:px-4">
      <PageHeader
        title="Posting accounts"
        description="The GL account each automatic posting uses. A change applies from the next posting; journals already posted are not changed."
        breadcrumbs={[{ title: "Setup", link: "/dashboard/setup/accounts" }, { title: "Posting accounts", link: "/dashboard/setup/posting-accounts" }]}
        actions={canEdit && <Button disabled={!changed.length || busy} onClick={save}><Save size={15} /> {busy ? "Saving…" : changed.length ? `Save ${changed.length} change${changed.length === 1 ? "" : "s"}` : "Save"}</Button>}
      />
      {q.isLoading ? <ListSkeleton rows={8} /> : !items.length ? <EmptyState icon={Link2} title="No automatic postings" text="Posting accounts appear here as modules are connected to the general ledger." /> : groups.map(([module, rows]) => (
        <Panel key={module} title={MODULES[module]?.title || module} subtitle={MODULES[module]?.text}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-[13px]">
              <thead>
                <tr className="border-b border-slate-200 text-left text-[10.5px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="py-2 pr-3">Posting</th><th className="py-2 pr-3">Account used</th><th className="py-2 pr-3">Default</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((i) => {
                  const type = TYPE_OF[i.default_code.charAt(0)];
                  const options = (q.data?.accounts || []).filter((a) => !type || a.type === type);
                  const value = draft[i.key] ?? i.account?.id ?? "";
                  const dirty = draft[i.key] && draft[i.key] !== i.account?.id;
                  return (
                    <tr key={i.key} className={cn(dirty && "bg-amber-50/60")}>
                      <td className="py-2 pr-3">
                        <span className="block font-medium text-slate-900">{i.label}</span>
                        <span className="font-mono text-[11.5px] text-slate-400">{i.key}</span>
                      </td>
                      <td className="py-2 pr-3">
                        {canEdit ? (
                          <select aria-label={`Account for ${i.label}`} className="h-9 w-full max-w-[380px] rounded-md border border-slate-200 bg-white px-2.5 text-[13px] focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/20" value={value} onChange={(e) => setDraft((d) => ({ ...d, [i.key]: e.target.value }))}>
                            {!i.account && <option value="">No account — the posting will fail</option>}
                            {options.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}
                          </select>
                        ) : i.account ? <span><span className="font-mono font-semibold">{i.account.code}</span> {i.account.name}</span> : <span className="text-red-700">Not set</span>}
                      </td>
                      <td className="py-2 pr-3 whitespace-nowrap">
                        <span className="font-mono text-[12.5px] text-slate-600">{i.default_code}</span>{" "}
                        {i.configured ? (i.account?.code === i.default_code ? <Badge tone="neutral">default</Badge> : <Badge tone="info">changed</Badge>) : <Badge tone="neutral">default</Badge>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      ))}
      {!canEdit && <p className="text-[12px] text-slate-500">Only the Director of Finance changes posting accounts.</p>}
    </div>
  );
}
