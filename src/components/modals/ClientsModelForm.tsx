import { useForm, FormProvider } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import AppFormField from "@/components/forms/AppFormField";
import { useEffect, useMemo } from "react";
import AppFormAsyncSelect from "@/components/forms/AppFormAsyncSelect";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import Loader from "../icons/Loader";

const clientSchema = z.object({
  clientType: z.enum(["Organization", "Individual"]),
  clientCategory: z.enum(["Public", "Private"]),
  clientName: z.string().min(3, { message: "Client name is required" }),
  clientTIN: z.string().min(10, { message: "Client TIN is required" }),
  phoneNumber: z.string().min(10, { message: "Phone number is required" }),
  emailAddress: z.string().email("Invalid email address").min(4, { message: "Email address is required" }),
  country: z.string().min(2, { message: "Country is required" }),
  currentBusinessLocation: z.string().min(5, { message: "Current business location is required" }),
});

const getDefaultValues = (data?: any) => {
  return {
    clientType: data?.clientType || "Organization",
    clientCategory: data?.clientCategory || "Public",
    clientName: data?.clientName || "",
    clientTIN: data?.clientTIN || "",
    phoneNumber: data?.phoneNumber || "",
    emailAddress: data?.emailAddress || "",
    country: data?.country || "",
    currentBusinessLocation: data?.currentBusinessLocation || "",
  };
};

export default function ClientFormModal({ open, setOpen, onComplete, client }: any) {
  const values = useMemo(() => getDefaultValues(client), [client]);

  const form = useForm<z.infer<typeof clientSchema>>({
    resolver: zodResolver(clientSchema),
    defaultValues: values,
  });

  useEffect(() => {
    form.reset(values);
  }, [client]);

  async function onSubmit(values: z.infer<typeof clientSchema>) {
    const data = {
      ...values,
    };

    console.log("Submitting data:", data); // Log the data being submitted

    const q = !client
      ? pocketbase.collection("clients").create(data)
      : pocketbase.collection("clients").update(client.id, data);

    return q
      .then(() => {
        onComplete();
        toast.success(client ? "Client updated successfully" : "Client created successfully");
        form.reset();
        setOpen(false); // Close the dialog after successful submission
      })
      .catch((e) => {
        console.error("Error submitting data:", e); // Log any errors
        toast.error(e.message);
      });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[750px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{client ? "Edit Client" : "Create New Client"}</DialogTitle>
          <DialogDescription>
            Fill in the fields to {client ? "edit" : "create"} a client.
          </DialogDescription>
        </DialogHeader>
        <FormProvider {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 sm:grid-cols-2">
              <AppFormAsyncSelect
                form={form}
                label="Client Type"
                name="clientType"
                options={[
                  { label: "Organization", value: "Organization" },
                  { label: "Individual", value: "Individual" },
                ]}
              />
              <AppFormAsyncSelect
                form={form}
                label="Client Category"
                name="clientCategory"
                options={[
                  { label: "Public", value: "Public" },
                  { label: "Private", value: "Private" },
                ]}
              />
              <AppFormField
                form={form}
                label="Client Name"
                name="clientName"
                placeholder="Enter client name"
              />
              <AppFormField
                form={form}
                label="Client TIN"
                name="clientTIN"
                placeholder="Enter client TIN"
              />
              <AppFormField
                form={form}
                label="Phone Number"
                name="phoneNumber"
                placeholder="Enter phone number"
              />
              <AppFormField
                form={form}
                label="Email Address"
                name="emailAddress"
                placeholder="Enter email address"
              />
              <AppFormField
                form={form}
                label="Country"
                name="country"
                placeholder="Enter country"
              />
              <AppFormField
                form={form}
                label="Current Business Location"
                name="currentBusinessLocation"
                placeholder="Enter current business location"
              />
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
                  {client ? "Update Client" : "Create Client"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </FormProvider>
      </DialogContent>
    </Dialog>
  );
}