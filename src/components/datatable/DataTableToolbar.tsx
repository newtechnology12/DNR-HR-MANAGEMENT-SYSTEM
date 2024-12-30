"use client";

import { Cross2Icon } from "@radix-ui/react-icons";
import { Table } from "@tanstack/react-table";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

import { DataTableFacetedFilter } from "./DataTableFacetedFilter";
import { DataTableViewOptions } from "./DataTableViewOptions";
import { Fragment, useState } from "react";
import { useDebounce } from "react-use";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  facets;
  onSearch;
  Action?: any;
}

export function DataTableToolbar<TData>({
  table,
  facets,
  onSearch,
  Action,
}: DataTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  const [search, setsearch] = useState("");

  useDebounce(
    () => {
      onSearch(search);
    },
    700,
    [search]
  );

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        <Input
          placeholder="Search here..."
          value={search}
          type="search"
          onChange={(event) => setsearch(event.target.value)}
          className="h-8 w-[150px] lg:w-[250px]"
        />
        {facets.map((e, i) => {
          return (
            <Fragment key={i}>
              {table.getColumn(e.name) && (
                <DataTableFacetedFilter
                  column={table.getColumn(e.name)}
                  title={e.title}
                  options={e.options}
                  type={e.type}
                  loader={e.loader}
                  name={e.name}
                  disabled={e.disabled}
                />
              )}
            </Fragment>
          );
        })}

        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 text-xs text-slate-500 hover:text-slate-600 lg:px-3"
          >
            Reset
            <Cross2Icon className="ml-2 h-3 w-3" />
          </Button>
        )}
      </div>
      {Action && <Action />}
      <DataTableViewOptions table={table} />
    </div>
  );
}
