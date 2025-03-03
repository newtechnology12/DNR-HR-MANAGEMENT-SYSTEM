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
import AppFormField from "../forms/AppFormField";
import { useForm } from "react-hook-form";
import { useEffect, useMemo, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";
import AppFormTextArea from "../forms/AppFormTextArea";
import { useAuth } from "@/context/auth.context";
import AppFormAsyncSelect from "../forms/AppFormAsyncSelect";
import cleanObject from "@/utils/cleanObject";
import AppFileUpload from "../forms/AppFileUpload";
import { Alert, AlertTitle } from "../ui/alert";
import { AlertCircleIcon } from "lucide-react";

// Define form schema using Zod for validation
const formSchema = z.object({
  employee: z.string().min(1, { message: "Employee is Required" }),
  expenseCategory: z.string().min(1, "Expense category is required"),
  amount: z.string().min(1, { message: "Amount is required" }),
  date: z.date(),
  description: z.string().optional(),
  momoNumber: z.string().optional(),
  momoName: z.string().optional(),
  attachment: z.any().optional(),
  account: z.string().min(1, { message: "Account is required" }),
});

// Helper function to get default form values
const getDefaultValues = (data?: any) => ({
  employee: data?.employee || "",
  expenseCategory: data?.expenseCategory || "",
  date: data?.date ? new Date(data.date) : new Date(),
  momoNumber: data?.momoNumber || "",
  momoName: data?.momoName || "",
  amount: data?.amount?.toString() || "",
  description: data?.description || "",
  attachment: data?.attachment || undefined,
  account: data?.account || "",
});

export function PrepaymentFormModal({
  open,
  setOpen,
  record,
  onComplete,
  employeeId,
}: any) {
  const { user } = useAuth();
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [insufficientFunds, setInsufficientFunds] = useState(false);
  const [accountOptions, setAccountOptions] = useState([]);
  const [error, setError] = useState("");

  const values = useMemo(
    () => getDefaultValues({ ...record, employee: employeeId || record?.employee }),
    [record, employeeId]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  // Load initial account details when form opens
  useEffect(() => {
    const loadInitialAccount = async () => {
      if (record?.account) {
        try {
          const accountRecord = await pocketbase.collection("accounts").getOne(record.account);
          setSelectedAccount(accountRecord);
        } catch (error) {
          console.error("Failed to load account details:", error);
        }
      }
    };

    if (open) {
      loadInitialAccount();
    }
  }, [open, record]);

  // Reset form and state when record changes
  useEffect(() => {
    form.reset(values);
    setInsufficientFunds(false);
    if (!record) {
      setSelectedAccount(null);
    }
  }, [record, form, values, open]);

  // Fetch accounts for the dropdown when the form opens
  useEffect(() => {
    if (open) {
      pocketbase
        .collection("accounts")
        .getFullList()
        .then((accounts) => {
          const options = accounts.map((account) => ({
            label: account.name, // Only show account name without balance
            value: account.id,
            original: account,
          }));
          setAccountOptions(options);
          if (form.getValues().account && !selectedAccount) {
            const matchingAccount = accounts.find(acc => acc.id === form.getValues().account);
            if (matchingAccount) {
              setSelectedAccount(matchingAccount);
            }
          }
        })
        .catch((error) => {
          console.error("Failed to load accounts:", error);
          setError("Failed to load accounts. Please try again.");
        });
    }
  }, [open, form, selectedAccount]);

  // Watch for changes in amount or account to validate funds
  useEffect(() => {
    const subscription = form.watch((value, { name }) => {
      if (name === "amount" || name === "account") {
        setInsufficientFunds(false);
        const currentAmount = parseFloat(form.getValues().amount || "0");
        const currentAccount = selectedAccount;
        if (currentAccount && currentAmount > 0) {
          setInsufficientFunds(currentAmount > currentAccount.currentBalance);
        }
      }
    });
    return () => subscription.unsubscribe();
  }, [form, selectedAccount]);

  // Handle form submission with validation
  const validateAndSubmit = async (values: z.infer<typeof formSchema>) => {
    let accountToCheck = selectedAccount;
    if (!accountToCheck && values.account) {
      try {
        accountToCheck = await pocketbase.collection("accounts").getOne(values.account);
        setSelectedAccount(accountToCheck);
      } catch (error) {
        setError("Failed to validate account balance. Please try again.");
        return;
      }
    }
    const amountValue = parseFloat(values.amount);
    if (accountToCheck && amountValue > accountToCheck.currentBalance) {
      setInsufficientFunds(true);
      return;
    }
    onSubmit(values);
  };

  // Submit form data
  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    const data = {
      ...values,
      employee: values.employee,
    };
    setError("");
    setInsufficientFunds(false);

    try {
      const q = !record
        ? pocketbase.collection("prepayments").create({
            ...data,
            created_by: user?.id,
            status: "pending",
          })
        : pocketbase.collection("prepayments").update(record.id, { ...data });

      await q;
      onComplete();
      toast.success(record ? "Payment updated successfully" : "Payment created successfully");
      form.reset();
      setSelectedAccount(null);
    } catch (e) {
      setError(e.message);
      toast.error(e.message);
    }
  };

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

  // Reset form and state when dialog closes
  const handleDialogClose = (newOpen) => {
    if (!newOpen) {
      form.reset();
      setError("");
      setInsufficientFunds(false);
      setSelectedAccount(null);
    }
    setOpen(newOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-[650px]">
        <DialogHeader>
          <DialogTitle>
            <span className="text-base px-2 font-semibold py-2">
              {record ? "Update" : employeeId ? "Apply for a" : "Create"} Expense
            </span>
          </DialogTitle>
          <DialogDescription>
            <span className="px-2 py-0 text-sm text-slate-500 leading-7">
              Fill in the fields to create a new expense.
            </span>
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(validateAndSubmit)}>
            {error && (
              <div className="mb-3 px-2">
                <Alert variant="destructive" className="py-2 mt-3- rounded-[4px] flex items-center">
                  <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                  <AlertTitle className="text-[13px] font-medium fon !m-0">{error}</AlertTitle>
                </Alert>
              </div>
            )}
            {insufficientFunds && (
              <div className="mb-3 px-2">
                <Alert variant="destructive" className="py-2 mt-3- rounded-[4px] flex items-center">
                  <AlertCircleIcon className="h-4 -mt-[5px] mr-3 w-4" />
                  <AlertTitle className="text-[13px] font-medium fon !m-0">
                    Sorry, the selected account has insufficient balance for this request.
                  </AlertTitle>
                </Alert>
              </div>
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
                <AppFormField
                  form={form}
                  label={"Momo Number"}
                  placeholder={"Enter momo number"}
                  name={"momoNumber"}
                />
                <AppFormField
                  form={form}
                  label={"Momo Name"}
                  placeholder={"Enter momo name"}
                  name={"momoName"}
                />
                <AppFormField
                  form={form}
                  type="number"
                  label={"Amount"}
                  placeholder={"Enter amount"}
                  name={"amount"}
                  onChange={(e) => {
                    form.setValue("amount", e.target.value);
                    if (selectedAccount) {
                      const currentAmount = parseFloat(e.target.value || "0");
                      setInsufficientFunds(currentAmount > selectedAccount.currentBalance);
                    }
                  }}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <AppFormAsyncSelect
                  form={form}
                  name={"expenseCategory"}
                  label={`Choose expense category`}
                  placeholder={`Choose expense category`}
                  loader={({ search }) => {
                    return pocketbase
                      .collection("expenses_categories")
                      .getFullList({
                        filter: search ? `name~"${search}"` : "",
                      })
                      .then((e) => e.map((e) => ({ label: e.name, value: e.id })));
                  }}
                />
                <AppFormAsyncSelect
                  form={form}
                  name={"account"}
                  label={"Choose account"}
                  placeholder={"Choose account"}
                  defaultOptions={accountOptions}
                  defaultValue={record?.account ? accountOptions.find(opt => opt.value === record.account) : null}
                  loader={({ search }) => {
                    return pocketbase
                      .collection("accounts")
                      .getFullList({
                        filter: search ? `name~"${search}"` : "",
                      })
                      .then((accounts) => {
                        // Remove balance from the label in the dropdown options
                        const options = accounts.map((account) => ({
                          label: account.name, // Only show the account name
                          value: account.id,
                          original: account,
                        }));
                        setAccountOptions(options);
                        return options;
                      });
                  }}
                  onChange={(option) => {
                    if (option) {
                      // Update the selected account state
                      setSelectedAccount(option.original);
                      // Set the form value for the account field
                      form.setValue("account", option.value);
                      // Check if the selected account has sufficient balance
                      const currentAmount = parseFloat(form.getValues().amount || "0");
                      setInsufficientFunds(currentAmount > option.original.currentBalance);
                    } else {
                      // Clear the selected account state if no option is selected
                      setSelectedAccount(null);
                      form.setValue("account", "");
                      setInsufficientFunds(false);
                    }
                  }}
                />
              </div>
              {selectedAccount && (
                <div className="px-1 text-sm">
                  <span className="font-medium">Funds Status: </span>
                  <span className={`${
                    parseFloat(form.getValues().amount || "0") > selectedAccount.currentBalance 
                      ? "text-red-500" 
                      : "text-green-500"
                  } font-semibold`}>
                    {parseFloat(form.getValues().amount || "0") > selectedAccount.currentBalance 
                      ? "Insufficient" 
                      : "Available"}
                  </span>
                </div>
              )}
              <div>
                <AppFormTextArea
                  form={form}
                  label={"Description"}
                  placeholder={"Enter description"}
                  name={"description"}
                />
              </div>
              <AppFileUpload
                form={form}
                label={"Drag & Drop attachment file here"}
                name={"attachment"}
                preview={pocketbase.files.getUrl(record, record?.attachment)}
              />
            </div>
            <DialogFooter>
              <div className="mt-6 flex items-center gap-2 px-2 pb-1">
                <Button
                  type="button"
                  onClick={() => {
                    form.reset();
                    setError("");
                    setInsufficientFunds(false);
                    setSelectedAccount(null);
                  }}
                  className="w-full text-slate-600"
                  size="sm"
                  variant="outline"
                >
                  Reset Form
                </Button>
                <Button
                  type="submit"
                  disabled={form.formState.disabled || form.formState.isSubmitting || insufficientFunds}
                  className="w-full"
                  size="sm"
                >
                  {form.formState.isSubmitting && (
                    <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                  )}
                  {record ? "Update expense" : "Create new expense"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}