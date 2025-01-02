import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form } from "../ui/form";
import Loader from "../icons/Loader";
import { useForm } from "react-hook-form";
import { useEffect, useMemo } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import { useAuth } from "@/context/auth.context";
import AppFormField from "../forms/AppFormField";
import AppFormSelect from "../forms/AppFormSelect";
import AppFormTextArea from "../forms/AppFormTextArea";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useState } from "react";
import { v4 as uuidv4 } from "uuid";
import { Button } from "@/components/ui/button";

const formSchema = z.object({
  name: z.string().min(1, { message: "Name is required" }),
  feeType: z.string().min(1, { message: "Fee type is required" }),
  description: z.string().min(1, { message: "Description is required" }),
  feesPercentage: z.string(),
  feeRanges: z.array(
    z.object({
      min: z.number(),
      max: z.number(),
      fee: z.number(),
    })
  ),
});

const getDefaultValues = (data?: any) => {
  console.log(data);
  return {
    name: data?.name || "",
    feeType: data?.feeType || "",
    description: data?.description || "",
    feesPercentage: data?.feesPercentage || "",
    feeRanges: data?.feeRanges || [],
  };
};

export function AccountFormModal({ open, setOpen, record, onComplete }: any) {
  const values = useMemo(() => getDefaultValues(record), [record]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  useEffect(() => {
    form.reset();
  }, [record]);

  const { user } = useAuth();

  async function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      ...values,
    };

    const q = !record
      ? pocketbase
          .collection("accounts")
          .create({ ...data, created_by: user.id })
      : pocketbase.collection("accounts").update(record.id, data);

    return q
      .then(async (e) => {
        onComplete();
        toast.error(
          q
            ? "Account type updated succesfully"
            : "Account type created succesfully"
        );
        form.reset();
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update" : "Create a new"} account
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to {record ? "Update" : "Create a new"} account
              type method.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid px-2 gap-2">
              <div className="grid grid-cols-2 gap-2">
                <AppFormField
                  form={form}
                  label={"Enter Name"}
                  name={"name"}
                  placeholder={"Enter name"}
                />{" "}
                <AppFormSelect
                  form={form}
                  label={"Choose fee type"}
                  name={"feeType"}
                  placeholder={"Choose fee type"}
                  options={[
                    { label: "RANGE", value: "RANGE" },
                    { label: "PERCENTAGE", value: "PERCENTAGE" },
                    { label: "NONE", value: "NONE" },
                  ]}
                />
              </div>
              <div>
                {form.watch("feeType") === "PERCENTAGE" && (
                  <>
                    <AppFormField
                      type="number"
                      form={form}
                      label={"Enter Percentage"}
                      name={"feePercentage"}
                      placeholder={"Enter percentage"}
                    />
                  </>
                )}
                {form.watch("feeType") === "RANGE" && (
                  <>
                    <ChargeFeeRangeForm
                      feeRanges={form.watch("feeRanges")}
                      onAddFeeRange={(range: any) => {
                        form.setValue("feeRanges", [
                          ...form.watch("feeRanges"),
                          range,
                        ]);
                      }}
                      onDeleteFeeRange={(index: number) => {
                        form.setValue(
                          "feeRanges",
                          form
                            .watch("feeRanges")
                            .filter((_: any, i) => i !== index)
                        );
                      }}
                    />
                  </>
                )}
              </div>
              <div>
                <AppFormTextArea
                  form={form}
                  label={"Enter description"}
                  name={"description"}
                  placeholder={"Description"}
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
                  {record ? "Update method." : " Create new method"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function ChargeFeeRangeForm({
  onAddFeeRange,
  feeRanges,
  onDeleteFeeRange,
}: any) {
  const [minAmount, setMinAmount] = useState("");
  const [maxAmount, setMaxAmount] = useState("");
  const [fee, setFee] = useState("");

  const handleSubmit = () => {
    const newfeeRanges: any = {
      id: uuidv4(),
      min: parseFloat(minAmount),
      max: parseFloat(maxAmount),
      fee: parseFloat(fee),
    };
    onAddFeeRange(newfeeRanges);
    setMinAmount("");
    setMaxAmount("");
    setFee("");
  };

  return (
    <div className="border h-[200px] overflow-y-auto border-slate-200 rounded-md p-3 mt-4">
      <div className="space-y-4 mb-2">
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Input
              id="minAmount"
              type="number"
              step="0.01"
              className="h-9"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
              placeholder="Max Amount"
            />
          </div>
          <div>
            <Input
              id="maxAmount"
              type="number"
              step="0.01"
              className="h-9"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
              placeholder="Max Amount"
            />
          </div>
          <div>
            <Input
              id="fee"
              type="number"
              step="0.01"
              value={fee}
              onChange={(e) => setFee(e.target.value)}
              className="h-9"
              placeholder="0.00"
            />
          </div>
        </div>
        <Button
          type="button"
          onClick={() => {
            handleSubmit();
          }}
          size="sm"
        >
          Add Fee Range
        </Button>
      </div>

      <Table className="border">
        <TableHeader>
          <TableRow>
            <TableHead>Min Amount</TableHead>
            <TableHead>Max Amount</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>Action</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {feeRanges.map((range, index) => (
            <TableRow key={range?.id}>
              <TableCell>{range?.min?.toFixed(2)} FRW</TableCell>
              <TableCell>{range?.max?.toFixed(2)} FRW</TableCell>
              <TableCell>{range?.fee?.toFixed(2)} FRW</TableCell>
              <TableCell>
                <Button
                  size="sm"
                  type="button"
                  variant="destructive"
                  onClick={() => onDeleteFeeRange(index)}
                >
                  Delete
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
