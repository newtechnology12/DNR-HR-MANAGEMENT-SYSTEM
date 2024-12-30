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
import AppFormTextArea from "../forms/AppFormTextArea";
import { useAuth } from "@/context/auth.context";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import cleanObject from "@/utils/cleanObject";
import AppFormSelect from "../forms/AppFormSelect";

const formSchema = z.object({
  category: z.string().min(1, { message: "Field Required" }),
  name: z.string().min(1, { message: "Asset name is required" }),
  notes: z.string().optional(),
  code: z.string().min(1, { message: "Asset code is required" }),
  serial_number: z.string().optional(),
  type: z.string().min(1, { message: "Asset type is required" }),
  status: z.string().min(1, { message: "Asset status is required" }),
  assigned_to: z.string().min(1, { message: "Assigned to is required" }),
});

const getDefaultValues = (data?: any) => {
  return {
    category: data?.category || "",
    name: data?.name || "",
    notes: data?.notes || "",
    code: data?.code || "",
    serial_number: data?.serial_number || "",
    type: data?.type || "",
    status: data?.status || "",
    assigned_to: data?.assigned_to || "",
  };
};

export function AssetsFormModal({ open, setOpen, record, onComplete }: any) {
  const values = useMemo(() => getDefaultValues(record), [record]);

  const { user } = useAuth();

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  useEffect(() => {
    form.reset();
  }, [record]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      ...values,
      category: values.category,
      assigned_at:
        values?.status === "assigned" && values?.status !== record?.status
          ? new Date().toISOString()
          : undefined,
    };

    const q = !record
      ? pocketbase
          .collection("assets")
          .create({ ...data, created_by: user?.id })
      : pocketbase.collection("assets").update(record.id, { ...data });

    return q
      .then(() => {
        onComplete();
        toast.error(
          q
            ? "asset allocation updated succesfully"
            : "asset allocation created succesfully"
        );
        form.reset();
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }

  function loader({ search }) {
    return pocketbase
      .collection("assets_categories")
      .getFullList(
        cleanObject({
          filter: search ? `name~"${search}"` : undefined,
        })
      )
      .then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id })));
  }

  function usersLoader({ search }) {
    return pocketbase
      .collection("users")
      .getFullList(
        cleanObject({
          filter: search ? `name~"${search}"` : undefined,
        })
      )
      .then((e) =>
        e.map((e) => ({ label: e?.names || e?.name, value: e?.id }))
      );
  }

  function typesLoader({ search }) {
    return pocketbase
      .collection("assets_types")
      .getFullList(
        cleanObject({
          filter: search ? `name~"${search}"` : undefined,
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
                {record ? "Update" : "Create"} a new asset allocation
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to create a new asset allocation.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid px-2 gap-2">
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label={"Asset name"}
                    placeholder={"Enter asset name"}
                    name={"name"}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AppFormField
                    form={form}
                    name={"code"}
                    label={`Asset code`}
                    placeholder={`Enter asset code`}
                  />
                  <AppFormField
                    form={form}
                    name={"serial_number"}
                    label={`Serial number(optional)`}
                    placeholder={`Enter serial number`}
                  />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <AppFormAsyncSelect
                    form={form}
                    name={"category"}
                    label={`Asset category`}
                    placeholder={`Choose asset category`}
                    loader={loader}
                  />
                  <AppFormAsyncSelect
                    form={form}
                    name={"type"}
                    label={`Asset type`}
                    placeholder={`Choose asset type`}
                    loader={typesLoader}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <AppFormSelect
                    form={form}
                    name={"status"}
                    label={`Asset status`}
                    placeholder={`Choose status`}
                    options={[
                      { value: "in-use", label: "In use" },
                      { value: "assigned", label: "assigned" },
                      { value: "lost", label: "lost" },
                      {
                        value: "Damaged",
                        label: "damaged",
                      },
                      {
                        value: "in_stock",
                        label: "In stock",
                      },
                      {
                        value: "in_transit",
                        label: "In transit",
                      },
                      {
                        value: "maintenance",
                        label: "Maintenance",
                      },
                      ,
                    ]}
                  />
                  <AppFormAsyncSelect
                    form={form}
                    name={"assigned_to"}
                    label={`Assigned to`}
                    placeholder={`Choose assigned to`}
                    loader={usersLoader}
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
                    {record
                      ? "Update asset allocation."
                      : " Create new asset allocation"}
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
