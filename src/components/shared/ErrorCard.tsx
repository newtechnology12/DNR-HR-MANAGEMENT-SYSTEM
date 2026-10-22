export default function ErrorCard() {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center justify-center gap-2 px-4 py-24 text-center">
      <img className="h-20 w-20" src="/images/alert.png" alt="" />
      <h4 className="mt-4 text-t-section text-ims-text">Something went wrong</h4>
      <p className="max-w-sm text-t-body text-ims-muted">
        This part of the page could not be shown. Reload the page; if it happens again, tell the RALGA ICT unit.
      </p>
    </div>
  );
}
