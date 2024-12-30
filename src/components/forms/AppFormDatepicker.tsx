import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Label } from "../ui/label";
import { DatePicker } from "../ui/date-picker";

export default function AppFormDatePicker({ name, form, label, placeholder }) {
  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FormItem>
          <FormLabel>
            <Label className="text-[13px] mb-1 text-slate-600" htmlFor={label}>
              {label}
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
