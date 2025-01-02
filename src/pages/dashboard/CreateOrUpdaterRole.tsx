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
});

const getDefaultValues = (data?: any) => {
  return {
    name: data?.name || "",
    status: data?.status || "active",
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

    console.log(perms);
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
        toast.success("Role created/updated succesfully");
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
      console.log(error);
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
                        <div className="grid gap-2 grid-cols-3">
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
                        </div>
                      </div>
                      <div className="flex px-4 pb-4 justify-between- w-full items-center space-x-2">
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
                          <div className="grid grid-cols-2- gap-y-5 gap-x-7">
                            {permissions.map((permissionP, i) => (
                              <div className="pb-2" key={i}>
                                <div className="flex mb-3 gap-3 items-center justify-between-">
                                  <h4 className="font-semibold text-sm">
                                    {permissionP.parent}
                                  </h4>
                                </div>
                                <div className="space-y-4 pl-3">
                                  {permissionP.children.map((permission) => {
                                    return (
                                      <div key={permission.name}>
                                        <div className="flex justify-between- w-full items-center space-x-2">
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
        description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet
        a! Nihil`}
        meta={confirmModal.meta}
        onConfirm={() => deleteMutation.mutate()}
        isLoading={deleteMutation.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}
