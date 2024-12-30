import { useMemo } from "react";
import AppFormField from "@/components/forms/AppFormField";
import { Button } from "@/components/ui/button";
import Loader from "@/components/icons/Loader";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { Form } from "@/components/ui/form";
import AppFormTimePicker from "@/components/forms/AppFormTimePicker";
import useSettings from "@/hooks/useSettings";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { Checkbox } from "@/components/ui/checkbox";

function AttendaceSettings() {
  const formSchema = z.object({
    work_start_time: z.string(),
    work_end_time: z.string(),
    early_clockin_mins: z.string(),
    working_days: z.array(z.string()),
  });

  const { settings } = useSettings();

  const values = useMemo(
    () => ({
      work_start_time: settings?.work_start_time || "",
      work_end_time: settings?.work_end_time || "",
      early_clockin_mins: settings?.early_clockin_mins?.toString() || 0,
      working_days: settings?.working_days || [],
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

  const working_days = useWatch({
    control: form.control,
    name: "working_days",
  });

  return (
    <div className="py-3 px-4 max-w-2xl">
      <div className="dark:border-slate-700 border-slate-300">
        <div className="border-b- dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
          <h4
            onClick={() => {
              console.log(form.getValues());
            }}
            className="font-semibold dark:text-slate-200 text-[15px]"
          >
            Attendance Settings
          </h4>
          <p className="text-[14px] leading-7 dark:text-slate-400 mt-1 text-slate-500">
            Lorem ipsum, dolor sit amet consectetur adipisicing elit.
          </p>
        </div>
        <div className="mb-0">
          <Form {...form}>
            <form className="space-y-2" onSubmit={form.handleSubmit(onSubmit)}>
              <div className="grid grid-cols-2 gap-2">
                <AppFormTimePicker
                  label="Work start tim"
                  name="work_start_time"
                  placeholder={"Work start time"}
                  form={form}
                />
                <AppFormTimePicker
                  label="Work end time"
                  name="work_end_time"
                  placeholder={"Work end time"}
                  form={form}
                />
              </div>
              <div>
                <AppFormField
                  label="Early work start time(mins)"
                  type="number"
                  name="early_clockin_mins"
                  placeholder={"Early work start time(mins)"}
                  form={form}
                />
              </div>
              <div className="!mt-4 mb-1">
                <div className="border-b- dark:border-b-slate-700 border-slate-300 mb-0 pb-3 ">
                  <h4
                    onClick={() => {
                      console.log(form.getValues());
                    }}
                    className="font-semibold dark:text-slate-200 text-[15px]"
                  >
                    Working days
                  </h4>
                  <p className="text-[14px] leading-7 dark:text-slate-400 mt-1 text-slate-500">
                    Lorem ipsum, dolor sit amet consectetur adipisicing elit.
                  </p>
                </div>
                <div className="grid mt-0 grid-cols-3 gap-y-1">
                  {[
                    "monday",
                    "tuesday",
                    "wednesday",
                    "thursday",
                    "friday",
                    "saturday",
                    "sunday",
                  ].map((day, i) => (
                    <div
                      key={i}
                      className="flex px-4- pb-4 justify-between- w-full items-center space-x-2"
                    >
                      <Checkbox
                        onCheckedChange={(checked) => {
                          const newv = checked
                            ? [...working_days, day]
                            : working_days.filter((d) => d !== day);

                          console.log(newv);
                          form.setValue("working_days", newv);
                        }}
                        checked={working_days.includes(day)}
                        id={day}
                      />
                      <label
                        htmlFor={day}
                        className="capitalize font-medium- text-slate-500 text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                      >
                        {day}
                      </label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="!mt-0 flex items-center justify-start">
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
                  Update attendance settings
                </Button>
              </div>
            </form>
          </Form>
        </div>
      </div>
    </div>
  );
}
export default AttendaceSettings;
