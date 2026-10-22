import AsyncSelectField from "../AsyncSelectField";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Label } from "../ui/label";
export default function AppFormAsyncSelect({
  required = false,
  form, name, label, ...other }) {
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
            <AsyncSelectField
              defaultOptions={true}
              error={fieldState?.error?.message}
              onChange={(e) => {
                field.onChange(e?.value);
              }}
              value={field.value}
              name={name}
              {...other}
            />
          </FormControl>

          <FormMessage />
        </FormItem>
      )}
    />
  );
}
