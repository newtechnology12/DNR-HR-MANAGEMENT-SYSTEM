import * as React from "react";
import { useQuery, useQueryClient } from "react-query";
import { toast } from "sonner";
import { Banknote, Receipt, Smartphone, User } from "lucide-react";
import pocketbase from "@/lib/pocketbase";
import { useRoles } from "@/context/roles.context";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AsyncSelectField from "@/components/AsyncSelectField";
import { errorMessage, money } from "@/lib/procurement";
import { AutoValue, Field, FileDrop, displayName, fileUrl, inputCls, textareaCls, toFormData, toInputDate, toPbDate, useMe } from "@/components/portal/kit";

const OTHER = "__other__";
const MOMO = /^(\+?250|0)?7[2389]\d{7}$/;
const today = () => new Date().toISOString().slice(0, 10);

/**
 * Expense request (staff) / expense entry (finance). Staff describe the expense; the paying account
 * is chosen by finance, here or when approving. A category that is not in the list can be added.
 */
export function PrepaymentFormModal({ open, setOpen, record, onComplete, employeeId }: any) {
  const me = useMe();
  const { canPerform } = useRoles();
  const queryClient = useQueryClient();
  const isFinance = canPerform("approve_or_reject_expense");
  const lockedEmployee = employeeId || (me.data && me.data.hrScope === "own" ? me.data.id : "");

  const blank = React.useCallback(
    () => ({
      employee: employeeId || record?.employee || "",
      expenseCategory: record?.expenseCategory || "",
      newCategory: "",
      amount: record?.amount ? String(record.amount) : "",
      date: toInputDate(record?.date) || today(),
      description: record?.description || "",
      momoNumber: record?.momoNumber || "",
      momoName: record?.momoName || "",
      account: record?.account || "",
    }),
    [record, employeeId]
  );
  const [v, setV] = React.useState(blank);
  const [files, setFiles] = React.useState<File[]>([]);
  const [tried, setTried] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setV(blank());
      setFiles([]);
      setTried(false);
    }
  }, [open, blank]);
  React.useEffect(() => {
    if (open && lockedEmployee && !v.employee) setV((x) => ({ ...x, employee: lockedEmployee }));
  }, [open, lockedEmployee, v.employee]);

  const categories = useQuery(["expense-categories"], () => pocketbase.collection("expenses_categories").getFullList({ sort: "name" }), { enabled: open });
  const accounts = useQuery(["expense-accounts"], () => pocketbase.collection("accounts").getFullList({ sort: "name" }), { enabled: open && isFinance });
  const employee = useQuery(["expense-employee", v.employee], () => pocketbase.collection("users").getOne(v.employee, { expand: "department" }), { enabled: open && Boolean(v.employee) });
  const emp: any = employee.data;

  // Pre-fill mobile money details from the employee's profile.
  React.useEffect(() => {
    if (emp && !record && !v.momoNumber) setV((x) => ({ ...x, momoNumber: (emp.phone || "").replace(/\s/g, ""), momoName: emp.name || "" }));
  }, [emp]); // eslint-disable-line react-hooks/exhaustive-deps

  const amount = Number(v.amount);
  const account: any = (accounts.data || []).find((a: any) => a.id === v.account);
  const existingCategory = (categories.data || []).find((c: any) => c.name.trim().toLowerCase() === v.newCategory.trim().toLowerCase());
  const errors = {
    employee: !v.employee && "Choose the employee.",
    category: !v.expenseCategory ? "Choose a category." : v.expenseCategory === OTHER && v.newCategory.trim().length < 3 ? "Enter the new category name (at least 3 characters)." : false,
    amount: !(amount > 0) ? "Enter the amount in RWF." : amount > 50_000_000 ? "The amount looks too large — check it." : false,
    date: v.date > today() && "The expense date cannot be in the future.",
    description: v.description.trim().length < 10 && "Explain what the money is for (at least 10 characters).",
    momo: v.momoNumber && !MOMO.test(v.momoNumber.replace(/\s/g, "")) && "Enter a valid MTN or Airtel number, e.g. 0788 123 456.",
    funds: account && amount > account.currentBalance && `Not enough money on ${account.name} (${money(account.currentBalance)} available).`,
  };
  const invalid = Object.values(errors).some(Boolean);
  const set = (k: keyof ReturnType<typeof blank>) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((x) => ({ ...x, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setTried(true);
    if (invalid) return;
    setSaving(true);
    try {
      let category = v.expenseCategory;
      if (category === OTHER) {
        category = existingCategory ? existingCategory.id : (await pocketbase.collection("expenses_categories").create({ name: v.newCategory.trim(), description: "Added from an expense request" })).id;
        queryClient.invalidateQueries(["expense-categories"]);
      }
      const data = {
        employee: v.employee,
        expenseCategory: category,
        amount,
        date: toPbDate(v.date),
        description: v.description.trim(),
        momoNumber: v.momoNumber.replace(/\s/g, ""),
        momoName: v.momoName.trim(),
        ...(isFinance ? { account: v.account } : {}),
        ...(record ? {} : { requested_by: me.data?.id }),
      };
      const fd = toFormData(data, files.length ? { attachment: files } : {});
      if (record) await pocketbase.collection("prepayments").update(record.id, fd);
      else await pocketbase.collection("prepayments").create(fd);
      toast.success(record ? "Expense request updated" : "Expense request sent for approval");
      onComplete?.();
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col gap-0 bg-white p-0 sm:h-auto sm:max-h-[94vh] sm:rounded-xl">
        <DialogHeader className="border-b border-slate-100 px-4 py-3.5 text-left sm:px-6">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primaryDark"><Banknote size={19} /></span>
            <div>
              <DialogTitle className="text-[16px]">{record ? "Edit expense request" : "Request an expense"}</DialogTitle>
              <DialogDescription className="text-[12.5px]">Finance reviews the request and pays approved expenses. <span className="text-red-600">*</span> required</DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <form id="expense-form" onSubmit={submit} className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-5 sm:px-6">
          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><User size={15} className="text-slate-400" /> Employee</h3>
            {lockedEmployee ? (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <AutoValue label="Name" value={emp?.name || me.data?.name} />
                <AutoValue label="Department" value={emp?.expand?.department?.name} />
              </div>
            ) : (
              <Field label="Employee" required error={tried && errors.employee}>
                <AsyncSelectField
                  name="expense-employee"
                  value={v.employee}
                  placeholder="Search employee by name"
                  onChange={(o: any) => setV((x) => ({ ...x, employee: o?.value || "", momoNumber: "", momoName: "" }))}
                  loader={({ search }: any) =>
                    pocketbase.collection("users").getList(1, 30, { filter: search ? `name ~ "${String(search).replace(/"/g, "")}"` : "", sort: "name", fields: "id,name" }).then((r) => r.items.map((u: any) => ({ label: u.name, value: u.id })))
                  }
                />
              </Field>
            )}
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><Receipt size={15} className="text-slate-400" /> Expense</h3>
            <Field label="Category" required error={tried && errors.category}>
              <select className={inputCls} value={v.expenseCategory} onChange={set("expenseCategory")} aria-invalid={Boolean(tried && errors.category)}>
                <option value="">{categories.isLoading ? "Loading…" : "Choose a category"}</option>
                {(categories.data || []).map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={OTHER}>Other — not in the list…</option>
              </select>
            </Field>
            {v.expenseCategory === OTHER && (
              <Field
                label="New category name"
                required
                error={tried && errors.category}
                hint={existingCategory ? `"${existingCategory.name}" already exists — it will be used.` : "It will be added to the list for everyone."}
              >
                <input className={inputCls} value={v.newCategory} onChange={set("newCategory")} autoFocus placeholder="e.g. Field mission fuel" />
              </Field>
            )}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Amount (RWF)" required error={tried && errors.amount} hint={amount > 0 ? money(amount) : undefined}>
                <input type="number" inputMode="numeric" min={0} step={100} className={`${inputCls} text-right tabular-nums`} value={v.amount} onChange={set("amount")} placeholder="0" aria-invalid={Boolean(tried && errors.amount)} />
              </Field>
              <Field label="Date of the expense" required error={tried && errors.date}>
                <input type="date" className={inputCls} value={v.date} max={today()} onChange={set("date")} />
              </Field>
            </div>
            <Field label="What is it for?" required error={tried && errors.description}>
              <textarea className={textareaCls} rows={3} value={v.description} onChange={set("description")} placeholder="e.g. Transport to Nyagatare district for the councillors' training, 2 days" aria-invalid={Boolean(tried && errors.description)} />
            </Field>
          </section>

          <section className="space-y-3">
            <h3 className="flex items-center gap-2 text-[13.5px] font-semibold text-slate-900"><Smartphone size={15} className="text-slate-400" /> Payment to</h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Mobile money number" error={tried && errors.momo}>
                <input type="tel" inputMode="tel" className={inputCls} value={v.momoNumber} onChange={set("momoNumber")} placeholder="07XX XXX XXX" />
              </Field>
              <Field label="Name on the MoMo account">
                <input className={inputCls} value={v.momoName} onChange={set("momoName")} />
              </Field>
            </div>
            {isFinance && (
              <Field label="Pay from account" hint={account ? `Balance: ${money(account.currentBalance)}` : "Optional now — required when approving."} error={errors.funds}>
                <select className={inputCls} value={v.account} onChange={set("account")}>
                  <option value="">Choose later</option>
                  {(accounts.data || []).map((a: any) => <option key={a.id} value={a.id}>{a.name} · {money(a.currentBalance)}</option>)}
                </select>
              </Field>
            )}
          </section>

          <Field label="Receipt or supporting document" hint="Photo of the receipt, invoice or mission order.">
            {record?.attachment && !files.length && <a href={fileUrl(record, record.attachment, true)} className="mb-2 block truncate text-[12.5px] text-primaryDark hover:underline">Current file: {displayName(record.attachment)}</a>}
            <FileDrop files={files} onChange={setFiles} multiple={false} label={record?.attachment ? "Replace the file" : "Attach the receipt"} />
          </Field>
        </form>

        <DialogFooter className="flex-row gap-2 border-t border-slate-100 px-4 py-3 sm:px-6">
          <Button type="button" variant="outline" className="h-10 flex-1 sm:flex-none" onClick={() => setOpen(false)}>Cancel</Button>
          <Button type="submit" form="expense-form" className="h-10 flex-1 sm:flex-none" disabled={saving}>
            {saving ? "Sending…" : record ? "Save changes" : `Send request${amount > 0 ? ` · ${money(amount)}` : ""}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
