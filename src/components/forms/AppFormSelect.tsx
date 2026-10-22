import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "../ui/form";
import { Label } from "../ui/label";
import { cn } from "@/utils";

export default function AppFormSelect({
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
        <FormItem>
          <FormLabel>
            <Label className="mb-1 text-t-small font-medium text-ims-body" htmlFor={label}>
              {label}
              {required && <span className="ml-0.5 text-ims-danger">*</span>}
            </Label>
          </FormLabel>
          <FormControl>
            <Select
              {...props}
              value={field.value}
              onValueChange={field.onChange}
            >
              <SelectTrigger
                className={cn("w-full", {
                  "!border-ims-danger": fieldState.error,
                })}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent className="bg-ims-card">
                <SelectGroup>
                  {options.map((e, i) => {
                    return (
                      <SelectItem key={i} value={e.value}>
                        {e.label}
                      </SelectItem>
                    );
                  })}
                </SelectGroup>
              </SelectContent>
            </Select>
          </FormControl>

          <FormMessage />
        </FormItem>
      )}
    />
  );
}
