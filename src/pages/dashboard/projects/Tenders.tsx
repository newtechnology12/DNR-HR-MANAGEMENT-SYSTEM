import Datatable from "@/components/Datatable";
import { Edit2, Eye, PlusCircle, Sliders } from "react-feather";
import { createColumnHelper } from "@tanstack/table-core";
import { api } from "@/lib/api";
import Button from "@/components/ui/Button";
import { cn } from "@/utils/cn";
import TenderFormPannel from "@/components/pannels/TenderFormPannel";
import { useEditRow } from "@/hooks/useEditRow";
import { useOverlayTriggerState } from "react-stately";
import { useQueryClient } from "react-query";
import { useState } from "react";
import { useViewRow } from "@/hooks/useViewRow";
import TenderModal from "@/components/modals/TenderModal";
import { Link, useNavigate } from "react-router-dom";

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
  {
    pageIndex: page,
    pageSize: page_size,
    query,
    ...rest
  }: {
    pageIndex: number;
    pageSize: number;
    query: string;
    sorting: any;
  },
  { headers }
) {
  const filterObj = {};
  const filters = ["type", "status"];

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
  const { data } = await api.get("/tenders", {
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
  title: string;
  company_name: string;
  applied_from: string;
  created_at: string;
  source: string;
  category: string;
  created_by: string;
  status: string;
}

function truncateInMiddle(str, maxLength) {
  if (str.length <= maxLength) {
    return str; // No need to truncate
  }

  const ellipsis = "...";
  const mid = Math.floor(maxLength / 2);
  const start = str.slice(0, mid - Math.ceil(ellipsis.length / 2));
  const end = str.slice(-mid + Math.floor(ellipsis.length / 2));

  return start + ellipsis + end;
}
const columnHelper = createColumnHelper<Leave>();

const columns = [
  columnHelper.accessor("title", {
    cell: (info) => {
      return (
        <span className="truncate capitalize">
          {truncateInMiddle(info.renderValue(), 30)}
        </span>
      );
    },
    header: () => "Title",
  }),
  columnHelper.accessor("company_name", {
    cell: (info) => {
      return <span className="capitalize truncate">{info.renderValue()}</span>;
    },
    header: () => "Company",
  }),
  columnHelper.accessor("created_by", {
    cell: (info) => {
      const names =
        info.row.original?.created_by["first_name"] +
        " " +
        info.row.original?.created_by["last_name"];
      return (
        <Link
          to={`?show_employee=${info.row.original?.created_by["id"]}`}
          className="capitalize hover:underline truncate"
        >
          {names}
        </Link>
      );
    },
    header: () => "Created by",
  }),
  columnHelper.accessor("source", {
    cell: (info) => (
      <a
        href={info.row.original["link"]}
        target="_blank"
        className="truncate underline hover:text-primary capitalize"
      >
        {info.renderValue()}
      </a>
    ),
    header: () => "Source",
  }),
  columnHelper.accessor("category", {
    cell: (info) => (
      <span className="truncate capitalize">{info.renderValue() || "---"}</span>
    ),
    header: () => "Category",
  }),
  columnHelper.accessor("created_at", {
    cell: (info) => (
      <span className="truncate capitalize">
        {new Date(info.renderValue()).toLocaleDateString("en-US", {
          year: "numeric",
          month: "long",
          day: "numeric",
        })}
      </span>
    ),
    header: () => "Created at",
  }),
  columnHelper.accessor("status", {
    cell: (info) => {
      const getColor = () => {
        switch (info.renderValue()) {
          case "pending":
            return "text-orange-500";
          case "accepted":
            return "text-green-500";
          case "rejected":
            return "text-red-500";
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
          label: "pending",
          value: "pending",
        },
        {
          label: "accepted",
          value: "accepted",
        },
        {
          label: "rejected",
          value: "rejected",
        },
      ],
    },
  }),
  columnHelper.accessor("applied_from", {
    cell: (info) => (
      <span className="truncate capitalize">{info.renderValue()}</span>
    ),
    header: () => "Applied From",
    meta: {
      hidden: true,
    },
  }),
];

const exportFormater = (e) => {
  const obj = e;

  return obj;
};
export default function Projects() {
  const editRow: any = useEditRow();

  const navigate = useNavigate();
  const actions = [
    {
      title: "Manage Tender",
      onClick: (e) => {
        navigate(`/tenders/${e.id}`);
      },
      icon: Sliders,
    },
    {
      title: "View Tender",
      onClick: (e) => {
        view.open(e);
      },
      icon: Eye,
    },
    {
      title: "Edit Tender",
      onClick: (e) => {
        editRow.edit(e);
      },
      icon: Edit2,
    },
  ];
  let performanceFormState = useOverlayTriggerState({});

  const queryClient = useQueryClient();

  const [key, setkey] = useState();

  const view: any = useViewRow();

  return (
    <>
      {" "}
      <div className="px-2">
        <div className="my-1 flex items-center justify-between">
          <div className="space-y-1">
            <h3 className="text-[15px] font-semibold text-slate-700">
              Manage Tenders!!
            </h3>
            <p className="text-[13.5px] leading-7 font-medium text-slate-500">
              Manage all your tenders here, create new tenders, view and edit
              tenders.
            </p>
          </div>
          <div>
            <Button
              onClick={() => {
                performanceFormState.open();
              }}
              LeftIcon={PlusCircle}
              size="sm"
            >
              Create New Tender.
            </Button>
          </div>
        </div>

        <div className="my-4">
          <Datatable
            columns={columns}
            actions={actions}
            exportFormater={exportFormater}
            name="tenders"
            onKeyChange={(e) => setkey(e)}
            loader={fetchData}
          />
        </div>
      </div>{" "}
      <TenderFormPannel
        onComplete={() => {
          queryClient.invalidateQueries({
            queryKey: key,
          });
          editRow.clear();
        }}
        open={performanceFormState.isOpen || editRow.isOpen}
        onClose={() => {
          performanceFormState.close();
          editRow.clear();
        }}
        tender={editRow.row}
      />
      <TenderModal
        open={view.isOpen}
        onClose={() => {
          view.close();
        }}
        tender={view.row}
      />
    </>
  );
}
