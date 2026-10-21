import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Banknote, CheckCircle2, Clock, Paperclip, Pencil, Plus, Receipt, Undo2, XCircle } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge } from "@/components/enterprise/ui";
import { PrepaymentFormModal } from "@/components/modals/PrepaymentFormModal";
import { errorMessage, money } from "@/lib/procurement";
import type { Tone } from "@/lib/procurement";
import { cn } from "@/utils";
import { Attachments, Chip, ListToolbar, showDate, useMe } from "@/components/portal/kit";

export const EXPENSE_STATUS: Record<string, { label: string; tone: Tone }> = {
  pending: { label: "Pending approval", tone: "warning" },
  approved: { label: "Approved", tone: "success" },
  rejected: { label: "Rejected", tone: "danger" },
  paid: { label: "Paid", tone: "success" },
  cancelled: { label: "Withdrawn", tone: "neutral" },
};

export default function EmployeePrePayments({ employeeId, autoOpen = false }: { employeeId: string; autoOpen?: boolean }) {
  const queryClient = useQueryClient();
  const me = useMe();
  const isSelf = me.data?.id === employeeId;
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [form, setForm] = React.useState<{ open: boolean; record?: any }>({ open: autoOpen });
  const [viewing, setViewing] = React.useState<any>(null);
  const [withdrawing, setWithdrawing] = React.useState<any>(null);

  const q = useQuery(["employee-expenses", employeeId], () =>
    pocketbase.collection("prepayments").getFullList({ filter: `employee = "${employeeId}"`, sort: "-date,-created", expand: "expenseCategory,approved_by,rejected_by,account" })
  );
  const refresh = () => queryClient.invalidateQueries(["employee-expenses", employeeId]);
  const withdraw = useMutation(() => pocketbase.collection("prepayments").delete(withdrawing.id), {
    onSuccess: () => {
      toast.success("Request withdrawn");
      setWithdrawing(null);
      setViewing(null);
      refresh();
    },
    onError: (e) => {
      toast.error(errorMessage(e));
    },
  });

  const rows = (q.data || []) as any[];
  const year = String(new Date().getFullYear());
  const sum = (xs: any[]) => xs.reduce((a, x) => a + (Number(x.amount) || 0), 0);
  const pending = rows.filter((r) => r.status === "pending");
  const approvedYear = rows.filter((r) => r.status === "approved" && (r.date || r.created).startsWith(year));
  const shown = rows.filter(
    (r) => (status === "all" || r.status === status) && `${r.description} ${r.expand?.expenseCategory?.name || ""} ${r.amount}`.toLowerCase().includes(search.trim().toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {[
          { icon: Clock, label: "Waiting for approval", value: money(sum(pending)), sub: `${pending.length} request${pending.length === 1 ? "" : "s"}`, tone: "text-amber-700" },
          { icon: CheckCircle2, label: `Approved in ${year}`, value: money(sum(approvedYear)), sub: `${approvedYear.length} request${approvedYear.length === 1 ? "" : "s"}`, tone: "text-emerald-700" },
          { icon: XCircle, label: "Rejected", value: rows.filter((r) => r.status === "rejected").length, sub: "all time", tone: "text-slate-900" },
        ].map((s) => (
          <div key={s.label} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-3.5 py-3">
            <s.icon size={18} className={cn("shrink-0", s.tone)} />
            <div className="min-w-0">
              <p className="text-[11.5px] text-slate-500">{s.label}</p>
              <p className={cn("truncate text-[16px] font-semibold tabular-nums", s.tone)}>{q.isLoading ? "…" : s.value}</p>
              <p className="text-[11px] text-slate-400">{s.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <ListToolbar
        search={search}
        onSearch={setSearch}
        placeholder="Search expenses"
        filters={[["all", "All"], ["pending", "Pending"], ["approved", "Approved"], ["rejected", "Rejected"]].map(([k, l]) => (
          <Chip key={k} active={status === k} onClick={() => setStatus(k)} count={k === "all" ? rows.length : rows.filter((r) => r.status === k).length}>{l}</Chip>
        ))}
        action={isSelf && <Button className="h-10" onClick={() => setForm({ open: true })}><Plus size={16} /> Request an expense</Button>}
      />

      {q.isLoading ? (
        <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-14 rounded-xl" />)}</div>
      ) : !shown.length ? (
        <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center">
          <Banknote size={26} className="text-slate-400" />
          <p className="text-[14px] font-medium text-slate-800">{rows.length ? "No expense matches" : "No expense requests yet"}</p>
          <p className="max-w-sm text-[12.5px] text-slate-500">Request reimbursement or an advance for work expenses — transport, missions, supplies. Attach the receipt.</p>
        </div>
      ) : (
        <>
          <ul className="space-y-2 md:hidden">
            {shown.map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => setViewing(r)} className="w-full rounded-xl border border-slate-200 bg-white p-3.5 text-left shadow-card active:bg-slate-50">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-[15px] font-semibold tabular-nums text-slate-900">{money(r.amount)}</p>
                    <StatusBadge status={r.status} map={EXPENSE_STATUS} />
                  </div>
                  <p className="text-[12.5px] text-slate-500">{r.expand?.expenseCategory?.name || "Uncategorised"} · {showDate(r.date || r.created)}</p>
                  <p className="mt-1 line-clamp-2 text-[13px] text-slate-700">{r.description || "—"}</p>
                  {r.status === "rejected" && r.rejected_reason && <p className="mt-1 text-[12px] text-red-700">Reason: {r.rejected_reason}</p>}
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white md:block">
            <table className="dnr-grid w-full min-w-[820px] text-[13px]">
              <thead>
                <tr className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                  <th className="px-3 py-2.5">Date</th>
                  <th className="px-3 py-2.5">Category</th>
                  <th className="px-3 py-2.5">Description</th>
                  <th className="px-3 py-2.5 text-right">Amount</th>
                  <th className="px-3 py-2.5">Status</th>
                  <th className="px-3 py-2.5">Decided by</th>
                  <th className="w-10 px-3 py-2.5"><span className="sr-only">Receipt</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map((r) => (
                  <tr key={r.id} onClick={() => setViewing(r)} className="cursor-pointer hover:bg-slate-50">
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{showDate(r.date || r.created)}</td>
                    <td className="whitespace-nowrap px-3 py-2.5">{r.expand?.expenseCategory?.name || "—"}</td>
                    <td className="max-w-[300px] truncate px-3 py-2.5 text-slate-700">{r.description || "—"}</td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right font-medium tabular-nums">{money(r.amount)}</td>
                    <td className="px-3 py-2.5"><StatusBadge status={r.status} map={EXPENSE_STATUS} /></td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-600">{r.expand?.approved_by?.name || r.expand?.rejected_by?.name || "—"}</td>
                    <td className="px-3 py-2.5 text-slate-400">{r.attachment && <Paperclip size={14} aria-label="Receipt attached" />}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold">
                  <td className="px-3 py-2.5" colSpan={3}>Total ({shown.length})</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{money(sum(shown))}</td>
                  <td colSpan={3} />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}

      <Dialog open={Boolean(viewing)} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent className="flex max-h-[100dvh] w-full max-w-lg flex-col gap-0 bg-white p-0 sm:max-h-[92vh] sm:rounded-xl">
          {viewing && (
            <>
              <DialogHeader className="border-b border-slate-100 px-4 py-3.5 text-left sm:px-5">
                <DialogTitle className="flex items-center gap-2"><Receipt size={17} className="text-slate-400" /> {money(viewing.amount)}</DialogTitle>
                <DialogDescription>{viewing.expand?.expenseCategory?.name || "Expense"} · {showDate(viewing.date || viewing.created)}</DialogDescription>
              </DialogHeader>
              <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 sm:px-5">
                <StatusBadge status={viewing.status} map={EXPENSE_STATUS} />
                <dl className="grid grid-cols-2 gap-3 text-[13px]">
                  <div className="col-span-2"><dt className="text-slate-500">What it is for</dt><dd className="whitespace-pre-line text-slate-900">{viewing.description || "—"}</dd></div>
                  <div><dt className="text-slate-500">Mobile money</dt><dd>{viewing.momoNumber || "—"}</dd></div>
                  <div><dt className="text-slate-500">Name on account</dt><dd>{viewing.momoName || "—"}</dd></div>
                  {viewing.expand?.account && <div><dt className="text-slate-500">Paid from</dt><dd>{viewing.expand.account.name}</dd></div>}
                </dl>
                <ol className="space-y-2 border-l-2 border-slate-100 pl-3 text-[12.5px]">
                  <li><span className="font-medium text-slate-800">Requested</span> <span className="text-slate-500">{showDate(viewing.created, "d MMM yyyy, HH:mm")}</span></li>
                  {viewing.status === "approved" && <li><span className="font-medium text-emerald-700">Approved</span> by {viewing.expand?.approved_by?.name || "—"} <span className="text-slate-500">{showDate(viewing.updated, "d MMM yyyy")}</span></li>}
                  {viewing.status === "rejected" && (
                    <li>
                      <span className="font-medium text-red-700">Rejected</span> by {viewing.expand?.rejected_by?.name || "—"} <span className="text-slate-500">{showDate(viewing.updated, "d MMM yyyy")}</span>
                      {viewing.rejected_reason && <p className="mt-0.5 rounded-md bg-red-50 px-2 py-1 text-red-800">“{viewing.rejected_reason}”</p>}
                    </li>
                  )}
                  {viewing.status === "pending" && <li className="text-amber-700">Waiting for finance approval</li>}
                </ol>
                <div>
                  <p className="mb-1.5 text-[13px] font-medium text-slate-700">Receipt</p>
                  <Attachments record={viewing} names={viewing.attachment ? [viewing.attachment] : []} empty="No receipt attached." />
                </div>
              </div>
              {isSelf && viewing.status === "pending" && (
                <DialogFooter className="flex-row gap-2 border-t border-slate-100 px-4 py-3 sm:px-5">
                  <Button variant="ghost" className="h-10 flex-1 text-red-700 sm:flex-none" onClick={() => setWithdrawing(viewing)}><Undo2 size={15} /> Withdraw</Button>
                  <Button variant="outline" className="h-10 flex-1 sm:flex-none" onClick={() => { setForm({ open: true, record: viewing }); setViewing(null); }}><Pencil size={15} /> Edit</Button>
                </DialogFooter>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(withdrawing)} onOpenChange={(o) => !o && setWithdrawing(null)}>
        <DialogContent className="max-w-sm bg-white">
          <DialogHeader>
            <DialogTitle>Withdraw this request?</DialogTitle>
            <DialogDescription>{withdrawing && `${money(withdrawing.amount)} — ${withdrawing.description}`}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-row gap-2">
            <Button variant="outline" className="flex-1 sm:flex-none" onClick={() => setWithdrawing(null)}>Keep it</Button>
            <Button variant="destructive" className="flex-1 sm:flex-none" disabled={withdraw.isLoading} onClick={() => withdraw.mutate()}>Withdraw</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PrepaymentFormModal
        open={form.open}
        setOpen={(o: boolean) => setForm((f) => ({ ...f, open: o }))}
        record={form.record}
        employeeId={employeeId}
        onComplete={() => {
          setForm({ open: false });
          refresh();
        }}
      />
    </div>
  );
}
