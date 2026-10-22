import { Home } from "lucide-react";
import { ButtonLink, Card, Page } from "@/components/ims";

export default function PageNotFound() {
  return (
    <Page narrow className="min-h-[60vh] justify-center">
      <Card className="mx-auto w-full max-w-md text-center">
        <p className="text-t-small font-semibold text-ims-muted">Error 404</p>
        <h1 className="mt-1 text-t-title text-ims-text">Page not found</h1>
        <p className="mt-2 text-t-body text-ims-muted">The address may be mistyped, or the page has moved. Check it, or go back to your dashboard.</p>
        <div className="mt-5 flex justify-center">
          <ButtonLink to="/dashboard" variant="primary" icon={Home}>Go to the dashboard</ButtonLink>
        </div>
      </Card>
    </Page>
  );
}
