import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "./ui/dialog";
import { cn } from "@/utils";
import AppFormField from "./forms/AppFormField";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import Loader from "./icons/Loader";
import { Form } from "./ui/form";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { useEffect } from "react";
import AppFormSelect from "./forms/AppFormSelect";

const formSchema = z.object({
  name: z.string().min(1, { message: "Table name is required" }),
  seats: z.number().min(1, { message: "Table seats are required" }),
  code: z.string().min(1, { message: "Table code are required" }),
  status: z.string().min(1, { message: "Table status are required" }),
});

export default function TableFormModal({
  open,
  setOpen,
  onCompleted,
  table,
}: any) {
  const defaultValues = {
    name: "",
    seats: 0,
    code: "",
  };
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues,
  });

  useEffect(() => {
    if (table) {
      form.setValue("code", table.code);
      form.setValue("seats", table.seats);
      form.setValue("name", table.name);
      form.setValue("status", table.status);
    } else {
      form.reset();
    }
  }, [table]);

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const q = table
      ? pocketbase.collection("tables").update(table.id, {
          ...values,
        })
      : pocketbase
          .collection("tables")
          .create({ ...values, status: "available", position: { x: 0, y: 0 } });
    return q
      .then(() => {
        toast.success(
          table ? "Table updated succesffuly" : "Table Created succesffuly"
        );
        onCompleted();
        form.reset();
      })
      .catch((e) => {
        toast.error(e.message || "Some thing went wrong");
      });
  }

  const seats = useWatch({
    control: form.control,
    name: "seats", // without supply name will watch the entire form, or ['firstName', 'lastName'] to watch both
    defaultValue: 0, // default value before the render
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[445px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {table ? "Update a table." : " Create new table."}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 leading-7">
              Fill this form to{" "}
              {table ? "update a table." : " create new table."}
            </span>
          </DialogDescription>
        </DialogHeader>
        <div>
          <Form {...form}>
            <div className={cn("grid gap-6")}>
              <form onSubmit={form.handleSubmit(onSubmit)}>
                <div className="grid px-2 gap-3">
                  <div className="grid gap-2">
                    <AppFormField
                      form={form}
                      label={"Table Name"}
                      placeholder={"Enter table name"}
                      name={"name"}
                    />
                    <AppFormField
                      form={form}
                      label={"Table code"}
                      placeholder={"Enter table code"}
                      name={"code"}
                    />
                  </div>
                  <div className="grid gap-1">
                    <AppFormSelect
                      form={form}
                      label={"Table status"}
                      placeholder={"Enter table status"}
                      name={"status"}
                      options={[
                        { label: "Reserved", value: "reserved" },
                        { label: "Occupied", value: "occupied" },
                        { label: "Available", value: "available" },
                        { label: "Unavailable", value: "unavailable" },
                      ]}
                    />
                  </div>
                  <div>
                    <h4 className="font-medium text-[13px] text-slate-600 mb-[8px]">
                      Seats
                    </h4>
                    <div className="flex flex-wrap items-center gap-[10px]">
                      {[1, 2, 4, 6, 8, 10].map((e, i) => {
                        return (
                          <a
                            onClick={() => form.setValue("seats", e)}
                            key={i}
                            className={cn(
                              "h-10 w-10 border hover:bg-slate-50 cursor-pointer border-slate-200 text-slate-500 rounded-[3px] font-medium flex items-center justify-center text-[13px]",
                              {
                                "border-primary bg-primary text-primary bg-opacity-5":
                                  e === seats,
                              }
                            )}
                          >
                            {e}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                  <div className="mt-2 pb-1">
                    <Button
                      type="submit"
                      disabled={
                        form.formState.disabled || form.formState.isSubmitting
                      }
                      className="w-full"
                      size="sm"
                    >
                      {form.formState.isSubmitting && (
                        <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                      )}
                      {table ? "Update table." : " Create new table"}
                    </Button>
                  </div>
                </div>
              </form>
            </div>
          </Form>
        </div>
      </DialogContent>
    </Dialog>
  );
}
