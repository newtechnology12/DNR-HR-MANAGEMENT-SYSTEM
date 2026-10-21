import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Label } from "../ui/label";
import { Combobox } from "../ui/combobox";

export default function AppFormCombobox({
  required = false,
  name,
  form,
  label,
  placeholder,
  options = [],
  ...props
}) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem className="flex flex-col gap-1 mt-1">
          <FormLabel>
            <Label className="mb-1 text-[12.5px] font-medium text-slate-700" htmlFor={label}>
              {label}
              {required && <span className="ml-0.5 text-red-600">*</span>}
            </Label>
          </FormLabel>
          <FormControl>
            <Combobox
              placeholder={placeholder}
              error={fieldState?.error?.message}
              value={field.value}
              setValue={field.onChange}
              name={name}
              {...props}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
