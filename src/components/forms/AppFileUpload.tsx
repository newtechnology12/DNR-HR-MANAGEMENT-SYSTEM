import Dropzone from "../Dropzone";
import { FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Label } from "../ui/label";

function AppFileUpload({
  name,
  label,
  form,
  preview,
}: {
  form: any;
  name: string;
  label: string;
  preview?: any;
}) {
  return (
    <div>
      <FormField
        control={form.control}
        name={name}
        render={({ field, fieldState }) => (
          <FormItem>
            <FormLabel>
              <Label
                className="text-[13px] mb-1 text-slate-600"
                htmlFor={label}
              >
                {label}
              </Label>
            </FormLabel>
            <Dropzone
              preview={preview}
              label={label}
              error={fieldState?.error?.message}
              file={field.value}
              onChange={(e: any) => {
                form.setValue(name, e);
              }}
            />
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}

export default AppFileUpload;
