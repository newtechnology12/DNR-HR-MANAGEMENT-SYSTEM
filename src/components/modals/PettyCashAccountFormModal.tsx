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
  import AppFormAsyncSelect from "@/components/forms/AppFormAsyncSelect";
  
  const formSchema = z.object({
    name: z.string().min(1, { message: "Please enter a name" }),
    balance: z.number().min(0, { message: "Please enter a valid balance" }),
    description: z.string().min(1, { message: "Please enter a description" }),
    group: z.string().min(1, { message: "Please choose a group" }),
  });
  
  const getDefaultValues = (data?: any) => ({
    name: data?.name || "",
    balance: data?.balance || 0,
    description: data?.description || "",
    group: data?.group || "",
  });
  
  export function PettyCashAccountFormModal({ open, setOpen, record, onComplete }: any) {
    const values = getDefaultValues(record);
  
    const form = useForm<z.infer<typeof formSchema>>({
      resolver: zodResolver(formSchema),
      defaultValues: values,
    });
  
    async function onSubmit(values: z.infer<typeof formSchema>) {
      const q = !record
        ? pocketbase.collection("pettyCashAccounts").create(values)
        : pocketbase.collection("pettyCashAccounts").update(record.id, values);
  
      return q
        .then(() => {
          onComplete();
          toast.success(record ? "Account updated successfully" : "Account created successfully");
          form.reset();
        })
        .catch((e) => {
          toast.error(e.message);
        });
    }
  
    function groupsLoader({ search }: { search: string }) {
      return pocketbase
        .collection("pettyCashGroups")
        .getList(0, 5, {
          filter: search ? `name~"${search}"` : "",
          perPage: 5,
        })
        .then((e) => e.items.map((item) => ({ label: item.name, value: item.id })));
    }
  
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{record ? "Edit Account" : "Create Account"}</DialogTitle>
            <DialogDescription>Fill in the fields to {record ? "edit" : "create"} an account.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-2">
                <AppFormField form={form} label="Name" placeholder="Enter name" name="name" />
                <AppFormField form={form} label="Balance" placeholder="Enter balance" name="balance" type="number" />
                <AppFormField form={form} label="Description" placeholder="Enter description" name="description" />
                <AppFormAsyncSelect
                  form={form}
                  label="Group"
                  placeholder="Choose group"
                  name="group"
                  loader={groupsLoader}
                />
              </div>
              <DialogFooter>
                <Button type="submit">{record ? "Update Account" : "Create Account"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }