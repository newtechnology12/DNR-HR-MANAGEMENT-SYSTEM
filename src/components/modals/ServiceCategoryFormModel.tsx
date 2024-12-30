import React, { useEffect, useMemo, useState } from 'react';
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { read, utils } from 'xlsx';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Form } from "@/components/ui/form";
import { Alert, AlertTitle } from "@/components/ui/alert";
import { AlertCircle, Upload } from "lucide-react";
import AppFormField from "../forms/AppFormField";
import Loader from "../icons/Loader";
import pocketbase from "@/lib/pocketbase";
import { toast } from "sonner";

// Define the state type for ErrorBoundary
interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// Define the props type for ErrorBoundary
interface ErrorBoundaryProps {
  children: React.ReactNode;
}

// Error Boundary Component
class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('Form Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <Alert variant="destructive" className="m-4">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Something went wrong!</AlertTitle>
          <p className="text-sm">{this.state.error?.message || 'Please try again or contact support.'}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-2"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            Try Again
          </Button>
        </Alert>
      );
    }

    return this.props.children;
  }
}

const formSchema = z.object({
  serviceName: z.string().min(3, { message: "Service name is required" }),
});

const getDefaultValues = (data?: any) => ({
  serviceName: data?.serviceName || "",
});

function ServiceCategoryFormModal({ open, setOpen, record, onComplete }: any) {
  const [error, setError] = useState<string>("");
  const [isImporting, setIsImporting] = useState(false);

  const values = useMemo(() => getDefaultValues(record), [record]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: values,
  });

  useEffect(() => {
    form.reset(values);
  }, [record, values, form]);

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setIsImporting(true);
      const file = event.target.files?.[0];
      if (!file) return;

      const data = await file.arrayBuffer();
      const workbook = read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = utils.sheet_to_json(worksheet);

      const processedData = jsonData.map((row: any) => ({
        serviceName: row.serviceName || row['Service Name'] || '',
        status: 'pending'
      }));

      await Promise.all(
        processedData.map(data =>
          pocketbase.collection("serviceCategories").create(data)
        )
      );

      toast.success(`Successfully imported ${processedData.length} service categories`);
      onComplete?.();
    } catch (err: any) {
      toast.error(err.message || 'Error importing data');
      setError(err.message || 'Error importing data');
    } finally {
      setIsImporting(false);
    }
  };

  const onSubmit = async (values: z.infer<typeof formSchema>) => {
    try {
      setError("");
      const data = { ...values };

      if (!record) {
        await pocketbase.collection("serviceCategories").create({ ...data, status: "pending" });
        toast.success("Service category created successfully");
      } else {
        await pocketbase.collection("serviceCategories").update(record.id, data);
        toast.success("Service category updated successfully");
      }

      form.reset();
      onComplete?.();
      setOpen(false); // Close modal after successful submission
    } catch (err: any) {
      toast.error(err.message);
      setError(err.message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[650px]">
        <ErrorBoundary>
          <DialogHeader>
            <DialogTitle>
              <span className="text-base px-2 font-semibold py-2">
                {record ? 'Update Service Category' : 'Create a new Service Category'}
              </span>
            </DialogTitle>
            <DialogDescription>
              <span className="px-2 py-0 text-sm text-slate-500 leading-7">
                Fill in the fields or import from Excel to create new service categories.
              </span>
            </DialogDescription>
          </DialogHeader>

          <div className="px-2 mb-4">
            <div className="flex items-center justify-center w-full">
              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed rounded-lg cursor-pointer hover:bg-gray-50">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-8 h-8 mb-2 text-gray-500" />
                  <p className="mb-2 text-sm text-gray-500">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">Excel files (XLSX)</p>
                </div>
                <input 
                  type="file" 
                  className="hidden" 
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                  disabled={isImporting}
                />
              </label>
            </div>
          </div>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-background px-2 text-muted-foreground">Or</span>
            </div>
          </div>

          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)}>
              {error && (
                <div className="mb-3 px-2">
                  <Alert variant="destructive" className="py-2 mt-3- rounded-[4px] flex items-center">
                    <AlertCircle className="h-4 -mt-[5px] mr-3 w-4" />
                    <AlertTitle className="text-[13px] font-medium fon !m-0">
                      {error}
                    </AlertTitle>
                  </Alert>
                </div>
              )}
              
              <div className="grid px-2 gap-2">
                <div className="grid gap-2 grid-cols-1">
                  <AppFormField
                    form={form}
                    label="Service Name"
                    placeholder="Enter Service Name"
                    name="serviceName"
                    type="text"
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
                    disabled={form.formState.isSubmitting || isImporting}
                    className="w-full"
                    size="sm"
                  >
                    {(form.formState.isSubmitting || isImporting) && (
                      <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                    )}
                    {record ? "Update Service Category" : "Create Service Category"}
                  </Button>
                </div>
              </DialogFooter>
            </form>
          </Form>
        </ErrorBoundary>
      </DialogContent>
    </Dialog>
  );
}

export { ServiceCategoryFormModal };
export default ServiceCategoryFormModal;