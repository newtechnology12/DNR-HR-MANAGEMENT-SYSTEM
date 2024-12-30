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

function SmtpSettings() {
  const formSchema = z.object({
    smtp_host: z.string(),
    smtp_port: z.string(),
    smtp_username: z.string(),
    smtp_password: z.string(),
    smtp_encryption: z.string(),
    smtp_from_email: z.string(),
    smtp_from_name: z.string(),
  });

  const { settings } = useSettings();

  const values = useMemo(
    () => ({
      smtp_host: settings?.smtp_host || "",
      smtp_port: settings?.smtp_port || "",
      smtp_username: settings?.smtp_username || "",
      smtp_password: settings?.smtp_password || "",
      smtp_encryption: settings?.smtp_encryption || "",
      smtp_from_email: settings?.smtp_from_email || "",
      smtp_from_name: settings?.smtp_from_name || "",
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
    <div>
      <div className="max-w-2xl py-4 px-4">
        <div className="dark:border-slate-700 border-slate-300">
          <div className="border-b- dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
            <h4 className="font-semibold dark:text-slate-200 text-sm">
              Update SMPT Settings
            </h4>
            <p
              onClick={async () => {
                const settings = await pocketbase.settings.getAll();
                console.log(settings);
              }}
              className="text-[13.5px] leading-7 dark:text-slate-400 mt-1 text-slate-500"
            >
              Lorem ipsum, dolor sit amet consectetur adipisicing elit.
            </p>
          </div>
          <div className="mb-0">
            <Form {...form}>
              <form
                className="space-y-2"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <div className="grid grid-cols-2 gap-2">
                  <div className="!col-span-2">
                    <AppFormField
                      label="SMTP Host"
                      placeholder={"Host"}
                      name={"smtp_host"}
                      form={form}
                    />
                  </div>
                  <AppFormField
                    label="SMTP Port"
                    placeholder={"Port"}
                    name={"smtp_port"}
                    form={form}
                  />
                  <AppFormField
                    label="SMTP Username"
                    placeholder={"Smtp username"}
                    name={"smtp_username"}
                    form={form}
                  />
                  <AppFormField
                    label="SMTP Password"
                    placeholder={"Smtp password"}
                    name={"smtp_password"}
                    form={form}
                  />

                  <AppFormField
                    label="SMTP From Email"
                    placeholder={"Smtp from email"}
                    name={"smtp_from_email"}
                    form={form}
                  />
                  <div className="!col-span-2">
                    <AppFormField
                      label="SMTP From Name"
                      placeholder={"Smtp from name"}
                      name={"smtp_from_name"}
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
                      form.formState.disabled || form.formState.isSubmitting
                    }
                  >
                    {form.formState.isSubmitting && (
                      <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                    )}
                    Update Profile Details
                  </Button>
                </div>
              </form>
            </Form>
          </div>
        </div>
      </div>
    </div>
  );
}
export default SmtpSettings;
