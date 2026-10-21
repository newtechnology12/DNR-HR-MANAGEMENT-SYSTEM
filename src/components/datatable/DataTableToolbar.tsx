"use client";

import { Table } from "@tanstack/react-table";
import { SearchBox } from "@/components/ims";

import { DataTableFacetedFilter } from "./DataTableFacetedFilter";
import { DataTableViewOptions } from "./DataTableViewOptions";
import { Fragment, useState } from "react";
import { useDebounce } from "react-use";

interface DataTableToolbarProps<TData> {
  table: Table<TData>;
  facets;
  onSearch;
  Action?: any;
  /** What the search box searches, e.g. "Search name or e-mail". */
  searchPlaceholder?: string;
}

export function DataTableToolbar<TData>({
  table,
  facets,
  onSearch,
  Action,
  searchPlaceholder,
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
    <div className="flex flex-col gap-2.5 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
        <SearchBox placeholder={searchPlaceholder || "Search"} value={search} onChange={setsearch} />
        {facets.map((e, i) => {
          return (
            <Fragment key={i}>
              {table.getAllLeafColumns().some((c) => c.id === e.name) && (
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
          <button type="button" onClick={() => table.resetColumnFilters()} className="h-9 px-1.5 text-[13.5px] font-bold text-ims-link hover:underline">
            Clear filters
          </button>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {Action && <Action />}
        <DataTableViewOptions table={table} />
      </div>
    </div>
  );
}
