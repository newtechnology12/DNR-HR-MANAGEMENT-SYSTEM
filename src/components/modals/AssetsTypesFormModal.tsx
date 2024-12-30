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
import { useAuth } from "@/context/auth.context";
import AppFormField from "../forms/AppFormField";
import AppFormTextArea from "../forms/AppFormTextArea";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";

const formSchema = z.object({
  name: z.string().min(1, { message: "Name is a required field" }),
  description: z
    .string()
    .min(1, { message: "Description is a required field" }),
  category: z.string().min(1, { message: "Category is a required field" }),
});

const getDefaultValues = (data?: any) => {
  return {
    name: data?.name || "",
    description: data?.description || "",
    category: data?.category || "",
  };
};

export function AssetsTypesFormModal({
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
          .collection("assets_types")
          .create({ ...data, created_by: user.id })
      : pocketbase.collection("assets_types").update(record.id, data);

    return q
      .then(async (e) => {
        onComplete();
        toast.error(
          q
            ? "Asset type updated succesfully"
            : "Asset type  created succesfully"
        );
        form.reset();
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }

  function categoriesLoader() {
    return pocketbase
      .collection("assets_categories")
      .getFullList({
        // filter: `name~"${inputValue}"`,
      })
      .then((e) => e.map((e) => ({ label: e.name || e.name, value: e.id })));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update" : "Create a new"} asset type.
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "Update" : "Create a new"} asset
              type
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <div className="grid gap-2 grid-cols-1">
                <AppFormField
                  form={form}
                  label={"Enter Name"}
                  name={"name"}
                  placeholder={"Enter name"}
                />
              </div>
              <div className="grid gap-2 grid-cols-1">
                <AppFormAsyncSelect
                  form={form}
                  label={"Choose category"}
                  name={"category"}
                  placeholder={"Choose category"}
                  loader={categoriesLoader}
                />
              </div>
              <div className="grid gap-2 grid-cols-1">
                <AppFormTextArea
                  form={form}
                  label={"Enter description"}
                  name={"description"}
                  placeholder={"Enter description"}
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
                  {record ? "Update type." : " Create new type"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
