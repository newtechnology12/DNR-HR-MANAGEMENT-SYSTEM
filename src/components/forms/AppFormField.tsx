import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "../ui/label";
import { Input } from "../ui/input";
import { cn } from "@/utils";

export default function AppFormField({
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
            <Label
              className="text-[13px] mb-1 dark:text-slate-300 text-slate-600"
              htmlFor={label}
            >
              {label}
            </Label>
          </FormLabel>
          <FormControl>
            <Input
              className={cn({
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
