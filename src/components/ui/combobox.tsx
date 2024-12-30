"use client";

import * as React from "react";
import { Check, ChevronsUpDown } from "lucide-react";

import { cn } from "@/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useQuery } from "react-query";
import { useDebounce } from "react-use";

export function Combobox({
  value,
  placeholder,
  setValue,
  error,
  loadOptions,
  disabled,
  name,
  defaultOptions,
}: any) {
  const [open, setOpen] = React.useState(false);

  const [search, setsearch] = React.useState("");

  const [deboundedSearch, setdeboundedSearch] = React.useState("");

  useDebounce(
    () => {
      setdeboundedSearch(search);
    },
    700,
    [search]
  );

  const optionsQuery = useQuery({
    queryKey: [name, loadOptions, deboundedSearch],
    queryFn: () => loadOptions({ search: deboundedSearch }),
    enabled: Boolean(loadOptions) && open,
  });

  const options: any = optionsQuery.data || defaultOptions || [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger disabled={disabled} asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className={cn(
            "w-full text-slate-500 hover:text-slate-500 font-normal justify-between",
            {
              "border-red-500": error,
            }
          )}
        >
          {value
            ? options.find((framework) => framework.value === value)?.label ||
              placeholder
            : placeholder}
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-full p-0">
        <Command className="w-full">
          <CommandInput
            onValueChange={setsearch}
            value={search}
            placeholder="Search here..."
          />
          <CommandEmpty>No result found.</CommandEmpty>
          <CommandGroup>
            {
              // @ts-ignore
              options.map((option, i) => (
                <CommandItem
                  key={i}
                  value={option.value}
                  onSelect={(currentValue) => {
                    setValue(currentValue === value ? "" : currentValue);
                    setOpen(false);
                  }}
                  className="py-2"
                >
                  <Check
                    className={cn(
                      "mr-2 h-4 w-4",
                      value === option.value ? "opacity-100" : "opacity-0"
                    )}
                  />
                  <span className="text-[13px] text-slate-600 capitalize">
                    {option.label}
                  </span>
                </CommandItem>
              ))
            }
          </CommandGroup>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
