import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import Loader from "../icons/Loader";
import AppFormField from "../forms/AppFormField";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import AppFormTextArea from "../forms/AppFormTextArea";
import { useAuth } from "@/context/auth.context";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import cleanObject from "@/utils/cleanObject";
import AppFormMonthPicker from "../forms/AppFormMonthpicker";
import AppFileUpload from "../forms/AppFileUpload";
import { Alert, AlertTitle } from "../ui/alert";
import { AlertCircleIcon } from "lucide-react";
import AppFormDatePicker from "../forms/AppFormDatepicker";

const formSchema = z.object({
  employee: z.string().min(1, { message: "Employee is Required" }),
  position: z.string().optional(),
  expenseCategory: z.string().min(1, "Expense category is required"),
  amount: z.string().min(1, { message: "Amount is required" }),
  date: z.date(),
  particularly: z.string().optional(),
  description: z.string().optional(),
  momoNumber: z.string().optional(),
  momoName: z.string().optional(),
  totalAmount: z.number().min(1, "Total amount is required"),
  attachment: z.any().optional(),
  
  deduction_month: z
    .string()
    .min(1, { message: "Deduction month is required" }),
});

const getDefaultValues = (data?: any) => {
  return {
    employee: data?.employee || "",
    position: data?.position || "",
    expenseCategory: data?.expenseCategory || "",
    date: data?.date ? new Date(data.date) : new Date(),
    particularly: data?.particularly || "",
    momoNumber: data?.momoNumber || "",
    momoName: data?.momoName || "",
    totalAmount: data?.totalAmount || 0,
    amount: data?.amount?.toString() || "",
    description: data?.description || "",
    attachment: data?.attachment || undefined,
    deduction_month:
      data?.deduction_month ||
      `${new Date().getFullYear()}.${new Date().getMonth() + 1}`,
  };
};

export function PrepaymentFormModal({
  open,
  setOpen,
  record,
  onComplete,
  employeeId,
}: any) {
  const values = useMemo(
    () =>
      getDefaultValues({ ...record, employee: employeeId || record?.employee }),
    [record]
  );

  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  useEffect(() => {
    form.reset();
  }, [record]);

  const [error, setError] = useState("");

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      ...values,
      employee: values.employee,
    };
    setError("");

    const employee = await pocketbase.collection("users").getOne(data.employee);
    const employee_salary = employee?.salary || 0;

    // check if employee salary is less than the amount to be deducted
    if (parseInt(data.amount) > employee_salary) {
      return setError(
        "The amount to be deducted is greater than the employee's salary"
      );
    }

    // check if the employee has an existing prepayments to be deducted from the selected month
    const existing_prepayments = await pocketbase
      .collection("prepayments")
      .getFullList({
        filter: `employee="${data.employee}" && deduction_month="${data.deduction_month}"`,
      });

    if (existing_prepayments.length)
      return setError(
        "Employee already has a prepayment for the selected month"
      );

    const q = !record
      ? pocketbase.collection("prepayments").create({
          ...data,
          created_by: user?.id,
          status: "pending",
          payment_status: "unpaid",
        })
      : pocketbase.collection("prepayments").update(record.id, { ...data });

    return q
      .then(() => {
        onComplete();
        toast.error(
          q ? "payment updated succesfully" : "payment created succesfully"
        );
        form.reset();
        setError(undefined);
      })
      .catch((e) => {
        setError(e.message);
        toast.error(e.message);
      });
  }

  function loader({ search }) {
    return pocketbase
      .collection("users")
      .getFullList(
        cleanObject({
          filter: search ? `name~"${search}" || names~"${search}"` : undefined,
        })
      )
      .then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id })));
  }

  return (
    <>
      {" "}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>
              <span className="text-base px-2 font-semibold py-2">
                {record ? "Update" : employeeId ? "Apply for a" : "Create"}{" "}
                Prepayment
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to create a new prepayment salary.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              {error && (
                <div className="mb-3 px-2">
                  <Alert
                    variant="destructive"
                    className="py-2 mt-3- rounded-[4px] flex items-center"
                  >
                    <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                    <AlertTitle className="text-[13px] font-medium fon !m-0">
                      {error}
                    </AlertTitle>
                  </Alert>
                </div>
              )}
              <div className="grid px-2 gap-2">
                <div className="grid gap-2 grid-cols-2">
                  <AppFormAsyncSelect
                    form={form}
                    name={"employee"}
                    label={`Choose employee`}
                    placeholder={`Choose employee`}
                    loader={loader}
                    isDisabled={!!employeeId}
                  />
                  <AppFormField
                    form={form}
                    label={"Position"}
                    placeholder={"Enter position"}
                    name={"position"}
                  />

                  <AppFormField
                    form={form}
                    label={"Particularly"}
                    placeholder={"Enter particularly"}
                    name={"particularly"}
                  />
                  <AppFormField
                    form={form}
                    label={"Momo Number"}
                    placeholder={"Enter momo number"}
                    name={"momoNumber"}
                  />
                  <AppFormField
                    form={form}
                    label={"Momo Name"}
                    placeholder={"Enter momo name"}
                    name={"momoName"}
                  />
               
                  <AppFormField
                    form={form}
                    type="number"
                    label={"Amount"}
                    placeholder={"Enter amount"}
                    name={"amount"}
                  />
                </div>
                <div>
                  {/* <AppFormMonthPicker
                    form={form}
                    label={"Deduction month"}
                    name={"deduction_month"}
                  /> */}
                  <AppFormDatePicker
                    form={form}
                    label={"Deduction Date"}
                    name={"deduction_month"}
                    placeholder={"Enter date"}
                  />

                   <AppFormField
                    form={form}
                    label={"Total Amount"}
                    placeholder={"Enter total amount"}
                    name={"totalAmount"}
                  />
                </div>


                <div>
                  <AppFormTextArea
                    form={form}
                    label={"Description"}
                    placeholder={"Enter description"}
                    name={"description"}
                  />
                </div>
                <AppFileUpload
                  form={form}
                  label={"Drag & Drop attachment file here"}
                  name={"attachment"}
                  preview={pocketbase.files.getUrl(record, record?.attachment)}
                />
              </div>
              <DialogFooter>
                <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                  <Button
                    type="button"
                    onClick={() => {
                      form.reset();
                      setError("");
                    }}
                    className="w-full text-slate-600"
                    size="sm"
                    variant="outline"
                  >
                    Reset Form
                  </Button>
                  <Button
                    type="submit"
                    onClick={() => form.handleSubmit(onSubmit)}
                    disabled={
                      form.formState.disabled || form.formState.isSubmitting
                    }
                    className="w-full"
                    size="sm"
                  >
                    {form.formState.isSubmitting && (
                      <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                    )}
                    {record ? "Update credit." : " Create new credit"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
