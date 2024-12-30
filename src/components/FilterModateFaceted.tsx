/* eslint-disable @typescript-eslint/no-explicit-any */
import { Button } from "@/components/ui/button";
import { cn } from "@/utils";
import { useEffect, useState } from "react";
import { CheckIcon } from "@radix-ui/react-icons";
import LoaderIcon from "./icons/Loader";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useDebounce, useSet } from "react-use";
import { CgClose } from "react-icons/cg";
import { useQuery } from "react-query";
import pocketbase from "@/lib/pocketbase";
import cleanObject from "@/utils/cleanObject";

export default function FilterModateFaceted({
  type,
  setFilter,
  filter,
}: {
  type: "waiter" | "table";
  setFilter: any;
  filter: any
}) {
  const [open, setopen] = useState(false);
  const [set, { add, has, remove, reset }] = useSet(
    new Set(filter[type] || [])
  );

  useEffect(()=>{
    setFilter((prev: any) => {
      return {
        ...prev,
        [type]: [...Array.from(set)],
      };
    });
  },[set.size])

 
  const count = set.size;
  const title =
    type === "waiter" ? "Filter Based on Waiter" : "Filter Based on Table";
  const [search, setsearch] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useDebounce(
    () => {
      setDebouncedSearch(search);
    },
    700,
    [search]
  );
  const getAllOption = useQuery({
    queryKey: ["getAllOption", { search: debouncedSearch }, { type: type }],
    keepPreviousData: true,
    queryFn: () => {
      const searchQ = `name~"${debouncedSearch}"`;
      if (type === "waiter")
        return pocketbase.collection("users").getFullList(
          cleanObject({
            filter: `role = "waiter"&&${[searchQ].filter((e) => e).join("&&")}`,
          })
        );
      return pocketbase.collection("tables").getFullList(
        cleanObject({
          filter: `${[searchQ].filter((e) => e).join("&&")}`,
        })
      );
    },
    enabled: open,
  });

  const isLoading = getAllOption.isLoading;
  const options = getAllOption.data?.map((e) => ({
    label: e.name,
    value: e.name,
  }));
  const handleSelect = (option, isSelected) => {
    console.log(option);
    if (isSelected) {
      remove(option.value);
    } else {
      add(option.value);
    }
  };
  return (
    <div className="flex flex-col gap-2">
      <span className="text-xs leading-none">Choose the {type}:</span>
      <div className="relative">
        {count > 0 && (
          <span className="bg-primary text-white text-[10px] absolute right-0 rounded-full flex items-center justify-center w-4 h-4 -top-2">
            {count}
          </span>
        )}
        <Popover open={open} onOpenChange={setopen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              size="sm"
              className={cn({
                "h-8 border-dashed w-full text-sm capitalize": true,
                "border-primary": count > 0,
              })}
            >
              {type}
            </Button>
          </PopoverTrigger>

          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <div className="flex items-center gap-2 w-full">
                <div className="!w-full flex-1">
                  <CommandInput placeholder={title} />
                </div>
                {isLoading && (
                  <LoaderIcon className="mr-2 h-4 w-4 text-black animate-spin" />
                )}
              </div>
              {isLoading ? (
                <p className="text-gray-500 p-2 bg-gray-50 text-[13px] font-medium py-3 rounded-sm css-1xwp231-LoadingMessage2 text-center">
                  Loading...
                </p>
              ) : (
                <CommandList>
                  <>
                    <CommandEmpty>No results found.</CommandEmpty>
                    <CommandGroup>
                      {options?.map((option, i) => {
                        const isSelected = has(option.value);
                        return (
                          <CommandItem
                            className="py-2"
                            key={i}
                            onSelect={() => {
                              handleSelect(option, isSelected);
                            }}
                          >
                            <div
                              className={cn(
                                "mr-2 flex h-4 w-4 text-slate-500 font-medium items-center justify-center rounded-sm border border-slate-400",
                                isSelected
                                  ? "bg-primary border-primary text-white"
                                  : "opacity-50 [&_svg]:invisible"
                              )}
                            >
                              <CheckIcon className={cn("h-3 w-3")} />
                            </div>
                            <span className="font-medium capitalize text-[12.5px]">
                              {option.label}
                            </span>
                          </CommandItem>
                        );
                      })}
                    </CommandGroup>
                  </>

                  {set.size > 0 && (
                    <>
                      <CommandSeparator />
                      <CommandGroup>
                        <CommandItem
                          onSelect={() => reset()}
                          className="justify-center text-slate-600 text-[13px] font-medium text-center"
                        >
                          Clear filters
                        </CommandItem>
                      </CommandGroup>
                    </>
                  )}
                </CommandList>
              )}
            </Command>
          </PopoverContent>
        </Popover>
        {set.size > 0 && (
          <div className="flex gap-1 flex-wrap mt-1">
            {[...set].map((option: any, i) => {
              return (
                <button
                  key={i}
                  className="inline-flex items-center outline-none border py-0.5 text-xs transition-colors focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 dark:border-slate-800 dark:focus:ring-slate-300 border-transparent bg-slate-100 text-slate-900 hover:bg-slate-100/80 dark:bg-slate-800 dark:text-slate-50 dark:hover:bg-slate-800/80 rounded-sm capitalize px-1 font-normal"
                >
                  {option}
                  <CgClose className="ml-2" onClick={() => remove(option)} />
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
