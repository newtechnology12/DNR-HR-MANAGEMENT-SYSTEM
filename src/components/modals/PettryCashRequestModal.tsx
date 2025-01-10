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
import { Alert, AlertTitle } from "../ui/alert";
import { AlertCircleIcon } from "lucide-react";

const formSchema = z.object({
  amount: z.string().min(1, { message: "Amount is required" }),
  notes: z.string().optional(),
  account: z.string().optional(),
});

const getDefaultValues = (data?: any) => {
  return {
    amount: data?.amount?.toString() || "",
    notes: data?.notes || "",
    account: data?.account || "",
  };
};

export function PettryCashRequestModal({
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
    };
    setError("");

    const q = !record
      ? pocketbase.collection("petty_cash_requests").create({
          ...data,
          requested_by: user.id,
          status: "pending",
        })
      : pocketbase
          .collection("petty_cash_requests")
          .update(record.id, { ...data });

    return q
      .then(() => {
        onComplete();
        toast.error(
          q ? "request updated succesfully" : "request created succesfully"
        );
        form.reset();
        setError(undefined);
      })
      .catch((e) => {
        setError(e.message);
        toast.error(e.message);
      });
  }

  return (
    <>
      {" "}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>
              <span className="text-base px-2 font-semibold py-2">
                {record ? "Update" : employeeId ? "Apply for a" : "Create"}{" "}
                Request
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to create a new request.
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
                  <AppFormField
                    form={form}
                    type="number"
                    label={"Amount"}
                    placeholder={"Enter amount"}
                    name={"amount"}
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
                    label={"Notes"}
                    placeholder={"Enter notes"}
                    name={"notes"}
                  />
                </div>
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
                    {record ? "Update request." : " Create new request"}
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
