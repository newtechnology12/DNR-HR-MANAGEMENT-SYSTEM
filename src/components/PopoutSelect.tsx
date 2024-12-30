import { useState } from "react";

import Select from "react-select";
import { Search } from "lucide-react";
import { cn } from "@/utils";
import { useQuery } from "react-query";
import { useDebounce } from "react-use";
import { components } from "react-select";
import { Checkbox } from "./ui/checkbox";

const selectStyles: any = {
  control: (provided) => ({
    ...provided,
    minWidth: 240,
    margin: 8,
  }),
  menu: () => ({ boxShadow: "inset 0 1px 0 rgba(0, 0, 0, 0.1)" }),
};

const PopoutSelect = ({
  value,
  onChange,
  setOpen,
  loader,
  open,
  name,
  ...props
}: any) => {
  const [search, setSearch] = useState("");

  const [debouncedSearch, setDebouncedSearch] = useState("");

  useDebounce(
    () => {
      setDebouncedSearch(search);
    },
    500,
    [search]
  );

  const fetch = async (e) => {
    const search = e.queryKey[2].search;
    return loader({ search });
  };

  const optionsQuery = useQuery({
    queryKey: ["options", name, { search: debouncedSearch }],
    queryFn: fetch,
    enabled: Boolean(open),
  });

  return (
    <Select
      unstyled
      autoFocus
      isMulti
      isClearable={false}
      backspaceRemovesValue={false}
      components={{
        DropdownIndicator: () =>
          optionsQuery.status !== "loading" && (
            <Search className="mr-0 text-slate-600" size={16} />
          ),
        Option,
        IndicatorSeparator: () => "",
      }}
      controlShouldRenderValue={false}
      hideSelectedOptions={false}
      menuIsOpen
      isLoading={optionsQuery.status === "loading"}
      filterOption={() => true}
      inputValue={search}
      onInputChange={(e) => setSearch(e)}
      onChange={(newValue) => {
        onChange(newValue);
        setOpen(false);
      }}
      //   isSearchable={false}
      // @ts-ignore
      options={optionsQuery?.data || []}
      placeholder="Search here..."
      styles={selectStyles}
      tabSelectsValue={false}
      value={value}
      classNames={{
        control: ({ isFocused }) =>
          cn(
            isFocused ? controlStyles.focus : controlStyles.nonFocus,
            controlStyles.base
          ),
        placeholder: () => placeholderStyles,
        loadingMessage: () => loadingMessageStyles,
        input: () => selectInputStyles,
        valueContainer: () => valueContainerStyles,
        singleValue: () => singleValueStyles,
        multiValue: () => multiValueStyles,
        multiValueLabel: () => multiValueLabelStyles,
        multiValueRemove: () => multiValueRemoveStyles,
        indicatorsContainer: () => indicatorsContainerStyles,
        clearIndicator: () => clearIndicatorStyles,
        indicatorSeparator: () => indicatorSeparatorStyles,
        dropdownIndicator: () => dropdownIndicatorStyles,
        menu: () => menuStyles,
        groupHeading: () => groupHeadingStyles,
        option: ({ isFocused, isSelected }) =>
          cn(
            isFocused && optionStyles.focus,
            isSelected && optionStyles.selected,
            optionStyles.base
          ),
        noOptionsMessage: () => noOptionsMessageStyles,
      }}
      {...props}
    />
  );
};

export default PopoutSelect;

function Option(props) {
  return (
    <>
      {props.data.component ? (
        <components.Option {...props}>
          <props.data.component />
        </components.Option>
      ) : props.isMulti ? (
        <components.Option {...props}>
          <div className="flex items-center gap-2">
            <Checkbox checked={props.isSelected} />
            {props.children}
          </div>
        </components.Option>
      ) : (
        <components.Option {...props} />
      )}
    </>
  );
}

const controlStyles = {
  base: "border rounded-[3px] bg-white hover:cursor-pointer- px-1 py-[2.5px]",
  focus: "border-primary ring-1- ring-primary-",
  nonFocus: "border-gray-200 hover:border-slate-200 hover:bg-slate-100",
};
const placeholderStyles = "text-gray-500 !text-[13px] font-medium pl-1 py-0.5";
const selectInputStyles = "pl-1 !text-[13px] text-slate-500 font-medium py-0.5";
const valueContainerStyles = "p-1 gap-1";
const singleValueStyles =
  "leading-7 text-[13px] text-slate-500 font-medium ml-1";
const multiValueStyles =
  "bg-gray-100 rounded-[3px] items-center py-0.5 pl-2 pr-1 gap-1.5";
const multiValueLabelStyles = "leading-6 py-0.5";
const multiValueRemoveStyles =
  "border border-gray-200 bg-white hover:bg-red-50 hover:text-red-800 text-gray-500 hover:border-red-300 rounded-[3px]";
const indicatorsContainerStyles = "p-1 flex items-center gap-2";
const clearIndicatorStyles =
  "text-gray-500 p-1 rounded-[3px] hover:bg-red-50 hover:text-red-800";
const indicatorSeparatorStyles = "bg-gray-200 mt-[4px] h-[18px]";
const dropdownIndicatorStyles =
  "p-1 hover:bg-gray-100 text-gray-500 rounded-[3px] hover:text-black";
const menuStyles = "py-[6px] rounded-b-[3px] px-2 mt-2 bg-white";
const groupHeadingStyles = "ml-3 mt-2 mb-1 text-gray-500 text-sm";
const optionStyles = {
  base: "hover:cursor-pointer my-1 truncate flex text-slate-500 capitalize font-medium !text-[13px] px-[10px] py-[9px] rounded-[3px]",
  focus: "bg-gray-100 active:bg-gray-200",
  selected:
    "!flex items-center bg-slate-100 after:ml-2 after:text-green-500 text-gray-500",
};
const noOptionsMessageStyles =
  "text-gray-500 p-2 bg-gray-50- text-[13px] font-medium py-6 rounded-sm";

const loadingMessageStyles =
  "text-gray-500 p-2 bg-gray-50 text-[13px] font-medium py-3 rounded-sm";
