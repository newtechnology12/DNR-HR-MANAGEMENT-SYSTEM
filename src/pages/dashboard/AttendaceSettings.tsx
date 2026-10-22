import { useMemo } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import useSettings from "@/hooks/useSettings";
import pocketbase from "@/lib/pocketbase";
import { Button, Card, CardHeader, Checkbox, Field, Input, sentence } from "@/components/ims";

const DAYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

/** Settings → Attendance: working hours, clock-in window, lunch break and working days. */
function AttendaceSettings() {
  // Define the form schema with new fields
  const formSchema = z.object({
    work_start_time: z.string(),
    work_end_time: z.string(),
    early_clockin_mins: z.string(),
    working_days: z.array(z.string()),
    clock_in_time: z.string(), // New field for clock-in time
    lunch_break_start: z.string(), // New field for lunch break start time
    lunch_break_duration: z.string(), // New field for lunch break duration (in hours)
    clock_out_time: z.string(), // New field for clock-out time
  });

  const { settings } = useSettings();

  // Initialize form values with default or saved settings
  const values = useMemo(
    () => ({
      work_start_time: settings?.work_start_time || "",
      work_end_time: settings?.work_end_time || "",
      early_clockin_mins: settings?.early_clockin_mins?.toString() || "0",
      working_days: settings?.working_days || [],
      clock_in_time: settings?.clock_in_time || "", // Default clock-in time
      lunch_break_start: settings?.lunch_break_start || "", // Default lunch break start time
      lunch_break_duration: settings?.lunch_break_duration || "1", // Default lunch break duration (1 hour)
      clock_out_time: settings?.clock_out_time || "", // Default clock-out time
    }),
    [settings]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: values,
  });

  // Watch lunch break start time and duration to calculate end time
  const lunchBreakStart = useWatch({
    control: form.control,
    name: "lunch_break_start",
  });
  const lunchBreakDuration = useWatch({
    control: form.control,
    name: "lunch_break_duration",
  });

  // Calculate lunch break end time
  const calculateLunchBreakEnd = (start: string, duration: string) => {
    if (!start || !duration) return "";

    const [hours, minutes] = start.split(":").map(Number);
    const durationHours = parseInt(duration, 10);

    const endTime = new Date();
    endTime.setHours(hours + durationHours, minutes, 0, 0);

    return endTime.toTimeString().slice(0, 5); // Format as HH:MM
  };

  const lunchBreakEnd = calculateLunchBreakEnd(lunchBreakStart, lunchBreakDuration);

  // Handle form submission
  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      // Add calculated lunch break end time to the submitted values
      const updatedValues = {
        ...values,
        lunch_break_end: lunchBreakEnd,
      };

      await pocketbase.collection("settings").update(settings.id, updatedValues);
      toast.success("Attendance settings saved");
    } catch (error) {
      console.error(error);
      toast.error("The attendance settings could not be saved. Try again.");
    }
  }

  const working_days = useWatch({
    control: form.control,
    name: "working_days",
  });

  return (
    <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
      <Card as="div">
        <CardHeader title="Working hours" subtitle="The official working day, used to mark late arrivals and early departures." />
        <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Work starts at" htmlFor="as-work-start">
            <Input id="as-work-start" type="time" {...form.register("work_start_time")} />
          </Field>
          <Field label="Work ends at" htmlFor="as-work-end">
            <Input id="as-work-end" type="time" {...form.register("work_end_time")} />
          </Field>
          <Field label="Early clock-in allowed (minutes)" htmlFor="as-early" hint="How many minutes before the start of work staff may clock in.">
            <Input id="as-early" type="number" min={0} inputMode="numeric" {...form.register("early_clockin_mins")} />
          </Field>
        </div>
      </Card>

      <Card as="div">
        <CardHeader title="Clock-in and lunch break" subtitle="The times the clock-in screen expects, and the lunch break that is not counted as work." />
        <div className="grid max-w-3xl grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Clock-in time" htmlFor="as-clock-in">
            <Input id="as-clock-in" type="time" {...form.register("clock_in_time")} />
          </Field>
          <Field label="Clock-out time" htmlFor="as-clock-out">
            <Input id="as-clock-out" type="time" {...form.register("clock_out_time")} />
          </Field>
          <Field label="Lunch break starts at" htmlFor="as-lunch-start">
            <Input id="as-lunch-start" type="time" {...form.register("lunch_break_start")} />
          </Field>
          <Field label="Lunch break duration (hours)" htmlFor="as-lunch-duration" hint={lunchBreakEnd ? `The lunch break ends at ${lunchBreakEnd}.` : "Set the start and the duration to see when it ends."}>
            <Input id="as-lunch-duration" type="number" min={0} inputMode="numeric" {...form.register("lunch_break_duration")} />
          </Field>
        </div>
      </Card>

      <Card as="div">
        <CardHeader title="Working days" subtitle="The days employees are expected to work. Other days are not counted as absences." />
        <fieldset>
          <legend className="sr-only">Working days</legend>
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:grid-cols-7">
            {DAYS.map((day) => (
              <Checkbox
                key={day}
                id={`as-day-${day}`}
                label={sentence(day)}
                checked={(working_days || []).includes(day)}
                onChange={(checked) => {
                  const newv = checked ? [...working_days, day] : working_days.filter((d) => d !== day);
                  form.setValue("working_days", newv);
                }}
              />
            ))}
          </div>
        </fieldset>
      </Card>

      <div className="flex justify-end">
        <Button type="submit" variant="primary" loading={form.formState.isSubmitting}>
          Save attendance settings
        </Button>
      </div>
    </form>
  );
}

export default AttendaceSettings;
