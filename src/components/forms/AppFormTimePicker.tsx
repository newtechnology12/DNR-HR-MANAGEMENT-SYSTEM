import {
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Label } from "../ui/label";
import { cn } from "@/utils";
import TimePicker from "react-time-picker";
import "react-time-picker/dist/TimePicker.css";
import "react-clock/dist/Clock.css";

export default function AppFormTimePicker({
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
        <FormItem className="flex flex-col gap-0">
          <FormLabel>
            <Label
              className="text-t-small mb-1 block dark:text-ims-faint text-ims-body"
              htmlFor={label}
            >
              {label}
              {required && <span className="ml-0.5 text-ims-danger">*</span>}
            </Label>
          </FormLabel>
          <FormControl>
            <TimePicker
              className={cn({
                "!error": fieldState.error,
              })}
              onChange={field.onChange}
              value={field.value}
              {...other}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}
