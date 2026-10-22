import Dropzone from "../Dropzone";
import { FormField, FormItem, FormLabel, FormMessage } from "../ui/form";
import { Label } from "../ui/label";

function AppFileUpload({
  name,
  label,
  form,
  preview,
  required = false,
}: {
  form: any;
  name: string;
  label: string;
  preview?: any;
  required?: boolean;
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
                className="mb-1 text-t-small font-medium text-ims-body"
                htmlFor={label}
              >
              {label}
              {required && <span className="ml-0.5 text-ims-danger">*</span>}
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
