import { useMemo } from "react";
import AppFormField from "@/components/forms/AppFormField";
import { Button } from "@/components/ui/button";
import Loader from "@/components/icons/Loader";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Form } from "@/components/ui/form";
import useSettings from "@/hooks/useSettings";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";

function GeneralSettongs() {
  const formSchema = z.object({
    company_name: z.string(),
    company_email: z.string().email(),
    company_phone: z.string(),
    company_address: z.string(),
  });

  const { settings } = useSettings();

  const values = useMemo(
    () => ({
      company_name: settings?.company_name || "",
      company_email: settings?.company_email || "",
      company_phone: settings?.company_phone || "",
      company_address: settings?.company_address || "",
    }),
    [settings]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: values,
  });

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await pocketbase.collection("settings").update(settings.id, values);
      toast.success("Settings updated successfully");
    } catch (error) {
      console.log(error);
      toast.error("Failed to update settings");
    }
  }

  return (
    <div className="grid grid-cols-2 py-2 gap-3">
      <div className="border-r- border-dashed">
        <div className="px-3 py-2 text-[12.5px] text-slate-500 font-medium uppercase">
          <h4>Company information</h4>
        </div>
        <div>
          <div>
            <div className="max-w-2xl py-1 px-4">
              <div className="dark:border-slate-700 border-slate-300">
                <div className="mb-0">
                  <Form {...form}>
                    <form
                      className="space-y-2"
                      onSubmit={form.handleSubmit(onSubmit)}
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div className="!col-span-2">
                          <AppFormField
                            label="Company Name"
                            placeholder={"Company Name"}
                            name={"company_name"}
                            form={form}
                          />
                        </div>
                        <AppFormField
                          label="Company Email"
                          placeholder={"Company Email"}
                          name={"company_email"}
                          form={form}
                        />
                        <AppFormField
                          label="Company Phone"
                          placeholder={"Company Phone"}
                          name={"company_phone"}
                          form={form}
                        />
                        <div className="col-span-2">
                          <AppFormField
                            label="Company Address"
                            placeholder={"Company Address"}
                            name={"company_address"}
                            form={form}
                          />
                        </div>
                      </div>
                      <div className="!mt-3 flex items-center justify-start">
                        <Button
                          size="sm"
                          type="submit"
                          className="mt-1"
                          disabled={
                            form.formState.disabled ||
                            form.formState.isSubmitting
                          }
                        >
                          {form.formState.isSubmitting && (
                            <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                          )}
                          Update Company Details
                        </Button>
                      </div>
                    </form>
                  </Form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
export default GeneralSettongs;
