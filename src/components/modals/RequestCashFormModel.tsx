'use client';

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Loader } from 'lucide-react';
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import AppFormSelect from "@/components/forms/AppFormSelect";
import AppFormTextArea from "@/components/forms/AppFormTextArea";
import { CashRequestFormSchema } from "@/utils/cash-request-schema";
import pocketbase from "@/lib/pocketbase";
import { AppFormCurrencyInput } from "../forms/AppFormCurrencyInput";
import AppFormDatePicker from "../forms/AppFormDatepicker";
import AppFormField from "../forms/AppFormField";
import AppFileUpload from "../forms/AppFileUpload";
import { useAuth } from "@/context/auth.context";

type CashRequestFormModalProps = {
  open: boolean;
  setOpen: (open: boolean) => void;
  record?: any;
  onComplete: () => void;
};

const expenseCategories = [
  { label: "Travel", value: "travel" },
  { label: "Office Supplies", value: "office_supplies" },
  { label: "Meals and Entertainment", value: "meals_entertainment" },
  { label: "Utilities", value: "utilities" },
  { label: "Communication", value: "communication" },
  { label: "Transport", value: "transportation" },
  { label: "Commission and Fees", value: "commission_fees" },
  { label: "Professional Services", value: "professional_services" },
  { label: "Marketing and Advertising", value: "marketing_advertising" },
  { label: "Insurance", value: "insurance" },
  { label: "Salaries and Wages", value: "salaries_wages" },
  { label: "Rent and Lease", value: "rent_lease" },
  { label: "Repairs and Maintenance", value: "repairs_maintenance" },
  { label: "Training and Education", value: "training_education" },
  { label: "Subscriptions and Licenses", value: "subscriptions_licenses" },
  { label: "Equipment and Furniture", value: "equipment_furniture" },
  { label: "Depreciation", value: "depreciation" },
  { label: "Taxes and Dues", value: "taxes_dues" },
  { label: "Bank Charges", value: "bank_charges" },
  { label: "Gifts and Donations", value: "gifts_donations" },
  { label: "Airtime", value: "airtime" },
  { label: "Internet Subscription", value: "internet_subscription" },
  { label: "Tender", value: "tender" },
  { label: "Inyange Water", value: "inyange_water" },
  { label: "Gibu WANTE", value: "gibu_wante" },
  { label: "Other", value: "other" },
];

const paymentMethods = [
  { label: "Cash", value: "cash" },
  { label: "Mobile Money", value: "mobile_money" },
];

export default function CashRequestFormModal({ open, setOpen, record, onComplete }: CashRequestFormModalProps) {
  const { user } = useAuth(); // Get logged-in user info
  const [department, setDepartment] = useState(null);
  const values = useMemo(() => getDefaultValues(record, user, department), [record, user, department]);
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState(values.paymentMethod);

  const form = useForm<z.infer<typeof CashRequestFormSchema>>({
    resolver: zodResolver(CashRequestFormSchema),
    defaultValues: values,
  });

  useEffect(() => {
    async function fetchDepartment() {
      try {
        // Fetch user information to get the department name
        const userResponse = await pocketbase.collection("users").getOne(user.id);
        const departmentName = userResponse.department;

        // Fetch department information based on the department name
        const departmentResponse = await pocketbase.collection("departments").getList(1, 1, {
          filter: `name="${departmentName}"`,
        });

        if (departmentResponse.items.length > 0) {
          setDepartment(departmentResponse.items[0]);
        }
      } catch (error) {
        toast.error("Failed to load department information");
      }
    }

    fetchDepartment();
  }, [user]);

  useEffect(() => {
    form.reset(values);
  }, [form, values]);

  async function onSubmit(values: z.infer<typeof CashRequestFormSchema>) {
    try {
      const data = {
        ...values,
        employeeName: user.id, // Submit only the user id
        department: department?.id, // Submit only the department id
        date: new Date(values.date).toISOString(),
        status: record ? record.status : "pending",
        approvalStage: record ? record.approvalStage : "initiated",
        preparedBy: user.id,
        departmentManagerApproval: null,
        financeApproval1: null,
        financeApproval2: null,
      };

      if (record) {
        await pocketbase.collection("cashRequests").update(record.id, data);
        toast.success("Request updated successfully");
      } else {
        await pocketbase.collection("cashRequests").create(data);
        toast.success("Request created successfully");
      }

      onComplete();
      form.reset();
      setOpen(false);
    } catch (error) {
      toast.error(error.message);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[700px]">
        <DialogHeader>
          <DialogTitle>
            {record ? "Update Cash Request" : "Create New Cash Request"}
          </DialogTitle>
          <DialogDescription>
            Please fill in the details for your cash request. All fields are required unless marked as optional.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {step === 1 && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AppFormField
                    form={form}
                    name="employeeName"
                    label="Employee Name"
                    value={user.names}
                    placeholder={user.names}
                    disabled
                  />
                  <AppFormField
                    form={form}
                    name="department"
                    label="Department"
                    value={department?.name}
                    placeholder={department?.name}
                    disabled
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AppFormSelect
                    form={form}
                    name="expenseCategory"
                    label="Expense Category"
                    placeholder="Select category"
                    options={expenseCategories}
                  />
                  <AppFormCurrencyInput
                    form={form}
                    name="totalAmount"
                    label="Total Amount"
                    placeholder="Enter amount"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <AppFormDatePicker
                    form={form}
                    name="date"
                    label="Request Date"
                    placeholder="Select date"
                  />
                  <AppFormSelect
                    form={form}
                    name="paymentMethod"
                    label="Payment Method"
                    placeholder="Select payment method"
                    options={paymentMethods}
                    onChange={(value) => setPaymentMethod(value)}
                  />
                </div>
                <Button type="button" onClick={() => setStep(2)}>
                  Next
                </Button>
              </>
            )}
            {step === 2 && (
              <>
                <AppFormField
                  form={form}
                  name="momoNumber"
                  label="Mobile Money Number or momo code"
                  placeholder="Enter your mobile money number or momo code"
                />
                <AppFormField
                  form={form}
                  name="momoName"
                  label="Mobile Money Account Name"
                  placeholder="Enter the name registered with this mobile money account"
                />
                <AppFormTextArea
                  form={form}
                  name="additionalInfo"
                  label="Additional Information"
                  placeholder="Any other relevant details (optional)"
                />
                <AppFormField
                  form={form}
                  name="particularly"
                  label="Particularly"
                  placeholder="Enter particularly"
                />
                <AppFormField
                  form={form}
                  name="description"
                  label="Description"
                  placeholder="Enter description"
                />
                <Button type="button" onClick={() => setStep(3)}>
                  Next
                </Button>
                <Button type="button" variant="outline" onClick={() => setStep(1)}>
                  Back
                </Button>
              </>
            )}
            {step === 3 && (
              <>
                <AppFormField
                  form={form}
                  name="preparedBy"
                  label="Initiated By"
                  value={user.names}
                  placeholder={user.names}
                  disabled
                />
                <AppFormField
                  form={form}
                  name="verifiedBy"
                  label="Verified By"
                  placeholder="Pending to be verified by Finance"
                  disabled
                />
                <AppFormField
                  form={form}
                  name="approvedBy"
                  label="Approved By"
                  placeholder="Pending to be verified by Finance"
                  disabled
                />
                <AppFileUpload
                  form={form}
                  name="attachment"
                  label="Attachment"
                />
                <DialogFooter>
                  <Button type="button" variant="outline" onClick={() => setStep(2)}>
                    Back
                  </Button>
                  <Button type="submit" disabled={form.formState.isSubmitting}>
                    {form.formState.isSubmitting && (
                      <Loader className="mr-2 h-4 w-4 animate-spin" />
                    )}
                    {record ? "Update Request" : "Submit Request"}
                  </Button>
                </DialogFooter>
              </>
            )}
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

function getDefaultValues(data?: any, user?: any, department?: any) {
  return {
    employeeName: user?.names || data?.employeeName || "",
    department: department?.name || data?.department || "",
    expenseCategory: data?.expenseCategory || "",
    totalAmount: data?.totalAmount || 0,
    date: data?.date ? new Date(data.date) : new Date(),
    paymentMethod: data?.paymentMethod || "",
    additionalInfo: data?.additionalInfo || "",
    momoNumber: data?.momoNumber || "",
    momoName: data?.momoName || "",
    particularly: data?.particularly || "",
    description: data?.description || "",
    preparedBy: user?.names || data?.preparedBy || "",
    verifiedBy: data?.verifiedBy || "",
    approvedBy: data?.approvedBy || "",
    attachment: data?.attachment || null,
  };
}