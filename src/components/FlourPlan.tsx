import { cn } from "@/utils";
import { useState } from "react";
import Draggable from "react-draggable";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { PencilRuler, Trash2Icon } from "lucide-react";

const FlourPlan = ({
  onSelect,
  selected,
  editMode,
  tables,
  handleEdit,
  handleDelete,
  onEditRequest,
}) => {
  const [activeToDrag, setactiveToDrag] = useState<any>();

  return (
    <div
      onClick={() => setactiveToDrag(undefined)}
      className={cn("pt-6 bg-slate-100 relative h-full overflow-auto p-0", {
        "blue-square-grid-20px": editMode,
      })}
    >
      {tables.map((table, i) => (
        <Draggable
          disabled={!editMode}
          defaultPosition={
            table?.position
              ? {
                  x: table?.position?.x,
                  y: table?.position?.y,
                }
              : undefined
          }
          defaultClassName="w-fit"
          onStop={(_s, dragElement) => {
            handleEdit({
              id: table.id,
              position: { x: dragElement.x, y: dragElement.y },
            });
          }}
          key={i}
        >
          <div>
            <ContextMenu>
              <ContextMenuTrigger disabled={!editMode}>
                <Table
                  isActiveToDrag={activeToDrag === table.code && editMode}
                  onClick={() => setactiveToDrag(table.code)}
                  table={table}
                  onSelect={onSelect}
                  isSelected={selected?.code === table.code}
                  editMode={editMode}
                />
              </ContextMenuTrigger>
              <ContextMenuContent>
                <ContextMenuItem onClick={() => handleDelete(table)}>
                  <PencilRuler size={16} className="mr-2" />
                  <span>Delete Table</span>
                </ContextMenuItem>
                <ContextMenuItem onClick={() => onEditRequest(table)}>
                  <Trash2Icon size={16} className="mr-2" />
                  <span>Update Table</span>
                </ContextMenuItem>
              </ContextMenuContent>
            </ContextMenu>
          </div>
        </Draggable>
      ))}
    </div>
  );
};

export default FlourPlan;

function Table({
  table,
  onClick,
  isActiveToDrag,
  onSelect,
  isSelected,
  editMode,
}) {
  return (
    <div
      className={cn("border-transparent border ", {
        "border-primary w-fit h-fit ": isActiveToDrag,
      })}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
    >
      {table.seats === 8 ? (
        <div className="flex gap-1 no-cursor m-4- cursor-pointer items-center">
          <div className="h-10 w-5 rounded-l-md bg-white border border-slate-200"></div>
          <div className="space-y-1">
            <div className="grid grid-cols-3 px-3 gap-2">
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
            </div>
            <div
              onClick={() =>
                table.status === "available" ? onSelect(table) : {}
              }
              className={cn(
                "h-[70px] cursor w-44 hover:bg-slate-50 py-2 bg-white flex items-center justify-center border rounded-md",
                {
                  "border-blue-500 border-[1.5px] hover:bg-blue-100 bg-blue-100":
                    isSelected,
                }
              )}
            >
              <div
                className={cn(
                  "h-10 text-[12px] uppercase w-10 bg-slate-200 flex items-center justify-center text-slate-500 rounded-full",
                  {
                    "bg-blue-500 text-white": table.status === "available",
                    "bg-slate-500 text-white": table.status === "unavailable",
                    "bg-red-500 text-white": table.status === "reserved",
                    "bg-orange-500 text-white": table.status === "occupied",
                  }
                )}
              >
                {table.code}
              </div>
            </div>
            <div className="grid px-3 grid-cols-3 gap-2">
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
            </div>
          </div>
          <div className="h-10 w-5 rounded-r-md bg-white border border-slate-200"></div>
        </div>
      ) : table.seats === 6 ? (
        <div className="flex gap-1 m-4- cursor-pointer items-center">
          <div className="h-10 w-5 rounded-l-md bg-white border border-slate-200"></div>
          <div className="space-y-1">
            <div className="grid grid-cols-2 px-3 gap-2">
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
            </div>
            <div
              onClick={() =>
                table.status === "available" && !editMode ? onSelect(table) : {}
              }
              className={cn(
                "h-16 w-28  py-2 bg-white flex items-center justify-center border rounded-md",
                {
                  "border-blue-500 border-[1.5px] hover:bg-blue-100 bg-blue-100":
                    isSelected,
                }
              )}
            >
              <div
                className={cn(
                  "h-10 text-[12px] uppercase w-10 bg-slate-200 flex items-center justify-center text-slate-500 rounded-full",
                  {
                    "bg-blue-500 text-white": table.status === "available",
                    "bg-slate-500 text-white": table.status === "unavailable",
                    "bg-red-500 text-white": table.status === "reserved",
                    "bg-orange-500 text-white": table.status === "occupied",
                  }
                )}
              >
                {table.code}
              </div>
            </div>
            <div className="grid px-3 grid-cols-2 gap-2">
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
            </div>
          </div>
          <div className="h-10 w-5 rounded-r-md bg-white border border-slate-200"></div>
        </div>
      ) : table.seats === 4 ? (
        <div className="flex gap-1 m-4- cursor-pointer items-center">
          <div className="h-9 w-5 rounded-l-md bg-white border border-slate-200"></div>
          <div className="space-y-1">
            <div className="grid grid-cols-1 px-3 gap-2">
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
            </div>
            <div
              onClick={() =>
                table.status === "available" && !editMode ? onSelect(table) : {}
              }
              className={cn(
                "h-16 w-16  py-2 bg-white flex items-center justify-center border rounded-md",
                {
                  "border-blue-500 border-[1.5px] hover:bg-blue-100 bg-blue-100":
                    isSelected,
                }
              )}
            >
              <div
                className={cn(
                  "h-10 text-[12px] uppercase w-10 bg-slate-200 flex items-center justify-center text-slate-500 rounded-full",
                  {
                    "bg-blue-500 text-white": table.status === "available",
                    "bg-slate-500 text-white": table.status === "unavailable",
                    "bg-red-500 text-white": table.status === "reserved",
                    "bg-orange-500 text-white": table.status === "occupied",
                  }
                )}
              >
                {table.code}
              </div>
            </div>
            <div className="grid px-3 grid-cols-1 gap-2">
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
            </div>
          </div>
          <div className="h-9 w-5 rounded-r-md bg-white border border-slate-200"></div>
        </div>
      ) : table.seats === 2 ? (
        <div className="flex gap-1 m-4- cursor-pointer items-center">
          <div className="space-y-1">
            <div className="grid grid-cols-1 px-3 gap-2">
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
            </div>
            <div
              onClick={() =>
                table.status === "available" && !editMode ? onSelect(table) : {}
              }
              className={cn(
                "h-16 w-16  py-2 bg-white flex items-center justify-center border rounded-md",
                {
                  "border-blue-500 border-[1.5px] hover:bg-blue-100 bg-blue-100":
                    isSelected,
                }
              )}
            >
              <div
                className={cn(
                  "h-10 text-[12px] uppercase w-10 bg-slate-200 flex items-center justify-center text-slate-500 rounded-full",
                  {
                    "bg-blue-500 text-white": table.status === "available",
                    "bg-slate-500 text-white": table.status === "unavailable",
                    "bg-red-500 text-white": table.status === "reserved",
                    "bg-orange-500 text-white": table.status === "occupied",
                  }
                )}
              >
                {table.code}
              </div>
            </div>
            <div className="grid px-3 grid-cols-1 gap-2">
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
            </div>
          </div>
        </div>
      ) : table.seats === 1 ? (
        <div className="flex gap-1 m-4- cursor-pointer items-center">
          <div className="space-y-1">
            <div className="grid grid-cols-1 px-3 gap-2">
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
            </div>
            <div
              onClick={() =>
                table.status === "available" && !editMode ? onSelect(table) : {}
              }
              className={cn(
                "h-16 w-16  py-2 bg-white flex items-center justify-center border rounded-md",
                {
                  "border-blue-500 border-[1.5px] hover:bg-blue-100 bg-blue-100":
                    isSelected,
                }
              )}
            >
              <div
                className={cn(
                  "h-10 text-[12px] uppercase w-10 bg-slate-200 flex items-center justify-center text-slate-500 rounded-full",
                  {
                    "bg-blue-500 text-white": table.status === "available",
                    "bg-slate-500 text-white": table.status === "unavailable",
                    "bg-red-500 text-white": table.status === "reserved",
                    "bg-orange-500 text-white": table.status === "occupied",
                  }
                )}
              >
                {table.code}
              </div>
            </div>
          </div>
        </div>
      ) : table.seats === 10 ? (
        <div className="flex gap-1 m-4- cursor-pointer items-center">
          <div className="h-10 w-5 rounded-l-md bg-white border border-slate-200"></div>
          <div className="space-y-1">
            <div className="grid grid-cols-4 px-3 gap-2">
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-t-md bg-white border border-slate-200"></div>
            </div>
            <div
              onClick={() =>
                table.status === "available" && !editMode ? onSelect(table) : {}
              }
              className={cn(
                "h-16 w-56  py-2 bg-white flex items-center justify-center border rounded-md",
                {
                  "border-blue-500 border-[1.5px] hover:bg-blue-100 bg-blue-100":
                    isSelected,
                }
              )}
            >
              <div
                className={cn(
                  "h-10 text-[12px] uppercase w-10 bg-slate-200 flex items-center justify-center text-slate-500 rounded-full",
                  {
                    "bg-blue-500 text-white": table.status === "available",
                    "bg-slate-500 text-white": table.status === "unavailable",
                    "bg-red-500 text-white": table.status === "reserved",
                    "bg-orange-500 text-white": table.status === "occupied",
                  }
                )}
              >
                {table.code}
              </div>
            </div>
            <div className="grid px-3 grid-cols-4 gap-2">
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
              <div className="h-5 rounded-b-md bg-white border border-slate-200"></div>
            </div>
          </div>
          <div className="h-10 w-5 rounded-r-md bg-white border border-slate-200"></div>
        </div>
      ) : null}
    </div>
  );
}
