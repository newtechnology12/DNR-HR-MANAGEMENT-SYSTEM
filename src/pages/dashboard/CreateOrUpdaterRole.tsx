import AppFormField from "@/components/forms/AppFormField";
import AppFormSelect from "@/components/forms/AppFormSelect";
import Loader from "@/components/icons/Loader";
import ConfirmModal from "@/components/modals/ConfirmModal";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Form } from "@/components/ui/form";
import { useAuth } from "@/context/auth.context";
import useConfirmModal from "@/hooks/useConfirmModal";
import pocketbase from "@/lib/pocketbase";
import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft } from "react-feather";
import { useForm } from "react-hook-form";
import { useMutation, useQuery } from "react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { z } from "zod";

const formSchema = z.object({
  name: z.string().min(1, { message: "Names is a required field" }),
  status: z.string().min(1, { message: "Status is a required field" }),
  procurement_scope: z.string().min(1, { message: "Choose what this role can see" }),
  hr_scope: z.string().min(1, { message: "Choose whose HR records this role can see" }),
});

const getDefaultValues = (data?: any) => {
  return {
    name: data?.name || "",
    status: data?.status || "active",
    procurement_scope: data?.procurement_scope || "own",
    hr_scope: data?.hr_scope || "own",
  };
};

const basePermissions = [
  {
    parent: "Dashboard",
    children: [
      {
        access: false,
        name: "view_dashboard",
        title: "View dashboard",
      },
    ],
  },
  {
    parent: "Portals",
    children: [
      {
        access: false,
        name: "access_employee_portal",
        title: "Employee portal",
      },
    ],
  },
  {
    parent: "Employee documents",
    children: [
      {
        access: false,
        name: "delete_employee_documents",
        title: "Delete employee documents (staff can never delete their own)",
      },
    ],
  },
  {
    parent: "Leaves",
    children: [
      {
        access: false,
        name: "view_leaves",
        title: "View leaves",
      },
      {
        access: false,
        name: "create_leave",
        title: "Create leave",
      },
      {
        access: false,
        name: "update_leave",
        title: "Update leave",
      },
      {
        access: false,
        name: "manage_leave_policy",
        title: "Manage leave types, public holidays and entitlement rules",
      },
    ],
  },
  {
    parent: "Attendance",
    children: [
      {
        access: false,
        name: "view_attendance_logs",
        title: "View attendance logs",
      },
      {
        access: false,
        name: "create_attendance",
        title: "Create attendance",
      },
      {
        access: false,
        name: "update_attendance",
        title: "Update attendance",
      },
      {
        access: false,
        name: "view_attendace_report",
        title: "view attendance report",
      },
    ],
  },
  {
    parent: "Employee Timesheet",
    children: [
      {
        access: false,
        name: "view_employee_timesheet",
        title: "View employee timesheet",
      },
    ],
  },
  {
    parent: "Employee Perfomance",
    children: [
      {
        access: false,
        name: "view_employee_perfomances",
        title: "View employee perfomance",
      },
      {
        access: false,
        name: "create_employee_perfomance",
        title: "Create employee perfomance",
      },
      {
        access: false,
        name: "update_employee_perfomance",
        title: "Update perfomance",
      },
      {
        access: false,
        name: "evaluate_staff",
        title: "Evaluate colleagues in own department (appraisals)",
      },
      {
        access: false,
        name: "manage_appraisals",
        title: "Manage appraisal templates and cycles, finalise results",
      },
    ],
  },
  {
    parent: "Employees",
    children: [
      {
        access: false,
        name: "view_employees",
        title: "View employees",
      },
      {
        access: false,
        name: "view_employee_profile",
        title: "View employee profile",
      },
      {
        access: false,
        name: "create_employee",
        title: "Create employee",
      },
      {
        access: false,
        name: "update_employee",
        title: "Update employee",
      },
    ],
  },
  {
    parent: "Designations",
    children: [
      {
        access: false,
        name: "view_designations",
        title: "View designations",
      },
      {
        access: false,
        name: "create_designations",
        title: "Create designations",
      },
      {
        access: false,
        name: "update_designations",
        title: "Update designations",
      },
    ],
  },
  {
    parent: "Reports",
    children: [
      {
        access: false,
        name: "view_expense_reports",
        title: "view expenses report",
      },
      {
        access: false,
        name: "view_timesheet_report",
        title: "view timesheet report",
      },
    ],
  },
  {
    parent: "Employee prepayments",
    children: [
      {
        access: false,
        name: "view_employee_prepayments",
        title: "View employee prepayments",
      },
      {
        access: false,
        name: "create_employee_prepayments",
        title: "Create employee prepayments",
      },
      {
        access: false,
        name: "update_employee_prepayments",
        title: "Update employee prepayments",
      },
    ],
  },
  {
    parent: "Departments",
    children: [
      {
        access: false,
        name: "view_departments",
        title: "View departments",
      },
      {
        access: false,
        name: "create_department",
        title: "Create department",
      },
    ],
  },
  {
    parent: "Payrolls",
    children: [
      {
        access: false,
        name: "view_payrolls",
        title: "View payrolls",
      },
      {
        access: false,
        name: "create_payroll",
        title: "Create payroll",
      },
      {
        access: false,
        name: "manage_salaries",
        title: "Edit salary structures and allowances",
      },
      {
        access: false,
        name: "manage_payroll_settings",
        title: "Configure PAYE bands and statutory contributions",
      },
      {
        access: false,
        name: "mark_payroll_paid",
        title: "Record payroll payment (not the preparer)",
      },
      {
        access: false,
        name: "view_payroll_details",
        title: "View payroll detail",
      },
    ],
  },
  {
    parent: "Assets allocation",
    children: [
      {
        access: false,
        name: "view_assets_allocations",
        title: "View assets allocation",
      },
      {
        access: false,
        name: "create_asset_allocation",
        title: "Create asset allocation",
      },
      {
        access: false,
        name: "view_asset_allocation_details",
        title: "View asset allocation detail",
      },
      {
        access: false,
        name: "view_assets_requests",
        title: "View assets requests",
      },
      {
        access: false,
        name: "view_all_assets_requests",
        title: "View all assets requests",
      },
      {
        access: false,
        name: "reject_or_approve_assets_requests",
        title: "Reject or approve assets requests",
      },
    ],
  },
  {
    parent: "General Settings",
    children: [
      {
        access: false,
        name: "access_general_settings",
        title: "General settings",
      },
      {
        access: false,
        name: "import_data",
        title: "Import data",
      },
    ],
  },
  {
    parent: "Assets",
    children: [
      {
        access: false,
        name: "view_assets",
        title: "View assets",
      },
      {
        access: false,
        name: "create_assets",
        title: "Create assets",
      },
      {
        access: false,
        name: "update_assets",
        title: "Update assets",
      },
    ],
  },
  {
    parent: "Expenses",
    children: [
      {
        access: false,
        name: "view_expenses",
        title: "View expenses",
      },
      {
        access: false,
        name: "create_expense",
        title: "Create expense",
      },
      {
        access: false,
        name: "approve_or_reject_expense",
        title: "Approve or reject expense",
      },
    ],
  },
  {
    parent: "Petty Cash Accounts",
    children: [
      {
        access: false,
        name: "view_petty_cash_accounts",
        title: "View petty cash accounts",
      },
      {
        access: false,
        name: "create_petty_cash_account",
        title: "Create petty cash account",
      },
      {
        access: false,
        name: "update_petty_cash_account",
        title: "Update petty cash account",
      },
      {
        access: false,
        name: "view_petty_cash_requests",
        title: "View petty cash requests",
      },
      //approve_or_reject_request
      {
        access: false,
        name: "approve_or_reject_request",
        title: "Approve or reject request",
      },
      {
        access: false,
        name: "refill_accounts",
        title: "Refill accounts",
      },
    ],
  },
  {
    parent: "Assets Categories",
    children: [
      {
        access: false,
        name: "view_assets_categories",
        title: "View assets categories",
      },
      {
        access: false,
        name: "create_assets_category",
        title: "Create assets category",
      },
      {
        access: false,
        name: "update_assets_category",
        title: "Update assets category",
      },
    ],
  },
  // assets types
  {
    parent: "Assets Types",
    children: [
      {
        access: false,
        name: "view_assets_types",
        title: "View assets types",
      },
      {
        access: false,
        name: "create_assets_type",
        title: "Create assets type",
      },
      {
        access: false,
        name: "update_assets_type",
        title: "Update assets type",
      },
    ],
  },
  {
    parent: "Assets",
    children: [
      {
        access: false,
        name: "view_assets",
        title: "View assets",
      },
      {
        access: false,
        name: "create_assets",
        title: "Create assets",
      },
      {
        access: false,
        name: "update_assets",
        title: "Update assets",
      },
    ],
  },
  {
    parent: "Procurement",
    children: [
      {
        access: false,
        name: "view_procurement_dashboard",
        title: "View procurement dashboard",
      },
      {
        access: false,
        name: "view_purchase_requisitions",
        title: "View purchase requisitions",
      },
      {
        access: false,
        name: "create_purchase_requisition",
        title: "Create purchase requisitions",
      },
      {
        access: false,
        name: "manage_approval_workflows",
        title: "Manage approval workflows",
      },
      {
        access: false,
        name: "manage_procurement_settings",
        title: "Manage procurement settings (numbering, categories, units)",
      },
    ],
  },
  {
    parent: "Suppliers & sourcing",
    children: [
      { access: false, name: "view_suppliers", title: "View suppliers" },
      { access: false, name: "manage_suppliers", title: "Add and edit suppliers, contacts and documents" },
      { access: false, name: "approve_suppliers", title: "Approve supplier registrations and reactivate suppliers" },
      { access: false, name: "manage_contracts", title: "Create, submit and terminate procurement contracts" },
      { access: false, name: "evaluate_suppliers", title: "Evaluate supplier performance" },
      { access: false, name: "view_rfqs", title: "View RFQs and quotations" },
      { access: false, name: "manage_rfqs", title: "Create and send RFQs, record quotations" },
      { access: false, name: "award_rfqs", title: "Select the winning supplier" },
    ],
  },
  {
    parent: "Purchase orders & inventory",
    children: [
      { access: false, name: "view_purchase_orders", title: "View purchase orders and receipts" },
      { access: false, name: "manage_purchase_orders", title: "Create, submit, send and close purchase orders" },
      { access: false, name: "receive_goods", title: "Record deliveries (goods receipts / service confirmations)" },
      { access: false, name: "authorize_over_receipt", title: "Accept deliveries above the ordered quantity (within tolerance)" },
      { access: false, name: "amend_purchase_orders", title: "Amend approved purchase orders (re-approval required)" },
      { access: false, name: "manage_procurement_plan", title: "Prepare and submit annual procurement plans" },
      { access: false, name: "view_procurement_reports", title: "View and export procurement reports" },
      { access: false, name: "view_inventory", title: "View warehouses and stock" },
      { access: false, name: "manage_inventory", title: "Manage warehouses, items and stock adjustments" },
    ],
  },
  {
    parent: "Finance: invoices, payments & budgets",
    children: [
      { access: false, name: "view_invoices", title: "View supplier invoices and payments" },
      { access: false, name: "manage_invoices", title: "Record, correct and submit supplier invoices" },
      { access: false, name: "resolve_invoice_exceptions", title: "Resolve three-way match exceptions" },
      { access: false, name: "record_payments", title: "Record supplier payments" },
      { access: false, name: "view_budgets", title: "View budgets and utilisation" },
      { access: false, name: "manage_budgets", title: "Create and change budgets" },
    ],
  },
  {
    parent: "Security",
    children: [
      {
        access: false,
        name: "view_audit_logs",
        title: "View the audit log",
      },
    ],
  },
];

export default function CreateOrUpdaterRole() {
  const { roleId } = useParams();

  const getRole = async () => {
    const role = await pocketbase.collection("roles").getOne(roleId);
    return role;
  };

  const { data: role, status } = useQuery(["roles", roleId], getRole, {
    enabled: Boolean(roleId),
  });

  const values = useMemo(() => getDefaultValues(role), [role]);

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values,
  });

  const resetPermitions = (role) => {
    const newP = basePermissions.map((e) => {
      return {
        ...e,
        children: e.children.map((e) => {
          return {
            ...e,
            access:
              role?.permitions?.find((i) => i.name === e.name)?.access || false,
          };
        }),
      };
    });
    setPermissions(newP);
  };
  useEffect(() => {
    if (role) {
      resetPermitions(role);
    }
  }, [role]);

  const [permissions, setPermissions] = useState(basePermissions);

  const { user } = useAuth();

  const navigate = useNavigate();

  function onSubmit(values: z.infer<typeof formSchema>) {
    const data = {
      ...values,
    };

    const perms = permissions.map((parent) => parent.children).flat();

    return (
      roleId
        ? pocketbase.collection("roles").update(roleId, {
            ...values,
            permitions: perms,
          })
        : pocketbase
            .collection("roles")
            .create({ ...data, permitions: perms, created_by: user.id })
    )
      .then((e) => {
        toast.success("Role created/updated successfully");
        resetPermitions(e);
        navigate(
          `/dashboard/settings/general-settings/roles-permissions/${e.id}`
        );
      })
      .catch((e) => {
        toast.error(e.message);
      });
  }

  useEffect(() => {
    form.reset();
  }, []);

  const deleteMutation = useMutation({
    mutationFn: () => {
      return pocketbase.collection("roles").delete(roleId);
    },
    onSuccess: () => {
      navigate(-1);
      toast.success("You have successfully deleted a role");
      confirmModal.close();
    },
    onError: (error: any) => {
      toast.error(error.message);
    },
  });

  const confirmModal = useConfirmModal();

  return (
    <>
      {" "}
      <div>
        <div className="flex- items-center justify-between">
          <div className="px-3 flex items-center justify-between py-3">
            <Button
              onClick={() => {
                navigate(
                  "/dashboard/settings/general-settings/roles-permissions"
                );
              }}
              size="sm"
              className="gap-3 rounded-full text-primary hover:underline"
              variant="secondary"
            >
              <ArrowLeft size={16} />
              <span>Go back to roles</span>
            </Button>
            <div className="flex items-center gap-2">
              {role && (
                <Button
                  type="submit"
                  onClick={() => confirmModal.setisOpen(true)}
                  disabled={deleteMutation.isLoading}
                  size="sm"
                  variant="destructive"
                >
                  Delete Role
                </Button>
              )}
              <Button
                type="submit"
                onClick={form.handleSubmit(onSubmit)}
                disabled={
                  form.formState.disabled || form.formState.isSubmitting
                }
                size="sm"
              >
                {form.formState.isSubmitting && (
                  <Loader className="mr-2 h-4 w-4 text-white animate-spin" />
                )}
                Save role & permissions
              </Button>
            </div>
          </div>
          <div>
            {status !== "loading" && (
              <div>
                <Form {...form}>
                  <form onSubmit={form.handleSubmit(onSubmit)}>
                    <div className="border-b border-dashed">
                      <div className="grid pb-3 px-4 max-w-3xl gap-2">
                        <div className="grid gap-2 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                          <AppFormField
                            form={form}
                            label={"Roles name"}
                            placeholder={"Enter roles name"}
                            name={"name"}
                          />
                          <AppFormSelect
                            form={form}
                            label={"Status"}
                            placeholder={"Select status"}
                            name={"status"}
                            options={[
                              { label: "Active", value: "active" },
                              { label: "Inactive", value: "inactive" },
                            ]}
                          />
                          <AppFormSelect
                            form={form}
                            label={"Procurement visibility"}
                            placeholder={"Select scope"}
                            name={"procurement_scope"}
                            options={[
                              { label: "Own requests only", value: "own" },
                              { label: "Own department", value: "department" },
                              { label: "Whole organisation", value: "all" },
                            ]}
                          />
                          <AppFormSelect
                            form={form}
                            label={"HR records visibility"}
                            placeholder={"Select scope"}
                            name={"hr_scope"}
                            options={[
                              { label: "Own records only", value: "own" },
                              { label: "Own department", value: "department" },
                              { label: "Whole organisation", value: "all" },
                            ]}
                          />
                        </div>
                      </div>
                      <div className="flex px-4 pb-4 w-full items-center space-x-2">
                        <Checkbox
                          onCheckedChange={(checked) => {
                            const newP: any[] = permissions.map((e) => {
                              return {
                                ...e,
                                children: e.children.map((child) => {
                                  return {
                                    ...child,
                                    access: checked,
                                  };
                                }),
                              };
                            });

                            setPermissions(newP);
                          }}
                          checked={permissions
                            .map((parent) => parent.children)
                            .flat()
                            .every(
                              (item) =>
                                item.hasOwnProperty("access") &&
                                item.access === true
                            )}
                          id={"all"}
                        />
                        <label
                          htmlFor={"all"}
                          className="capitalize font-medium- text-slate-500 text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                        >
                          Allow all permissions
                        </label>
                      </div>
                    </div>
                    <div className="px-5 py-3">
                      <div>
                        <h4 className="text-[12px] font-medium text-slate-500 uppercase">
                          Permitions for this role
                        </h4>
                      </div>
                      <div className="py-4">
                        <div>
                          <div className="grid grid-cols-1 gap-y-5 gap-x-7 sm:grid-cols-2">
                            {permissions.map((permissionP, i) => (
                              <div className="pb-2" key={i}>
                                <div className="flex mb-3 gap-3 items-center">
                                  <h4 className="font-semibold text-sm">
                                    {permissionP.parent}
                                  </h4>
                                </div>
                                <div className="space-y-4 pl-3">
                                  {permissionP.children.map((permission) => {
                                    return (
                                      <div key={permission.name}>
                                        <div className="flex w-full items-center space-x-2">
                                          <Checkbox
                                            onCheckedChange={(checked) => {
                                              const newP: any[] =
                                                permissions.map((e) => {
                                                  if (
                                                    permissionP.parent ===
                                                    e.parent
                                                  ) {
                                                    return {
                                                      ...e,
                                                      children: e.children.map(
                                                        (child) =>
                                                          child.name ===
                                                          permission.name
                                                            ? {
                                                                ...child,
                                                                access: checked,
                                                              }
                                                            : child
                                                      ),
                                                    };
                                                  } else {
                                                    return e;
                                                  }
                                                });

                                              setPermissions(newP);
                                            }}
                                            checked={permission.access}
                                            id={permission.name}
                                          />
                                          <label
                                            htmlFor={permission.name}
                                            className="capitalize font-medium- text-slate-500 text-sm leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                                          >
                                            {permission.title}
                                          </label>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </form>
                </Form>
              </div>
            )}
            {status === "loading" && (
              <div className="w-full h-[400px] flex items-center justify-center">
                <Loader className="mr-2 h-5 w-5 text-primary animate-spin" />
              </div>
            )}
          </div>
        </div>
      </div>
      <ConfirmModal
        title={"Are you sure you want to delete?"}
        description={"This action cannot be undone. This will permanently delete the selected record."}
        meta={confirmModal.meta}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
