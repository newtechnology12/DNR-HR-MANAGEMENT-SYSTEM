import Datatable from "@/components/Datatable";
import {
  CheckCircle,
  Edit2,
  Eye,
  PieChart,
  PlusCircle,
  X,
} from "react-feather";
import { createColumnHelper } from "@tanstack/table-core";
import { api } from "@/lib/api";
import Button from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import DashboardCard from "@/components/cards/DashboardCard";
import { useQuery, useQueryClient } from "react-query";
import ProjectFormPannel from "@/components/pannels/ProjectFormPannel";
import { useOverlayTriggerState } from "react-stately";
import { useState } from "react";
import { useEditRow } from "@/hooks/useEditRow";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/auth.context";
import { useEmployee } from "@/context/employee.context";

function clearEmptyValues(obj: any) {
  const newObj = {};
  Object.keys(obj).forEach((key) => {
    if (obj[key] !== "") {
      newObj[key] = obj[key];
    }
  });
  return newObj;
}

async function fetchData(
  { pageIndex: page, pageSize: page_size, query, ...rest }: any,
  { headers }
) {
  // const meta = rest?.meta;
  const filterObj = {};
  const filters = ["status"];

  // if (meta && !["admin", "project-manager"].includes(meta.employeeRole)) {
  //   filterObj["members__includes"] = meta.employeeId;
  // }

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
  const { data } = await api.get("/projects", {
    params: params,
    headers,
  });
  return {
    rows: data.results,
    pageCount: data.page,
    total: data.total,
  };
}

interface Leave {
  id: number;
  name: any;
  client: any;
  tin_number: any;
  start: string;
  end: string;
  duration: string;
  progress: string;
  status: string;
}

const columnHelper = createColumnHelper<Leave>();

const columns = [
  columnHelper.accessor("name", {
    cell: (info) => {
      return (
        <span className="truncate capitalize">{info.row.original["name"]}</span>
      );
    },
    header: () => "name",
  }),
  columnHelper.accessor("tin_number", {
    cell: (info) => {
      return <span className="capitalize truncate">{info.renderValue()}</span>;
    },
    header: () => "Tin number",
  }),
  columnHelper.accessor("start", {
    cell: (info) => (
      <span className="truncate capitalize">
        {new Date(info.renderValue()).toLocaleDateString("en-US", {
          year: "numeric",
          month: "short",
          day: "numeric",
        })}
      </span>
    ),
    header: () => "Start date",
  }),
  columnHelper.accessor("end", {
    cell: (info) => (
      <span className="truncate capitalize">{info.renderValue() || "---"}</span>
    ),
    header: () => "End date",
  }),
  columnHelper.accessor("status", {
    cell: (info) => {
      const getColor = () => {
        switch (info.row.original.status) {
          case "on-going":
            return "text-yellow-500";
          case "completed":
            return "text-green-500";
          case "cancelled":
            return "text-orange-500";
        }
      };
      return (
        <span className={cn("capitalize truncate", getColor())}>
          {info.renderValue()}
        </span>
      );
    },
    header: () => "Status",
    meta: {
      allowFiltering: true,
      filterType: "select",
      filterOptions: [
        {
          label: "On going",
          value: "on-going",
        },
        {
          label: "Completed",
          value: "completed",
        },
        {
          label: "Cancelled",
          value: "cancelled",
        },
      ],
    },
  }),

  columnHelper.accessor("client", {
    cell: (info) => (
      <span className="truncate capitalize">{info.renderValue()}</span>
    ),
    header: () => "client",
  }),
  columnHelper.accessor("duration", {
    cell: (info) => (
      <span className="truncate capitalize">{info.renderValue()}</span>
    ),
    header: () => "Duration",
  }),
];

const exportFormater = (e, original) => {
  const obj = e;
  if (Object.keys(obj).includes("Company")) {
    obj["Company"] = original["name"];
  }
  return obj;
};
export default function Projects() {
  const { user } = useAuth();
  async function fetchAnalytics() {
    const { data } = await api.get("/analytics", {
      params: {
        show: ["on-going-projects", "completed-projects", "cancelled-projects"],
      },
    });
    return data;
  }
  const { data: analytics } = useQuery(["projects-analytics"], fetchAnalytics, {
    keepPreviousData: true,
    retry: false,
    staleTime: Infinity,
    enabled: ["admin", "project-manager"].includes(user.role),
  });
  const editRow: any = useEditRow();

  const navigate = useNavigate();

  const actions = [
    {
      title: "View project",
      onClick: (e) => {
        navigate(`/projects/${e.id}`);
      },
      icon: Eye,
    },
    {
      hidden: !["admin", "project-manager"].includes(user.role),
      title: "Edit project",
      onClick: (e) => {
        editRow.edit(e);
      },
      icon: Edit2,
    },
  ];

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

  let formState = useOverlayTriggerState({});

  const queryClient = useQueryClient();

  const { employee } = useEmployee();

  const [key, setkey] = useState();
  return (
    <>
      <div className="px-2">
        <div className="my-1 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-slate-700">
              Manage Projects!!
            </h3>
            <p className="text-[13.5px] leading-7 font-medium text-slate-500">
              Manage all your projects here, you can view, update and delete
              projects.
            </p>
          </div>
          {/* {user.role} */}
          <div
            className={cn({
              hidden: !["admin", "project-manager"].includes(user.role),
            })}
          >
            <Button
              onClick={() => {
                formState.open();
              }}
              LeftIcon={PlusCircle}
              size="sm"
            >
              Create New Project.
            </Button>
          </div>
        </div>
        <div
          className={cn({
            hidden: !["admin", "project-manager"].includes(user.role),
          })}
        >
          {" "}
          <div className="mt-3">
            <div className="grid grid-cols-3 gap-3">
              {cards.map((item, index) => {
                return <DashboardCard item={item} key={index} />;
              })}
            </div>
          </div>
        </div>

        <div className="my-4">
          <Datatable
            columns={columns}
            actions={actions}
            exportFormater={exportFormater}
            name="projects"
            meta={{
              employeeId: employee?.id,
              employeeRole: user?.role,
            }}
            loader={fetchData}
            onMainActionClick={() => {}}
            onKeyChange={(e) => setkey(e)}
          />
        </div>
      </div>
      <ProjectFormPannel
        size="lg"
        onComplete={() => {
          queryClient.invalidateQueries({
            queryKey: key,
          });
          editRow.clear();
        }}
        open={formState.isOpen || editRow.isOpen}
        onClose={() => {
          formState.close();
          editRow.clear();
        }}
        project={editRow.row}
      />
    </>
  );
}
