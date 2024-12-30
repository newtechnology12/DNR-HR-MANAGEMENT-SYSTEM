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
    receiverId: z.string().min(1, { message: "Receiver is a required field" }),
    content: z.string().min(1, { message: "Content is a required field" }),
  });
  
  const getDefaultValues = (data?: any) => {
    return {
      receiverId: data?.receiverId || "",
      content: data?.content || "",
    };
  };
  
  export function MessageFormModal({
    open,
    setOpen,
    record,
    onComplete,
  }: any) {
    const values = useMemo(() => getDefaultValues(record), [record]);
  
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
        senderId: user.id,
        timestamp: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      };
  
      const q = !record
        ? pocketbase.collection("messages").create(data)
        : pocketbase.collection("messages").update(record.id, { ...data, updatedAt: new Date() });
  
      return q
        .then(async (e) => {
          onComplete();
          toast.success(
            record
              ? "Message updated successfully"
              : "Message created successfully"
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
                {record ? "Update" : "Create a new"} Message.
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to {record ? "update" : "create a new"} message.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid px-2 gap-2">
                <div className="grid gap-2 grid-cols-1">
                  <AppFormAsyncSelect
                    form={form}
                    label={"Receiver"}
                    placeholder={"Choose receiver"}
                    name={"receiverId"}
                    loader={employeesLoader}
                  />
                </div>
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label={"Content"}
                    placeholder={"Enter message content"}
                    name={"content"}
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
                    {record ? "Update Message" : "Create Message"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }