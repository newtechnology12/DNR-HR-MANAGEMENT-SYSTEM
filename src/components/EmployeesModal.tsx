import { useMediaQuery } from "@/hooks/use-media-query";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Drawer, DrawerContent } from "@/components/ui/drawer";
import { Search } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import Avatar from "./shared/Avatar";
import { useDebounce } from "react-use";
import React, { useState } from "react";
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";
import Loader from "./icons/Loader";

export function EmployeesModal({ open, setOpen, onSelect }: any) {
  const isDesktop = useMediaQuery("(min-width: 620px)");

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-[425px] !pb-0 !px-0">
          <Employees onSelect={onSelect} />
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerContent className="!px-0">
        <Employees onSelect={onSelect} />
      </DrawerContent>
    </Drawer>
  );
}

function Employees({ onSelect }: any) {
  const [search, setsearch] = useState("");

  const [debouncedSearch, setDebouncedSearch] = React.useState("");

  useDebounce(
    () => {
      setDebouncedSearch(search);
    },
    700,
    [search]
  );

  const employeesQuery = useQuery({
    queryKey: ["users", { search: debouncedSearch }],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = `name~"${debouncedSearch}"`;
      return pocketbase.collection("users").getFullList(
        cleanObject({
          filter: [searchQ].filter((e) => e).join("&&"),
        })
      );
    },
    enabled: true,
  });

  return (
    <div className="px-0">
      <div className="bg-white px-2 pt-3 sm:pt-0 pb-2 border-b">
        <div className="flex relative py-[8px] rounded-[4px] border border-slate-200 px-4 text-slate-600 z-40 bg-slate-100 items-center gap-3 justify-between">
          <input
            placeholder="Search employee here.."
            className="w-full text-sm outline-none bg-transparent"
            type="search"
            onChange={(e) => setsearch(e.target.value)}
            value={search}
          />
          {employeesQuery.isFetching && (
            <Loader className="mr-2 h-4 w-4 text-primary animate-spin" />
          )}

          <Search size={16} />
        </div>
      </div>

      {employeesQuery.status === "loading" && (
        <div className="h-[350px] flex items-center justify-center w-full ">
          <Loader className="mr-2 h-5 w-5 text-primary animate-spin" />
        </div>
      )}
      {employeesQuery.status === "success" && (
        <>
          {employeesQuery.data.length === 0 && (
            <>
              <div className="flex px-4 text-center items-center py-14 justify-center gap-2 flex-col">
                <img className="h-16 w-16" src="/images/customer.png" alt="" />
                <h4 className="font-semibold text-[15px] mt-4">
                  No Employee Found
                </h4>
                <p className="text-[15px] max-w-sm leading-8 text-slate-500">
                  Lorem ipsum dolor, sit amet consectetur adipisicing elit.
                  Vitae temporibus.
                </p>
              </div>
            </>
          )}
          {employeesQuery.data.length !== 0 && (
            <ScrollArea className="sm:h-[300px] h-[500px] w-full rounded-md">
              {employeesQuery.data.map((e, i) => {
                return (
                  <div
                    key={i}
                    onClick={() => onSelect(e)}
                    className="px-3  border-b hover:bg-slate-50 cursor-pointer py-2 sm:py-1"
                  >
                    <div className="flex items-center gap-3">
                      <div>
                        <Avatar path="" name={e.name} />
                      </div>
                      <div className="space-y-[2px]">
                        <h4 className="text-[12.5px] capitalize font-medium">
                          {e.name}
                        </h4>
                        <p className="text-[13px] capitalize text-slate-500">
                          {e.role}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </ScrollArea>
          )}
        </>
      )}
    </div>
  );
}
