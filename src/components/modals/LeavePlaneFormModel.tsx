import React, { useEffect, useMemo, useState } from 'react';
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "../ui/button";
import { Form } from "../ui/form";
import Loader from "../icons/Loader";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import AppFormSelect from "../forms/AppFormSelect";
import { useAuth } from "@/context/auth.context";
import AppFormTextArea from "../forms/AppFormTextArea";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircleIcon } from "lucide-react";
import calculateRemainingLeaves from "@/utils/calculateRemainingLeaves";
import useSettings from "@/hooks/useSettings";
import AppFormDatePicker from '../forms/AppFormDatepicker';

function capitalizeFirstLetter(str) {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

const formSchema = z.object({
  employee: z.string().min(1, { message: "Please choose an employee" }),
  type: z.string().min(1, { message: "Please choose a leave type" }),
  status: z.string().min(1, { message: "Please choose a leave status" }),
  start: z.date({ required_error: "Please choose a start date" }),
  end: z.date({ required_error: "Please choose an end date" }),
  Leaveduration: z.number().min(1, { message: "Leave duration must be at least 1 day" }),
  reason: z.string().optional(),
});

const calculateLeaveDuration = (start, end) => {
  if (!start || !end) return 0;
  const startDate = new Date(start);
  const endDate = new Date(end);
  const timeDiff = endDate.getTime() - startDate.getTime();
  const daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));
  return daysDiff;
};

const getDefaultValues = (data) => {
  const start = data?.start ? new Date(data.start) : new Date();
  const end = data?.end ? new Date(data.end) : new Date();
  
  return {
    employee: data?.employee || "",
    type: data?.type || "Annual Leave",
    status: data?.status || "pending",
    start,
    end,
    Leaveduration: calculateLeaveDuration(start, end),
    reason: data?.reason || "",
  };
};

export function LeavePlanFormModal({
  open,
  setOpen,
  record,
  onComplete,
  employeeId,
}) {
  const values = useMemo(
    () => getDefaultValues({ ...record, employee: employeeId || record?.employee }),
    [record, employeeId]
  );

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: values,
  });

  const { watch, setValue, handleSubmit, reset } = form;
  const startDate = watch('start');
  const endDate = watch('end');
  const { user } = useAuth();
  const [error, setError] = useState("");
  const { settings } = useSettings();

  useEffect(() => {
    if (startDate && endDate) {
      const duration = calculateLeaveDuration(startDate, endDate);
      setValue('Leaveduration', duration);
    }
  }, [startDate, endDate, setValue]);

  useEffect(() => {
    reset(values);
  }, [reset, values]);

  async function onSubmit(values) {
    try {
      setError("");
  
      // Calculate leaveDuration using the original Date objects
      const Leaveduration = calculateLeaveDuration(values.start, values.end);
  
      // Prepare data for submission
      const data = {
        ...values,
        start: new Date(values.start).toISOString(), // Convert to ISO string
        end: new Date(values.end).toISOString(), // Convert to ISO string
        Leaveduration, // Use the calculated leaveDuration
      };
  
      console.log("Data being sent to backend:", data); // Debugging statement
  
      // Validate leave duration
      if (Leaveduration <= 0) {
        setError("End date must be greater than start date");
        return;
      }
  
      // Check annual leave balance
      if (data.type === "Annual Leave") {
        const employee_data = await pocketbase.collection("users").getOne(data.employee);
        const { remaining } = await calculateRemainingLeaves({
          employee: employee_data,
          joined_at: employee_data.joined_at,
          leaves_per_year: settings?.leaves_per_year,
        });
  
        if (remaining < Leaveduration) {
          setError("You do not have enough annual leaves remaining");
          return;
        }
      }
  
      // Submit data to PocketBase
      const query = record
        ? pocketbase.collection("LeavePlane").update(record.id, data)
        : pocketbase.collection("LeavePlane").create({ ...data, created_by: user.id, status: "pending" });
  
      await query;
      onComplete();
      toast.success(record ? "Leave updated successfully" : "Leave created successfully");
      reset();
      setError("");
      setOpen(false);
    } catch (error) {
      toast.error(error.message);
    }
  }

  const employeesLoader = async ({ search }) => {
    const employees = await pocketbase
      .collection("users")
      .getFullList({
        filter: `name~"${search}"`,
      });
    return employees.map((e) => ({ label: e.names || e.name, value: e.id }));
  };

  const handleReset = () => {
    reset(getDefaultValues({}));
    setError("");
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update leave" : "Create a new leave"}
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "update" : "create"} a leave.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={handleSubmit(onSubmit)}>
            {error && (
              <div className="mb-3 px-2">
                <Alert variant="destructive" className="py-2 mt-3 rounded-[4px] flex items-center">
                  <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                  <AlertTitle className="text-[13px] font-medium !m-0">{error}</AlertTitle>
                </Alert>
              </div>
            )}
            <div className="grid gap-4 px-2">
              <div className="grid gap-2 grid-cols-2">
                <AppFormAsyncSelect
                  form={form}
                  label="Choose employee"
                  placeholder="Choose employee"
                  name="employee"
                  loader={employeesLoader}
                  isDisabled={!!employeeId}
                />
                <AppFormSelect
                  form={form}
                  label="Choose type"
                  placeholder="Enter leave type"
                  name="type"
                  options={["Annual Leave", "Other"].map((e) => ({ 
                    label: capitalizeFirstLetter(e), 
                    value: e 
                  }))}
                />
              </div>
              <div className="grid gap-2 grid-cols-2">
                <AppFormDatePicker
                  form={form}
                  label="Choose start date"
                  placeholder="Choose start date"
                  name="start"
                />
                <AppFormDatePicker
                  form={form}
                  label="Choose end date"
                  placeholder="Choose end date"
                  name="end"
                />
              </div>
              <div className="grid gap-2 grid-cols-2">
                <div>
                  <Controller
                    name="Leaveduration"
                    control={form.control}
                    render={({ field }) => (
                      <div>
                        <label className="text-sm font-medium">Leave Duration (Days)</label>
                        <input
                          {...field}
                          type="number"
                          disabled
                          className="w-full h-10 px-3 text-sm border rounded-md focus:ring-2 focus:ring-blue-500 focus:outline-none bg-gray-50"
                          placeholder="Leave Duration"
                        />
                      </div>
                    )}
                  />
                </div>
                <AppFormTextArea
                  form={form}
                  label="Reason"
                  placeholder="Enter reason for leave"
                  name="reason"
                />
              </div>
            </div>
            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="button"
                  onClick={handleReset}
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
                  {record ? "Update leave" : "Create new leave"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}