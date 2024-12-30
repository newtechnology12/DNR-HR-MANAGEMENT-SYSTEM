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
  import { toast } from "sonner";
  import { useAuth } from "@/context/auth.context";
  import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
  import { uploadFileToGoogleDrive } from "@/lib/googleDrive";
  import pocketbase from "@/lib/pocketbase";
  
  const formSchema = z.object({
    taskId: z.string().min(1, { message: "Task ID is a required field" }),
    content: z.string().min(1, { message: "Content is a required field" }),
    files: z.any().optional(),
  });
  
  const getDefaultValues = (data?: any) => {
    return {
      taskId: data?.taskId || "",
      content: data?.content || "",
      files: data?.files || [],
    };
  };
  
  export function ReportFormModal({
    open,
    setOpen,
    record,
    onComplete,
  }: any) {
    const values = useMemo(() => getDefaultValues(record), [record]);
    const [fileLinks, setFileLinks] = useState<string[]>([]);
  
    const form = useForm<z.infer<typeof formSchema>>({
      resolver: zodResolver(formSchema),
      defaultValues: values,
    });
  
    useEffect(() => {
      form.reset(values);
    }, [record, values]);
  
    const { user } = useAuth();
  
    async function onSubmit(values: z.infer<typeof formSchema>) {
      const data = {
        ...values,
        submittedBy: user.id,
        submittedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
  
      try {
        const uploadedFileLinks = [];
        if (values.files && values.files.length > 0) {
          for (const file of values.files) {
            const fileId = await uploadFileToGoogleDrive(file);
            uploadedFileLinks.push(`https://drive.google.com/file/d/${fileId}/view`);
          }
        }
  
        data.files = uploadedFileLinks;
        setFileLinks(uploadedFileLinks); // Set the file links state
  
        const q = !record
          ? pocketbase.collection("reports").create(data)
          : pocketbase.collection("reports").update(record.id, { ...data, updatedAt: new Date() });
  
        await q;
        onComplete();
        toast.success(
          record
            ? "Report updated successfully"
            : "Report created successfully"
        );
        form.reset();
      } catch (e) {
        toast.error(e.message);
      }
    }
  
    function tasksLoader({ search }) {
      return pocketbase
        .collection("tasks")
        .getFullList({
          filter: `title~"${search}"`,
        })
        .then((e) => e.map((e) => ({ label: e.title, value: e.id })));
    }
  
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>
              <span className="text-base px-2 font-semibold py-2">
                {record ? "Update" : "Create a new"} Report.
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to {record ? "update" : "create a new"} report.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid px-2 gap-2">
                <div className="grid gap-2 grid-cols-1">
                  <AppFormAsyncSelect
                    form={form}
                    label={"Task"}
                    placeholder={"Choose task"}
                    name={"taskId"}
                    loader={tasksLoader}
                  />
                </div>
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label={"Content"}
                    placeholder={"Enter report content"}
                    name={"content"}
                  />
                </div>
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label={"Files"}
                    placeholder={"Upload files"}
                    name={"files"}
                    type="file"
                    multiple
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
                    disabled={form.formState.isSubmitting}
                    className="w-full"
                    size="sm"
                  >
                    {form.formState.isSubmitting && (
                      <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                    )}
                    {record ? "Update Report" : "Create Report"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
          {fileLinks.length > 0 && (
            <div className="mt-4 px-2">
              {fileLinks.map((link, index) => (
                <div key={index}>
                  <a href={link} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                    View File {index + 1}
                  </a>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }