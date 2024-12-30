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

function LeavesSettings() {
  const formSchema = z.object({
    leaves_per_year: z.string(),
  });

  const { settings } = useSettings();

  const values = useMemo(
    () => ({
      leaves_per_year: settings?.leaves_per_year?.toString() || "",
    }),
    [settings]
  );

  console.log(values);

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
      toast.error("Failed to update attendance settings");
    }
  }

  return (
    <div>
      <div className="max-w-2xl py-4 px-4">
        <div className="dark:border-slate-700 border-slate-300">
          <div className="border-b- dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
            <h4 className="font-semibold dark:text-slate-200 text-sm">
              Update Leaves Settings
            </h4>
            <p className="text-[14px] leading-7 dark:text-slate-400 mt-1 text-slate-500">
              Lorem ipsum, dolor sit amet consectetur adipisicing elit.
            </p>
          </div>
          <div className="mb-0">
            <Form {...form}>
              <form
                className="space-y-2"
                onSubmit={form.handleSubmit(onSubmit)}
              >
                <div className="grid grid-cols-2 gap-3">
                  <AppFormField
                    type="number"
                    label="Leaves per year"
                    placeholder={"Leaves per year"}
                    name={"leaves_per_year"}
                    form={form}
                  />
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
                    Update leaves settings
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

export default LeavesSettings;
