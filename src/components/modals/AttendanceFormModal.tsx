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
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import AppFormTextArea from "../forms/AppFormTextArea";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import cleanObject from "@/utils/cleanObject";
import AppFormDatePicker from "../forms/AppFormDatepicker";
import AppFormTimePicker from "../forms/AppFormTimePicker";
import useSettings from "@/hooks/useSettings";
import { Alert, AlertTitle } from "../ui/alert";
import { AlertCircleIcon } from "lucide-react";

const formSchema = z.object({
  employee: z.string().min(1, { message: "Field Required" }),
  notes: z.string().min(1, { message: "Field Required" }),
  clockin_time: z.string().min(1, { message: "Field Required" }),
  clockout_time: z.string().min(1, { message: "Field Required" }),
  date: z.date(),
});

function formatDateToTime(date) {
  var hours = date.getHours().toString().padStart(2, "0");
  var minutes = date.getMinutes().toString().padStart(2, "0");
  return hours + ":" + minutes;
}

const getDefaultValues = (data?: any) => {
  return {
    employee: data?.employee || "",
    notes: data?.notes || "",
    clockin_time: data.clockin_time
      ? formatDateToTime(new Date(data.clockin_time))
      : "",
    clockout_time: data.clockout_time
      ? formatDateToTime(new Date(data.clockout_time))
      : "",
    date: data.date ? new Date(data.date) : undefined,
  };
};

const hasOverlap = async (employee, date) => {
  let beginTime: any = new Date(date);
  beginTime.setHours(0, 0, 0, 0);
  beginTime = beginTime.toISOString().replace("T", " ");

  let stopTime: any = new Date(date);
  stopTime.setHours(23, 59, 59, 999);
  stopTime = stopTime.toISOString().replace("T", " ");

  const dateQ = `date >= "${beginTime}" && date < "${stopTime}"`;

  const data = await pocketbase.collection("attendance").getFullList({
    filter: `employee="${employee}" && ${dateQ}`,
  });

  return data[0] ? true : false;
};

function timeStringToDate(timeString, date) {
  var parts = timeString.split(":");
  var hours = parseInt(parts[0], 10);
  var minutes = parseInt(parts[1], 10);

  var currentDate = new Date(date);
  currentDate.setHours(hours);
  currentDate.setMinutes(minutes);
  currentDate.setSeconds(0);
  currentDate.setMilliseconds(0);

  return currentDate;
}

export function AttendanceFormModal({
  open,
  setOpen,
  record,
  onComplete,
  employeeId,
}: any) {
  const values = useMemo(
    () =>
      getDefaultValues({ ...record, employee: employeeId || record?.employee }),
    [record]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  useEffect(() => {
    form.reset();
  }, [record]);

  const { settings } = useSettings();

  const [error, seterror] = useState("");

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      ...values,
      employee: values.employee,
    };
    seterror(undefined);

    const hasOverap = await hasOverlap(values.employee, values.date);

    if (hasOverap) return seterror("The attendance already exists");

    const currentDate = new Date(values.date);

    // Get current date
    var start_time_date = timeStringToDate(
      settings.work_start_time,
      currentDate
    );
    var clockin_time_date = timeStringToDate(values?.clockin_time, currentDate);
    var clockout_time_date = timeStringToDate(
      values?.clockout_time,
      currentDate
    );

    start_time_date.setMinutes(
      start_time_date.getMinutes() + (settings?.early_clockin_mins || 0)
    );

    const behaviour = clockin_time_date > start_time_date ? "late" : "early";

    const employee = await pocketbase
      .collection("users")
      .getOne(values.employee);

    const dataToSave = {
      ...data,
      branch: employee.branch,
      type: "manual",
      clockin_time: clockin_time_date,
      clockout_time: clockout_time_date,
      behaviour,
    };

    const q = !record
      ? pocketbase.collection("attendance").create(dataToSave)
      : pocketbase
          .collection("attendance")
          .update(record.id, { ...dataToSave });

    return q
      .then(() => {
        onComplete();
        toast.error(
          q
            ? "attendance updated succesfully"
            : "attendance created succesfully"
        );
        form.reset();
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }

  function loader({ search }) {
    return pocketbase
      .collection("users")
      .getFullList(
        cleanObject({
          filter: search ? `name~"${search}" || names~"${search}"` : undefined,
        })
      )
      .then((e) => e.map((e) => ({ label: e.names || e.name, value: e.id })));
  }

  return (
    <>
      {" "}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>
              <span className="text-base px-2 font-semibold py-2">
                {record ? "Update" : employeeId ? "Apply for a" : "Create"}{" "}
                attendance.
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields to create a new attendance.
              </span>
            </DialogDescription>
          </DialogHeader>
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              {error && (
                <Alert
                  variant="destructive"
                  className="py-2 mb-3 rounded-[4px] flex items-center"
                >
                  <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                  <AlertTitle className="text-[13px] font-medium fon !m-0">
                    {error}
                  </AlertTitle>
                </Alert>
              )}
              <div className="grid px-2 gap-2">
                <div className="grid gap-2 grid-cols-2">
                  <AppFormAsyncSelect
                    form={form}
                    name={"employee"}
                    label={`Choose employee`}
                    placeholder={`Choose employee`}
                    loader={loader}
                    isDisabled={!!employeeId}
                  />
                  <AppFormDatePicker
                    form={form}
                    label={"Date"}
                    placeholder={"Choose date"}
                    name={"date"}
                  />
                </div>
                <div className="grid gap-2 mt-2 grid-cols-2">
                  <AppFormTimePicker
                    form={form}
                    name={"clockin_time"}
                    label={`Clockin time`}
                    placeholder={`Enter clockin time`}
                  />
                  <AppFormTimePicker
                    form={form}
                    name={"clockout_time"}
                    label={`Clockout time`}
                    placeholder={`Enter clockout time`}
                  />
                </div>

                <div>
                  <AppFormTextArea
                    form={form}
                    label={"Notes"}
                    placeholder={"Enter notes"}
                    name={"notes"}
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
                    onClick={() => form.handleSubmit(onSubmit)}
                    disabled={
                      form.formState.disabled || form.formState.isSubmitting
                    }
                    className="w-full"
                    size="sm"
                  >
                    {form.formState.isSubmitting && (
                      <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                    )}
                    {record ? "Update attendance." : " Create new attendance"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </>
  );
}
