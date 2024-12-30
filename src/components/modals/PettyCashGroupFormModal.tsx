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
  import { useForm } from "react-hook-form";
  import { zodResolver } from "@hookform/resolvers/zod";
  import { z } from "zod";
  import pocketbase from "@/lib/pocketbase";
  import { toast } from "sonner";
  import AppFormField from "@/components/forms/AppFormField";
  
  const formSchema = z.object({
    name: z.string().min(1, { message: "Please enter a name" }),
    description: z.string().min(1, { message: "Please enter a description" }),
  });
  
  const getDefaultValues = (data?: any) => ({
    name: data?.name || "",
    description: data?.description || "",
  });
  
  export function PettyCashGroupFormModal({ open, setOpen, record, onComplete }: any) {
    const values = getDefaultValues(record);
  
    const form = useForm<z.infer<typeof formSchema>>({
      resolver: zodResolver(formSchema),
      defaultValues: values,
    });
  
    async function onSubmit(values: z.infer<typeof formSchema>) {
      const q = !record
        ? pocketbase.collection("pettyCashGroups").create(values)
        : pocketbase.collection("pettyCashGroups").update(record.id, values);
  
      return q
        .then(() => {
          onComplete();
          toast.success(record ? "Group updated successfully" : "Group created successfully");
          form.reset();
        })
        .catch((e) => {
          toast.error(e.message);
        });
    }
  
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{record ? "Edit Group" : "Create Group"}</DialogTitle>
            <DialogDescription>Fill in the fields to {record ? "edit" : "create"} a group.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-2">
                <AppFormField form={form} label="Name" placeholder="Enter name" name="name" />
                <AppFormField form={form} label="Description" placeholder="Enter description" name="description" />
              </div>
              <DialogFooter>
                <Button type="submit">{record ? "Update Group" : "Create Group"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }