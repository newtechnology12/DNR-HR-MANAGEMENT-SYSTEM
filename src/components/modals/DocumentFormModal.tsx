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
import AppFormSelect from "../forms/AppFormSelect";
import AppFileUpload from "../forms/AppFileUpload";

const formSchema = z.object({
  name: z.string().min(1, { message: "Names is a required field" }),
  type: z.string().min(1, { message: "Type is a required field" }),
  attachment: z.any(),
});

const getDefaultValues = (data?: any) => {
  return {
    name: data?.name || "",
    type: data?.type || "",
    attachment: data?.attachment || undefined,
  };
};

export function DocumentFormModal({ open, setOpen, record, onComplete }: any) {
  const values = useMemo(() => getDefaultValues(record), [record]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  useEffect(() => {
    form.reset();
  }, [record]);

  const { user } = useAuth();

  const getFileType = (file) => {
    if (file.type.includes("image")) return "image";
    if (file.type.includes("pdf")) return "pdf";
    if (file.type.includes("word")) return "word";
    if (file.type.includes("excel")) return "excel";
    if (file.type.includes("powerpoint")) return "powerpoint";
    if (file.type.includes("zip")) return "zip";
    if (file.type.includes("audio")) return "audio";
    if (file.type.includes("video")) return "video";
    if (file.type.includes("text")) return "text";
    return "other";
  };

  const getFileExtension = (file) => {
    const ext = file.name.split(".").pop();
    return ext;
  };

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      ...values,
      created_by: user.id,
      employee: user.id,
    };

    if (values?.attachment !== record?.attachment) {
      data["size"] = values?.attachment?.size || 0;
      data["file_type"] = getFileType(values.attachment);
      data["extension"] = getFileExtension(values.attachment);
    }

    const q = !record
      ? pocketbase
          .collection("employee_documents")
          .create({ ...data, creaated_by: user.id })
      : pocketbase.collection("employee_documents").update(record.id, data);

    return q
      .then(async () => {
        onComplete();
        toast.error(
          q ? "Document updated succesfully" : "Document created succesfully"
        );
        form.reset();
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }

  const preview = pocketbase.files.getUrl(record, record?.attachment);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update" : "Create a new"} Document.
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "Update" : "Create a new"}{" "}
              document.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <div className="grid gap-2 grid-cols-2">
                <AppFormField
                  form={form}
                  label={"Document name"}
                  placeholder={"Enter Document name"}
                  name={"name"}
                />
                <AppFormSelect
                  form={form}
                  label={"Document type"}
                  placeholder={"Enter Document type"}
                  name={"type"}
                  options={[
                    { label: "ID", value: "id" },
                    { label: "Passport", value: "passport" },
                    { label: "Driver's License", value: "drivers_license" },
                    { label: "National ID", value: "national_id" },
                    { label: "Voter's ID", value: "voters_id" },
                    { label: "SSNIT", value: "ssnit" },
                    { label: "CV", value: "cv" },
                    { label: "Other", value: "other" },
                  ]}
                />
              </div>
              <div className="mt-1">
                <AppFileUpload
                  form={form}
                  label={"Upload attachment file"}
                  name={"attachment"}
                  preview={preview}
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
                  {record ? "Update document." : " Create new document"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
