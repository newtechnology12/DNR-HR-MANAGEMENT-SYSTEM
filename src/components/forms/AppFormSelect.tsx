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
            <Label className="mb-1 text-[12.5px] font-medium text-slate-700" htmlFor={label}>
              {label}
              {required && <span className="ml-0.5 text-red-600">*</span>}
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
                  "!border-red-500": fieldState.error,
                })}
              >
                <SelectValue placeholder={placeholder} />
              </SelectTrigger>
              <SelectContent className="bg-white">
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
