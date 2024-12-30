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
import { useForm } from "react-hook-form";
import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import { useAuth } from "@/context/auth.context";
import AppFormField from "../forms/AppFormField";
import AppFormTextArea from "../forms/AppFormTextArea";
import AppFormSelect from "../forms/AppFormSelect";

const formSchema = z.object({
  manager: z.string().min(1, { message: "Please choose an manager" }),
  name: z.string().min(1, { message: "Please enter a branch name" }),
  location: z.string().min(1, { message: "Please enter a branch location" }),
  status: z.string().min(1, { message: "Please choose a branch status" }),
  description: z
    .string()
    .min(1, { message: "Please enter a branch description" }),
});

const getDefaultValues = (data?: any) => {
  return {
    manager: data?.manager || "",
    name: data?.name || "",
    location: data?.location || "",
    status: data?.status || "",
    description: data?.description || "",
  };
};

export function BranchFormModal({
  open,
  setOpen,
  record,
  onComplete,
  employeeId,
}: any) {
  const values = useMemo(
    () => getDefaultValues({ ...record, employee: employeeId }),
    [record, employeeId]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  useEffect(() => {
    form.reset();
  }, [record]);

  const { user } = useAuth();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      ...values,
    };

    const q = !record
      ? pocketbase
          .collection("branches")
          .create({ ...data, created_by: user.id })
      : pocketbase.collection("branches").update(record.id, data);

    return q
      .then(async (e) => {
        onComplete();
        toast.error(
          q ? "Branch updated succesfully" : "Branch created succesfully"
        );
        form.reset();
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }

  function employeesLoader({ search }) {
    return pocketbase
      .collection("users")
      .getFullList({
        filter: `name~"${search}"`,
      })
      .then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id })));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-[15px] px-2 font-semibold py-2">
              {record ? "Update" : "Create a new"} branch.
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "Update" : "Create a new"} leave.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <div className="grid gap-2 grid-cols-2">
                <AppFormField
                  form={form}
                  label={"Branch name"}
                  placeholder={"Enter branch name"}
                  name={"name"}
                />
                <AppFormAsyncSelect
                  form={form}
                  label={"Choose manager"}
                  placeholder={"Choose manager"}
                  name={"manager"}
                  loader={employeesLoader}
                />
              </div>
              <div className="grid gap-2 grid-cols-2">
                <AppFormField
                  form={form}
                  label={"Branch location"}
                  placeholder={"Enter branch location"}
                  name={"location"}
                />
                <AppFormSelect
                  form={form}
                  label={"Choose status"}
                  placeholder={"Choose status"}
                  name={"status"}
                  options={[
                    { label: "Active", value: "active" },
                    { label: "Inactive", value: "inactive" },
                  ]}
                />
              </div>
              <div>
                <AppFormTextArea
                  form={form}
                  label={"Branch description"}
                  placeholder={"Enter branch description"}
                  name={"description"}
                />
              </div>
            </div>
            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="button"
                  onClick={() => form.reset()}
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
                  {record ? "Update branch." : " Create new branch"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
