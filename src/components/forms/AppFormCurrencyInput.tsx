import { useEffect, useState } from "react";
import { FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";

export function AppFormCurrencyInput({ form, name, label, placeholder }) {
  const [displayValue, setDisplayValue] = useState("");

  useEffect(() => {
    const value = form.getValues(name);
    if (value) {
      setDisplayValue(formatCurrency(value));
    }
  }, [form, name]);

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "FRW",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value.replace(/[^\d]/g, "");
    const numericValue = parseFloat(value);
    if (!isNaN(numericValue)) {
      form.setValue(name, numericValue);
      setDisplayValue(value);
    } else {
      form.setValue(name, 0);
      setDisplayValue("");
    }
  };

  const handleBlur = () => {
    const value = form.getValues(name);
    setDisplayValue(formatCurrency(value));
  };

  return (
    <FormField
      control={form.control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <FormLabel>{label}</FormLabel>
          <FormControl>
            <Input
              {...field}
              value={displayValue}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder={placeholder}
            />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}