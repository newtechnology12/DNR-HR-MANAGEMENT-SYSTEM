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
  import { createGoogleDoc, uploadFileToGoogleDrive } from "@/lib/googleDrive";
  import pocketbase from "@/lib/pocketbase";
  
  const formSchema = z.object({
    title: z.string().min(1, { message: "Title is a required field" }),
    description: z.string().min(1, { message: "Description is a required field" }),
    assignedTo: z.array(z.string()).min(1, { message: "At least one assignee is required" }),
    dueDate: z.string().min(1, { message: "Due date is a required field" }),
    file: z.any().optional(),
  });
  
  const getDefaultValues = (data?: any) => {
    return {
      title: data?.title || "",
      description: data?.description || "",
      assignedTo: data?.assignedTo || [],
      dueDate: data?.dueDate || "",
      file: null,
    };
  };
  
  export function TaskFormModal({
    open,
    setOpen,
    record,
    onComplete,
  }: any) {
    const values = useMemo(() => getDefaultValues(record), [record]);
    const [fileLink, setFileLink] = useState<string | null>(null);
  
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
        createdBy: user.id,
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
      };
  
      try {
        let fileId;
        if (values.file) {
          fileId = await uploadFileToGoogleDrive(values.file);
          setFileLink(`https://drive.google.com/file/d/${fileId}/view`);
        } else {
          fileId = await createGoogleDoc(data);
          setFileLink(`https://docs.google.com/document/d/${fileId}/edit`);
        }
  
        onComplete();
        toast.success(
          record
            ? "Task updated successfully"
            : "Task created successfully"
        );
        form.reset();
      } catch (e) {
        toast.error(e.message);
      }
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
                {record ? "Update" : "Create a new"} Task.
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to {record ? "update" : "create a new"} task.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid px-2 gap-2">
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label={"Task Title"}
                    placeholder={"Enter task title"}
                    name={"title"}
                  />
                </div>
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label={"Description"}
                    placeholder={"Enter task description"}
                    name={"description"}
                  />
                </div>
                <div className="grid gap-2 grid-cols-1">
                  <AppFormAsyncSelect
                    form={form}
                    label={"Assign To"}
                    placeholder={"Choose assignees"}
                    name={"assignedTo"}
                    loader={employeesLoader}
                    isMulti
                  />
                </div>
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label={"Due Date"}
                    placeholder={"Enter due date"}
                    name={"dueDate"}
                    type="date"
                  />
                </div>
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label={"File"}
                    placeholder={"Upload a file"}
                    name={"file"}
                    type="file"
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
                    {record ? "Update Task" : "Create Task"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
          {fileLink && (
            <div className="mt-4 px-2">
              <a href={fileLink} target="_blank" rel="noopener noreferrer" className="text-blue-500 underline">
                View Task File
              </a>
            </div>
          )}
        </DialogContent>
      </Dialog>
    );
  }