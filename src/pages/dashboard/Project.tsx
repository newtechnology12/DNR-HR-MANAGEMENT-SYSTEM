import DataTable from "@/components/DataTable";
import { ColumnDef} from "@tanstack/react-table";
import DataTableColumnHeader from "@/components/datatable/DataTableColumnHeader";
import { PlusCircle, CheckCircle, Edit2, Eye, PieChart, X } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import pocketbase from "@/lib/pocketbase";
import { useState } from "react";
import { useQuery, useQueryClient } from "react-query";
import { Button } from "@/components/ui/button";
import useModalState from "@/hooks/useModalState";
import useEditRow from "@/hooks/use-edit-row";
import DataTableRowActions from "@/components/datatable/DataTableRowActions";
import ConfirmModal from "@/components/modals/ConfirmModal";
import useConfirmModal from "@/hooks/useConfirmModal";
import { toast } from "sonner";
import ProjectFormPannel from "@/components/modals/ProjectFormPannel";
import { useAuth } from "@/context/auth.context";
import { cn } from "@/utils/cn";

function clearEmptyValues(obj: any) {
  const newObj = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== "") {
      newObj[key] = obj[key];
    }
  });
  return newObj;
}

async function fetchData({ pageIndex: page, pageSize: page_size, query, ...rest }: any) {
  const filterObj = {};
  const filters = ["status"];
  filters.forEach((item) => {
    if (Object.keys(rest).includes(item) && rest[item]) {
      filterObj[item] = rest[item];
    }
  });
  const params = clearEmptyValues({
    page: page === 0 ? 1 : page,
    page_size,
    query,
    ...filterObj,
  });
  const { items, page: pageCount, totalItems: total } = await pocketbase.collection("projects").getList(page, page_size, {
    filter: params,
  });
  return {
    rows: items,
    pageCount,
    total,
  };
}

interface Project {
  id: number;
  name: string;
  client: string;
  tin_number: string;
  start: string;
  end: string;
  duration: string;
  progress: string;
  status: string;
  description: string;
  project_manager: string;
  project_supervisor: string;
  department_name: string;
  project_type: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

const columns: ColumnDef<Project>[] = [
  {
    accessorKey: "name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Name" />,
    cell: ({ row }) => (
      <div className="w-[80px]- flex items-center gap-2">
        <Link
          to={""}
          className="hover:underline flex items-center gap-2 capitalize hover:text-slate-600"
        >
          {row.getValue("name")}
        </Link>
      </div>
    ),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "tin_number",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Tin number" />,
    cell: ({ row }) => <span className="capitalize truncate">{row.getValue("tin_number")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "start",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Start date" />,
    cell: ({ row }) => (
      <span className="truncate capitalize">
        {new Date(row.getValue("start")).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </span>
    ),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "end",
    header: ({ column }) => <DataTableColumnHeader column={column} title="End date" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("end") || "---"}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "status",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Status" />,
    cell: ({ row }) => {
      const getColor = () => {
        switch (row.getValue("status")) {
          case "on-going":
            return "text-yellow-500";
          case "completed":
            return "text-green-500";
          case "cancelled":
            return "text-orange-500";
        }
      };
      return <span className={cn("capitalize truncate", getColor())}>{row.getValue("status")}</span>;
    },
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "client",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Client" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("client")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "duration",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Duration" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("duration")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "description",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Description" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("description")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "project_manager",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Project Manager" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("project_manager")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "project_supervisor",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Project Supervisor" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("project_supervisor")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "department_name",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Department Name" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("department_name")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "project_type",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Project Type" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("project_type")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "created_by",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Created By" />,
    cell: ({ row }) => <span className="truncate capitalize">{row.getValue("created_by")}</span>,
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "created_at",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Created At" />,
    cell: ({ row }) => (
      <span className="truncate capitalize">
        {new Date(row.getValue("created_at")).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </span>
    ),
    enableSorting: true,
    enableHiding: true,
  },
  {
    accessorKey: "updated_at",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Updated At" />,
    cell: ({ row }) => (
      <span className="truncate capitalize">
        {new Date(row.getValue("updated_at")).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </span>
    ),
    enableSorting: true,
    enableHiding: true,
  },
  {
    id: "actions",
    header: ({ column }) => <DataTableColumnHeader column={column} title="Actions" />,
    cell: ({ row }) => (
      <DataTableRowActions
        actions={[
          {
            title: "View project",
            onClick: () => navigate(`/projects/${row.original.id}`),
            icon: Eye,
          },
          {
            title: "Edit project",
            onClick: () => editRow.edit(row.original),
            icon: Edit2,
            hidden: !["admin", "project-manager"].includes(user.role),
          },
        ]}
        row={row}
      />
    ),
  },
];

export default function Projects() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const formState = useModalState({});
  const editRow = useEditRow();
  const confirmModal = useConfirmModal();
  const [key, setKey] = useState("");

  const { data: analytics } = useQuery(["projects-analytics"], async () => {
    const { items } = await pocketbase.collection("analytics").getList({
      filter: {
        show: ["on-going-projects", "completed-projects", "cancelled-projects"],
      },
    });
    return items;
  }, {
    keepPreviousData: true,
    retry: false,
    staleTime: Infinity,
    enabled: ["admin", "project-manager"].includes(user.role),
  });

  const cards = [
    {
      name: "on going projects",
      title: "On going projects",
      value: analytics ? analytics["on-going-projects"] : "---",
      icon: <PieChart size={15} className="text-orange-600" />,
      increase: 13.5,
      bgLight: "bg-orange-100",
    },
    {
      name: "all completed projects",
      title: "Completed projects",
      value: analytics ? analytics["completed-projects"] || 0 : "---",
      icon: <CheckCircle size={15} className="text-green-500" />,
      increase: 2.4,
      bgLight: "bg-green-100",
    },
    {
      name: "cancled projects",
      title: "Cancled projects",
      value: analytics ? analytics["cancelled-projects"] || 0 : "---",
      icon: <X size={15} className="text-red-500" />,
      increase: -10,
      bgLight: "bg-red-100",
    },
  ];

  const handleDelete = (e) => {
    confirmModal.setIsLoading(true);
    return pocketbase
      .collection("projects")
      .delete(e.id)
      .then(() => {
        queryClient.invalidateQueries("projects");
        confirmModal.close();
        toast.success("Project deleted successfully");
      })
      .catch((error) => {
        confirmModal.setIsLoading(false);
        toast.error(error.message);
      });
  };

  return (
    <>
      <div className="px-2">
        <div className="my-1 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-slate-700">Manage Projects!!</h3>
            <p className="text-[13.5px] leading-7 font-medium text-slate-500">
              Manage all your projects here, you can view, update and delete projects.
            </p>
          </div>
          <div className={cn({ hidden: !["admin", "project-manager"].includes(user.role) })}>
            <Button onClick={formState.open} size="sm">
              <PlusCircle size={16} className="mr-2" />
              Create New Project.
            </Button>
          </div>
        </div>
        <div className={cn({ hidden: !["admin", "project-manager"].includes(user.role) })}>
          <div className="mt-3">
            <div className="grid grid-cols-3 gap-3">
              {cards.map((item, index) => (
                <DashboardCard item={item} key={index} />
              ))}
            </div>
          </div>
        </div>
        <div className="my-4">
          <DataTable
            columns={columns}
            actions={actions}
            exportFormater={(e, original) => {
              const obj = e;
              if (Object.keys(obj).includes("Company")) {
                obj["Company"] = original["name"];
              }
              return obj;
            }}
            name="projects"
            meta={{
              employeeId: user?.id,
              employeeRole: user?.role,
            }}
            loader={fetchData}
            onMainActionClick={() => {}}
            onKeyChange={(e) => setKey(e)}
          />
        </div>
      </div>
      <ProjectFormPannel
        size="lg"
        onComplete={() => {
          queryClient.invalidateQueries({ queryKey: key });
          editRow.clear();
        }}
        open={formState.isOpen || editRow.isOpen}
        onClose={() => {
          formState.close();
          editRow.clear();
        }}
        project={editRow.row}
        user={user}
      />
      <ConfirmModal
        title={"Are you sure you want to delete?"}
        description={`Lorem ipsum dolor sit amet consectetur adipisicing elit. Excepturi, amet a! Nihil`}
        meta={confirmModal.meta}
        onConfirm={handleDelete}
        isLoading={confirmModal.isLoading}
        open={confirmModal.isOpen}
        onClose={() => confirmModal.close()}
      />
    </>
  );
}