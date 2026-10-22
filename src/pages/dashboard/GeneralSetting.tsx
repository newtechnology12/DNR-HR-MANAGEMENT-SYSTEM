import { useMemo } from "react";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import useSettings from "@/hooks/useSettings";
import pocketbase from "@/lib/pocketbase";
import { Button, Card, CardHeader, Field, Input } from "@/components/ims";

/** Settings → General: the company details shown on documents, payslips and e-mails. */
function GeneralSettongs() {
  const formSchema = z.object({
    company_name: z.string(),
    company_email: z.string().email(),
    company_phone: z.string(),
    company_address: z.string(),
  });

  const { settings } = useSettings();

  const values = useMemo(
    () => ({
      company_name: settings?.company_name || "",
      company_email: settings?.company_email || "",
      company_phone: settings?.company_phone || "",
      company_address: settings?.company_address || "",
    }),
    [settings]
  );

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    values: values,
  });
  const errors = form.formState.errors;

  async function onSubmit(values: z.infer<typeof formSchema>) {
    try {
      await pocketbase.collection("settings").update(settings.id, values);
      toast.success("Company details saved");
    } catch (error) {
      toast.error("The company details could not be saved. Try again.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Card as="div">
        <CardHeader title="Company information" subtitle="Shown on documents, payslips and e-mails sent by the system." />
        <form noValidate onSubmit={form.handleSubmit(onSubmit)} className="max-w-3xl space-y-4">
          <Field label="Company name" htmlFor="gs-name">
            <Input id="gs-name" placeholder="Rwanda Association of Local Government Authorities" {...form.register("company_name")} />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Company e-mail" htmlFor="gs-email" error={errors.company_email ? "Enter a valid e-mail address, such as info@ralga.gov.rw." : null}>
              <Input id="gs-email" type="email" placeholder="info@ralga.gov.rw" invalid={Boolean(errors.company_email)} {...form.register("company_email")} />
            </Field>
            <Field label="Company phone" htmlFor="gs-phone">
              <Input id="gs-phone" type="tel" placeholder="+250 788 000 000" {...form.register("company_phone")} />
            </Field>
          </div>
          <Field label="Company address" htmlFor="gs-address">
            <Input id="gs-address" placeholder="KG 11 Ave, Kigali" {...form.register("company_address")} />
          </Field>
          <div className="flex justify-end border-t border-ims-divider pt-4">
            <Button type="submit" variant="primary" loading={form.formState.isSubmitting} disabled={form.formState.disabled}>
              Save company details
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
export default GeneralSettongs;
