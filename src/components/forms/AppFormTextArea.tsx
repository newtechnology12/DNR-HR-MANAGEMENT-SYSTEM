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
            <Label className="mb-1 text-[12.5px] font-medium text-slate-700" htmlFor={label}>
              {label}
              {required && <span className="ml-0.5 text-red-600">*</span>}
            </Label>
          </FormLabel>
          <FormControl>
            <Textarea
              className={cn("leading-8", {
                "!border-red-500": fieldState.error,
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
