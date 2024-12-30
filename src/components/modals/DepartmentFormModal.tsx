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
import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { useAuth } from "@/context/auth.context";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";

const formSchema = z.object({
  name: z.string().min(1, { message: "Names is a required field" }),
  manager: z.string().min(1, { message: "Manager is a required field" }),
});

const getDefaultValues = (data?: any) => {
  return {
    name: data?.name || "",
    manager: data?.manager || "",
  };
};

export function DepartmentFormModal({
  open,
  setOpen,
  record,
  onComplete,
}: any) {
  const values = useMemo(() => getDefaultValues(record), [record]);

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
          .collection("departments")
          .create({ ...data, created_by: user.id })
      : pocketbase.collection("departments").update(record.id, data);

    return q
      .then(async (e) => {
        onComplete();
        toast.error(
          q
            ? "Department updated succesfully"
            : "Department created succesfully"
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
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update" : " Create a new"} Department.
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "Update" : " Create a new"}{" "}
              department.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <div className="grid gap-2 grid-cols-1">
                <AppFormField
                  form={form}
                  label={"Department name"}
                  placeholder={"Enter department name"}
                  name={"name"}
                />
              </div>
              <div className="grid gap-2 grid-cols-1">
                <AppFormAsyncSelect
                  form={form}
                  label={"Manager"}
                  placeholder={"Choose manager"}
                  name={"manager"}
                  loader={employeesLoader}
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
                  {record ? "Update department." : " Create new department"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
