import { cn } from "@/utils/cn";
import { ChevronDown, X } from "react-feather";
import { components } from "react-select";
import Select from "react-select";
import { useQuery } from "react-query";
import { useState } from "react";
import { useDebounce } from "react-use";

function AsyncSelectField({
  label,
  errorMessage,
  hideErrorMessage,
  disabled,
  loader,
  name,
  value,
  ...other
}: any) {
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

  const [open, setopen] = useState(false);

  const optionsQuery = useQuery({
    queryKey: ["options", name, { search: debouncedSearch }],
    queryFn: fetch,
    enabled: Boolean(open || value),
  });

  return (
    <div className="py-[3px]-">
      <ReactSelect
        menuIsOpen={open}
        isLoading={optionsQuery.status === "loading"}
        onMenuOpen={() => setopen(true)}
        onMenuClose={() => setopen(false)}
        filterOption={() => true}
        inputValue={search}
        value={optionsQuery?.data?.find((e) => e.value === value) || []}
        onInputChange={(e) => setSearch(e)}
        options={optionsQuery?.data || []}
        name="colors"
        unstyled
        {...other}
      />
    </div>
  );
}

const DropdownIndicator = (props) => {
  return (
    <div {...props}>
      <ChevronDown size={15} className="text-ims-muted" />
    </div>
  );
};

const ClearIndicator = (props) => {
  return (
    <div {...props}>
      <X size={15} className="text-ims-muted" />
    </div>
  );
};

const MultiValueRemove = (props) => {
  return (
    <div {...props}>
      <X size={16} className="text-ims-body" />
    </div>
  );
};

function MultiValueLabel(props) {
  return (
    <>
      {props.data.component ? (
        <props.data.component />
      ) : (
        <components.Option {...props} />
      )}
    </>
  );
}
function SingleValue(props) {
  return (
    <>
      {props?.data?.component ? (
        <components.SingleValue {...props}>
          <props.data.component />
        </components.SingleValue>
      ) : (
        <components.SingleValue {...props} />
      )}
    </>
  );
}

function Option(props) {
  return (
    <>
      {props.data.component ? (
        <components.Option {...props}>
          <props.data.component />
        </components.Option>
      ) : (
        <components.Option {...props} />
      )}
    </>
  );
}

const controlStyles = {
  base: "min-h-[38px] border rounded-md bg-ims-card shadow-sm hover:cursor-pointer px-1 py-[1px] transition-[border-color,box-shadow]",
  focus: "border-primary ring-[3px] ring-primary/15",
  nonFocus: "border-ims-field hover:border-slate-400",
};
const placeholderStyles = "text-ims-faint !text-t-body pl-1 py-0.5";
const selectInputStyles =
  "pl-1 !text-[12.3px] text-ims-muted font-medium py-0.5";
const valueContainerStyles = "p-1 gap-1";
const singleValueStyles =
  "text-t-body text-ims-text ml-1";
const multiValueStyles =
  "bg-gray-100 rounded-[3px] items-center py-0.5 pl-2 pr-1 gap-1.5";
const multiValueLabelStyles = "leading-6 py-0.5";
const multiValueRemoveStyles =
  "border border-gray-200 bg-ims-card hover:bg-ims-danger-bg hover:text-ims-danger text-gray-500 hover:border-ims-danger/30 rounded-[3px]";
const indicatorsContainerStyles = "p-1 flex items-center gap-2";
const clearIndicatorStyles =
  "text-gray-500 p-1 rounded-[3px] hover:bg-ims-danger-bg hover:text-ims-danger";
const indicatorSeparatorStyles = "bg-gray-200 mt-[4px] h-[18px]";
const dropdownIndicatorStyles =
  "p-1 hover:bg-gray-100 text-gray-500 rounded-[3px] hover:text-black";
const menuStyles =
  "p-1 mt-1 border shadow-lg border-ims-border bg-ims-card rounded-md";
const groupHeadingStyles = "ml-3 mt-2 mb-1 text-gray-500 text-sm";
const optionStyles = {
  base: "hover:cursor-pointer my-0.5 truncate flex text-ims-body capitalize !text-t-small px-3 py-[7px] rounded",
  focus: "bg-gray-100 active:bg-gray-200",
  selected:
    "after:content-['✔'] !flex items-center bg-ims-subtle after:ml-2 after:text-ims-success text-gray-500",
};
const noOptionsMessageStyles =
  "text-gray-500 p-2 text-t-small font-medium py-3  py-4 rounded-sm";

const loadingMessageStyles =
  "text-gray-500 p-2 text-t-small font-medium py-3  py-4 rounded-sm";

const ReactSelect = (props) => (
  <Select
    unstyled
    isClearable
    styles={{
      input: (base) => ({
        ...base,
        "input:focus": {
          boxShadow: "none",
        },
      }),
      // On mobile, the label will truncate automatically, so we want to
      // override that behaviour.
      multiValueLabel: (base) => ({
        ...base,
        whiteSpace: "normal",
        overflow: "visible",
      }),
      control: (base) => ({
        ...base,
        transition: "none",
      }),
    }}
    components={{
      DropdownIndicator,
      ClearIndicator,
      MultiValueRemove,
      MultiValueLabel,
      SingleValue,
      Option,
    }}
    classNames={{
      control: ({ isFocused }) =>
        cn(
          isFocused ? controlStyles.focus : controlStyles.nonFocus,
          controlStyles.base,
          props.className,
          {
            "!border-ims-danger": props?.error,
          }
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

export default AsyncSelectField;
