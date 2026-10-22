import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "../ui/label";
import { cn } from "@/utils";
import { Textarea } from "../ui/textarea";

export default function AppFormTextArea({
  required = false,
  form,
  name,
  label,
  placeholder,
  ...other
}) {
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
            <Textarea
              className={cn("leading-8", {
                "!border-ims-danger": fieldState.error,
              })}
              placeholder={placeholder}
              {...field}
              {...other}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
