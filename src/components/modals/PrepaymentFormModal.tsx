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
import AppFileUpload from "../forms/AppFileUpload";
import { Alert, AlertTitle } from "../ui/alert";
import { AlertCircleIcon } from "lucide-react";

const formSchema = z.object({
  employee: z.string().min(1, { message: "Employee is Required" }),
  expenseCategory: z.string().min(1, "Expense category is required"),
  amount: z.string().min(1, { message: "Amount is required" }),
  date: z.date(),
  description: z.string().optional(),
  momoNumber: z.string().optional(),
  momoName: z.string().optional(),
  attachment: z.any().optional(),
  account: z.string().optional(),
});

const getDefaultValues = (data?: any) => {
  return {
    employee: data?.employee || "",
    expenseCategory: data?.expenseCategory || "",
    date: data?.date ? new Date(data.date) : new Date(),
    momoNumber: data?.momoNumber || "",
    momoName: data?.momoName || "",
    amount: data?.amount?.toString() || "",
    description: data?.description || "",
    attachment: data?.attachment || undefined,
    account: data?.account || "",
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

    const q = !record
      ? pocketbase.collection("prepayments").create({
          ...data,
          created_by: user?.id,
          status: "pending",
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

  console.log("record", form.formState.errors);

  return (
    <>
      {" "}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>
              <span className="text-base px-2 font-semibold py-2">
                {record ? "Update" : employeeId ? "Apply for a" : "Create"}{" "}
                Expense
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to create a new expense salary.
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
                <div className="grid grid-cols-2 gap-3">
                  <AppFormAsyncSelect
                    form={form}
                    name={"expenseCategory"}
                    label={`Choose expense category`}
                    placeholder={`Choose expense category`}
                    loader={({ search }) => {
                      return pocketbase
                        .collection("expenses_categories")
                        .getFullList({
                          filter: `name~"${search}"`,
                        })
                        .then((e) =>
                          e.map((e) => ({ label: e.name, value: e.id }))
                        );
                    }}
                  />
                  <AppFormAsyncSelect
                    form={form}
                    name={"account"}
                    label={"Choose account"}
                    placeholder={"Choose method"}
                    loader={({ search }) => {
                      return pocketbase
                        .collection("accounts")
                        .getFullList({
                          filter: search ? `name~"${search}"` : "",
                        })
                        .then((e) =>
                          e.map((e) => ({
                            label: e.name,
                            value: e.id,
                            original: e,
                          }))
                        );
                    }}
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
                    {record ? "Update expense." : " Create new expense"}
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
