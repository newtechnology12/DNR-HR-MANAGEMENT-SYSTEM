import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import Loader from "@/components/icons/Loader";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import AppFormSelect from "@/components/forms/AppFormSelect";
import AppFormDatePicker from "@/components/forms/AppFormDatepicker";
import useSettings from "@/hooks/useSettings";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQuery } from "react-query";
import { PlusCircle } from "react-feather";
import { DeductionFormModal } from "@/components/modals/DeductionFormModal";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import useConfirmModal from "@/hooks/useConfirmModal";
import ConfirmModal from "@/components/modals/ConfirmModal";

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
      toast.success("Settings updated successfully");
    } catch (error) {
      console.log(error);
      toast.error("Failed to update attendance settings");
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
        toast.success("departments deleted succesfully");
      })
      .catch((e) => {
        confirmModal.setIsLoading(false);
        toast.error(e.message);
      });
  };
  return (
    <>
      <div>
        <div className="max-w-2xl py-4 px-4">
          <div className="dark:border-slate-700 border-slate-300">
            <div className="border-b- dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
              <h4 className="font-semibold dark:text-slate-200 text-sm">
                Update Payroll Settings
              </h4>
              <p className="text-[14px] leading-7 dark:text-slate-400 mt-1 text-slate-500">
                Lorem ipsum, dolor sit amet consectetur adipisicing elit.
              </p>
            </div>
            <div className="mb-0">
              <Form {...form}>
                <form
                  className="space-y-2"
                  onSubmit={form.handleSubmit(onSubmit)}
                >
                  <div className="grid grid-cols-2 gap-3">
                    <AppFormSelect
                      label="Period Cycle"
                      placeholder={"Select period cycle"}
                      name={"payroll_period_cycle"}
                      options={[
                        { value: "monthly", label: "Monthly" },
                        { value: "weekly", label: "Weekly" },
                      ]}
                      form={form}
                    />
                    <AppFormDatePicker
                      label="Payroll Date"
                      placeholder={"Select payroll date"}
                      name={"payroll_date"}
                      form={form}
                    />
                  </div>
                  <div className="!mt-3 flex items-center justify-start">
                    <Button
                      size="sm"
                      type="submit"
                      className="mt-1"
                      disabled={
                        form.formState.disabled || form.formState.isSubmitting
                      }
                    >
                      {form.formState.isSubmitting && (
                        <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                      )}
                      Update payroll settings
                    </Button>
                  </div>
                </form>
              </Form>
            </div>
          </div>
          <div className="dark:border-slate-700 mt-6 border-slate-300">
            <div className="border-b- flex items-center justify-between dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
              <div className="">
                <h4 className="font-semibold dark:text-slate-200 text-sm">
                  Payroll Deductions
                </h4>
                <p className="text-[14px] leading-7 dark:text-slate-400 mt-1 text-slate-500">
                  List of all deductions that goes into the payroll.
                </p>
              </div>
              <Button
                onClick={() => newRecordModal.open()}
                variant="outline"
                size="sm"
              >
                <PlusCircle className="h-4 w-4 mr-2" />
                <span className="text-[13px]">Add Deduction</span>
              </Button>
            </div>
            <div className="mb-0 border">
              <Table className="table-auto">
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[100px] !h-10">Name</TableHead>
                    <TableHead className="!h-10">Percentage</TableHead>
                    <TableHead className="!h-10 text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deductionsQuery?.data?.map((deduction) => (
                    <TableRow key={deduction.id}>
                      <TableCell className="font-medium truncate">
                        {deduction.name}
                      </TableCell>
                      <TableCell>{deduction.percentage}%</TableCell>
                      <TableCell className="flex justify-end">
                        <div className="flex gap-2">
                          <Button
                            onClick={() => {
                              editRow.edit(deduction);
                            }}
                            size="sm"
                            variant="default"
                          >
                            Edit
                          </Button>
                          <Button
                            onClick={() => {
                              confirmModal.open({
                                meta: deduction,
                              });
                            }}
                            size="sm"
                            variant="destructive"
                          >
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}

                  {deductionsQuery.status === "loading" && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <div className="flex items-center h-40 justify-center">
                          <Loader className="mr-2 h-5 w-5 text-primary animate-spin" />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {deductionsQuery.status === "error" && (
                    <TableRow>
                      <TableCell colSpan={3}>
                        <div className="flex items-center h-40 justify-center">
                          <span className="text-sm text-slate-500">
                            Failed to load deductions
                          </span>
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  {deductionsQuery.status === "success" &&
                    deductionsQuery?.data?.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={3}>
                          <div className="flex items-center h-40 justify-center">
                            <span className="text-sm text-slate-500">
                              No deductions found
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    )}
                </TableBody>
                <TableFooter>
                  <TableRow>
                    <TableCell colSpan={1}>Total</TableCell>
                    <TableCell className="text-right-">
                      {deductionsQuery.data?.reduce(
                        (acc, curr) => acc + Number(curr?.percentage),
                        0
                      ) || 0}
                      %
                    </TableCell>
                    <TableCell colSpan={1}></TableCell>
                  </TableRow>
                </TableFooter>
              </Table>
            </div>
          </div>
        </div>
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
      <ConfirmModal
        title={"Are you sure you want to delete?"}
        description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
        a! Nihil`}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
export default PayrollSettings;
