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
            <Label className="text-[13px] mb-1 text-slate-600" htmlFor={label}>
              {label}
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
