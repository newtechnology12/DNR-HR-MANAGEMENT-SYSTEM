import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
  } from "@/components/ui/dialog";
  import { Button } from "@/components/ui/button";
  import { Form } from "@/components/ui/form";
  import Loader from "@/components/icons/Loader";
  import AppFormField from "@/components/forms/AppFormField";
  import { useForm } from "react-hook-form";
  import { useEffect, useMemo } from "react";
  import { zodResolver } from "@hookform/resolvers/zod";
  import { z } from "zod";
  import { toast } from "sonner";
  import AppFormAsyncSelect from "@/components/forms/AppFormAsyncSelect";
  import AppFormDatePicker from "@/components/forms/AppFormDatepicker";
  import { projectSchema, getDefaultValues } from "@/utils/projectUtils"; // Adjust the import path as needed
  import pocketbase from "@/lib/pocketbase";
  
  interface ProjectFormPannelProps {
    open: boolean;
    onClose: () => void;
    onComplete: () => void;
    project?: any;
    user: any;
    size?: "sm" | "md" | "lg";
  }
  
  export default function ProjectFormPannel({
    open,
    onClose,
    onComplete,
    project,
    user,
    size = "md",
  }: ProjectFormPannelProps) {
    const values = useMemo(() => getDefaultValues(project, user), [project, user]);
  
    const form = useForm<z.infer<typeof projectSchema>>({
      resolver: zodResolver(projectSchema),
      defaultValues: values,
    });
  
    useEffect(() => {
      form.reset(values);
    }, [project, user]);
  
    async function onSubmit(values: z.infer<typeof projectSchema>) {
      const data = {
        ...values,
        start_date: values.start_date?.toISOString(),
        end_date: values.end_date?.toISOString(),
        created_by: user?.id,
      };
  
      const q = !project
        ? pocketbase.collection("projects").create(data)
        : pocketbase.collection("projects").update(project.id, data);
  
      return q
        .then(() => {
          onComplete();
          toast.success(project ? "Project updated successfully" : "Project created successfully");
          form.reset();
        })
        .catch((e) => {
          if (e.data?.data?.reference_number?.message) {
            form.setError("reference_number", {
              type: "custom",
              message: e.data.data.reference_number.message,
            });
          }
        });
    }
  
    function clientsLoader({ search }: { search: string }) {
      return pocketbase.collection("clients").getList(0, 5, {
        filter: search ? `name~"${search}"` : "",
        perPage: 5,
      }).then((e) => e.items.map((item) => ({ label: item.name, value: item.id })));
    }
  
    return (
      <Dialog open={open} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-[750px] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              <span className="text-base px-2 font-semibold py-2">
                {project ? "Edit Project" : "Create a new Project"}
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to {project ? "edit" : "create"} a project.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid px-2 gap-2">
                <AppFormField
                  form={form}
                  label="Reference Number"
                  placeholder="Enter reference number"
                  name="reference_number"
                />
                <AppFormAsyncSelect
                  form={form}
                  label="Client Name"
                  placeholder="Choose client name"
                  name="client_name"
                  loader={clientsLoader}
                />
                <AppFormField
                  form={form}
                  label="Project Title"
                  placeholder="Enter project title"
                  name="project_title"
                />
                <AppFormDatePicker
                  form={form}
                  label="Start Date"
                  placeholder="Enter start date"
                  name="start_date"
                />
                <AppFormDatePicker
                  form={form}
                  label="End Date"
                  placeholder="Enter end date"
                  name="end_date"
                />
                <AppFormField
                  form={form}
                  label="Status"
                  placeholder="Enter status"
                  name="status"
                />
                <AppFormField
                  form={form}
                  label="Description"
                  placeholder="Enter description"
                  name="description"
                />
                <AppFormField
                  form={form}
                  label="Project Manager"
                  placeholder="Enter project manager"
                  name="project_manager"
                />
                <AppFormField
                  form={form}
                  label="Project Supervisor"
                  placeholder="Enter project supervisor"
                  name="project_supervisor"
                />
                <AppFormField
                  form={form}
                  label="Department Name"
                  placeholder="Enter department name"
                  name="department_name"
                />
                <AppFormField
                  form={form}
                  label="Project Type"
                  placeholder="Enter project type"
                  name="project_type"
                />
              </div>
              <DialogFooter>
                <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                  <Button
                    onClick={() => form.reset()}
                    className="w-full text-slate-600"
                    size="sm"
                    type="button"
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
                    {project ? "Update Project" : "Create Project"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }