import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Label } from "../ui/label";
import { DatePicker } from "../ui/date-picker";

export default function AppFormDatePicker({
  required = false,
  name, form, label, placeholder }) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>
            <Label className="mb-1 text-t-small font-medium text-ims-body" htmlFor={label}>
              {label}
              {required && <span className="ml-0.5 text-ims-danger">*</span>}
            </Label>
          </FormLabel>
          <FormControl>
            <DatePicker
              placeholder={placeholder}
              value={field.value}
              setValue={field.onChange}
              error={Boolean(fieldState?.error?.message)}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
