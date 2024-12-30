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
  import AppFormSelect from "@/components/forms/AppFormSelect";
  import AppFormDatePicker from "@/components/forms/AppFormDatepicker";
  import AppFormAsyncSelect from "@/components/forms/AppFormAsyncSelect";
  
  const formSchema = z.object({
    date: z.date({ required_error: "Please choose a date" }),
    amount: z.number().min(1, { message: "Please enter an amount" }),
    description: z.string().min(1, { message: "Please enter a description" }),
    type: z.enum(["income", "expense"], { required_error: "Please choose a type" }),
    account: z.string().min(1, { message: "Please choose an account" }),
    category: z.string().min(1, { message: "Please choose a category" }),
    user: z.string().min(1, { message: "Please choose a user" }),
    location: z.string().min(1, { message: "Please choose a location" }),
    receipt: z.string().optional(),
  });
  
  const getDefaultValues = (data?: any) => ({
    date: data?.date ? new Date(data?.date) : undefined,
    amount: data?.amount || "",
    description: data?.description || "",
    type: data?.type || "income",
    account: data?.account || "",
    category: data?.category || "",
    user: data?.user || "",
    location: data?.location || "",
    receipt: data?.receipt || "",
  });
  
  export function PettyCashTransactionFormModal({ open, setOpen, record, onComplete }: any) {
    const values = getDefaultValues(record);
  
    const form = useForm<z.infer<typeof formSchema>>({
      resolver: zodResolver(formSchema),
      defaultValues: values,
    });
  
    async function onSubmit(values: z.infer<typeof formSchema>) {
      const q = !record
        ? pocketbase.collection("pettyCashTransactions").create(values)
        : pocketbase.collection("pettyCashTransactions").update(record.id, values);
  
      return q
        .then(() => {
          onComplete();
          toast.success(record ? "Transaction updated successfully" : "Transaction created successfully");
          form.reset();
        })
        .catch((e) => {
          toast.error(e.message);
        });
    }
  
    function accountsLoader({ search }) {
      return pocketbase
        .collection("pettyCashAccounts")
        .getFullList({
          filter: search ? `name~"${search}"` : "",
        })
        .then((e) => e.map((item) => ({ label: item.name, value: item.id })));
    }
  
    function categoriesLoader({ search }) {
      return pocketbase
        .collection("purchaseCategories")
        .getFullList({
          filter: search ? `name~"${search}"` : "",
        })
        .then((e) => e.map((item) => ({ label: item.name, value: item.id })));
    }
  
    function usersLoader({ search }) {
      return pocketbase
        .collection("users")
        .getFullList({
          filter: search ? `name~"${search}"` : "",
        })
        .then((e) => e.map((item) => ({ label: item.name, value: item.id })));
    }
  
    function locationsLoader({ search }) {
      return pocketbase
        .collection("locations")
        .getFullList({
          filter: search ? `name~"${search}"` : "",
        })
        .then((e) => e.map((item) => ({ label: item.name, value: item.id })));
    }
  
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>{record ? "Edit Transaction" : "Create Transaction"}</DialogTitle>
            <DialogDescription>Fill in the fields to {record ? "edit" : "create"} a transaction.</DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid gap-2">
                <AppFormDatePicker form={form} label="Date" placeholder="Choose date" name="date" />
                <AppFormField form={form} label="Amount" placeholder="Enter amount" name="amount" type="number" />
                <AppFormField form={form} label="Description" placeholder="Enter description" name="description" />
                <AppFormSelect
                  form={form}
                  label="Type"
                  placeholder="Choose type"
                  name="type"
                  options={[
                    { label: "Income", value: "income" },
                    { label: "Expense", value: "expense" },
                  ]}
                />
                <AppFormAsyncSelect
                  form={form}
                  label="Account"
                  placeholder="Choose account"
                  name="account"
                  loader={accountsLoader}
                />
                <AppFormAsyncSelect
                  form={form}
                  label="Category"
                  placeholder="Choose category"
                  name="category"
                  loader={categoriesLoader}
                />
                <AppFormAsyncSelect
                  form={form}
                  label="User"
                  placeholder="Choose user"
                  name="user"
                  loader={usersLoader}
                />
                <AppFormAsyncSelect
                  form={form}
                  label="Location"
                  placeholder="Choose location"
                  name="location"
                  loader={locationsLoader}
                />
                <AppFormField form={form} label="Receipt" placeholder="Enter receipt" name="receipt" />
              </div>
              <DialogFooter>
                <Button type="submit">{record ? "Update Transaction" : "Create Transaction"}</Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    );
  }