import { useMemo } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { format } from "date-fns";
import { Pencil, Plus, Trash2 } from "lucide-react";
import useSettings from "@/hooks/useSettings";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { useQuery } from "react-query";
import { DeductionFormModal } from "@/components/modals/DeductionFormModal";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import useConfirmModal from "@/hooks/useConfirmModal";
import { Button, Card, CardHeader, ConfirmDialog, DataTable, DatePicker, EmptyState, Field, Select, fmtNumber, toDate } from "@/components/ims";

/** Shown as a section of Settings: the Settings page carries the page header. */
function PayrollSettings() {
  const formSchema = z.object({
    payroll_period_cycle: z.string(),
    payroll_date: z.date(),
  });

  const { settings } = useSettings();

  const values = useMemo(
    () => ({
      payroll_period_cycle: settings?.payroll_period_cycle || "",
      payroll_date: settings?.payroll_date || "",
    }),
    [settings]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: values,
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await pocketbase.collection("settings").update(settings.id, values);
      toast.success("Payroll settings saved");
    } catch (error) {
      console.log(error);
      toast.error("The payroll settings could not be saved. Check your connection and try again.");
    }
  }

  const deductionsQuery = useQuery({
    queryKey: ["deductions"],
    queryFn: () => {
      return pocketbase.collection("deductions").getFullList();
    },
    enabled: true,
  });

  const newRecordModal = useModalState();

  const editRow = useEditRow();

  const confirmModal = useConfirmModal();

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("departments")
      .delete(e.id)
      .then(() => {
        deductionsQuery.refetch();
        confirmModal.close();
        toast.success("Deduction deleted");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };

  const rows = (deductionsQuery.data || []) as any[];
  const dateValue = (v: unknown) => (v instanceof Date ? format(v, "yyyy-MM-dd") : v ? String(v).slice(0, 10) : "");

  return (
    <>
      <div className="flex max-w-3xl flex-col gap-4 p-4">
        <Card>
          <CardHeader title="Payroll settings" subtitle="How employee payroll is calculated and processed." />
          <form className="space-y-4" onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Controller
                control={form.control}
                name="payroll_period_cycle"
                render={({ field, fieldState }) => (
                  <Field label="Period cycle" htmlFor="ps-cycle" error={fieldState.error ? "Choose a period cycle." : null}>
                    <Select id="ps-cycle" invalid={Boolean(fieldState.error)} value={field.value || ""} onChange={(e) => field.onChange(e.target.value)} onBlur={field.onBlur}>
                      <option value="">Choose a period cycle</option>
                      <option value="monthly">Monthly</option>
                      <option value="weekly">Weekly</option>
                    </Select>
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="payroll_date"
                render={({ field, fieldState }) => (
                  <Field label="Payroll date" htmlFor="ps-date" error={fieldState.error ? "Choose the payroll date." : null}>
                    <DatePicker id="ps-date" invalid={Boolean(fieldState.error)} value={dateValue(field.value)} onChange={(d) => field.onChange(toDate(d))} placeholder="Choose the payroll date" />
                  </Field>
                )}
              />
            </div>
            <div className="flex justify-end border-t border-ims-divider pt-4">
              <Button variant="primary" type="submit" loading={form.formState.isSubmitting} disabled={form.formState.disabled}>Save</Button>
            </div>
          </form>
        </Card>

        <Card padded={false} className="overflow-hidden">
          <div className="px-5 pt-5">
            <CardHeader
              title="Payroll deductions"
              subtitle="All the deductions that go into the payroll."
              action={<Button size="sm" icon={Plus} onClick={() => newRecordModal.open()}>Add deduction</Button>}
            />
          </div>
          <DataTable
            minWidth={420}
            rows={rows}
            rowKey={(d) => d.id}
            loading={deductionsQuery.status === "loading"}
            error={deductionsQuery.status === "error" ? deductionsQuery.error : undefined}
            onRetry={() => deductionsQuery.refetch()}
            onRowClick={(d) => editRow.edit(d)}
            caption="Payroll deductions"
            empty={<EmptyState compact text="No deductions yet. Add one with Add deduction." />}
            rowActions={(d) => [
              { label: "Edit", icon: Pencil, onSelect: () => editRow.edit(d) },
              { label: "Delete", icon: Trash2, danger: true, onSelect: () => confirmModal.open({ meta: d }) },
            ]}
            columns={[
              { key: "name", header: "Name", className: "font-semibold", clamp: true, cell: (d) => d.name },
              { key: "percentage", header: "Percentage (%)", numeric: true, cell: (d) => fmtNumber(d.percentage, true), total: fmtNumber(rows.reduce((acc, curr) => acc + Number(curr?.percentage), 0) || 0, true) },
            ]}
          />
        </Card>
      </div>
      <DeductionFormModal
        onComplete={() => {
          deductionsQuery.refetch();
          newRecordModal.close();
          editRow.close();
        }}
        record={editRow.row}
        setOpen={editRow.isOpen ? editRow.setOpen : newRecordModal.setisOpen}
        open={newRecordModal.isOpen || editRow.isOpen}
      />{" "}
      <ConfirmDialog
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
        title={`Delete ${confirmModal.meta?.name || "this deduction"}?`}
        description="This cannot be undone. The deduction is removed for good."
        confirmLabel="Delete"
        danger
        onConfirm={() => handleDelete(confirmModal.meta)}
      />
    </>
  );
}
export default PayrollSettings;
