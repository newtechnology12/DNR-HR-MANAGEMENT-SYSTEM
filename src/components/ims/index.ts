/**
 * RALGA IMS UI kit — the one set of components every page is built from.
 * Tokens: src/design/tokens.json. Live catalogue: /dashboard/ui-kit.
 *
 *   List page:   Page → PageHeader → (KpiBand) → Card[ Tabs → FilterBar → DataTable → Pager ]
 *   Detail page: Page → DetailHeader → (KpiBand) → Tabs (Details · Items · Approvals · Documents · Activity)
 *   Form page:   Page → PageHeader ("New X") → ErrorSummary → FormBody[ FormSection… | SummaryPanel ] → FormActions
 *   Dashboard:   Page → PageHeader (greeting + main action) → KpiBand → cards in a 2/3 + 1/3 grid
 */
export * from "./Button";
export * from "./Pill";
export * from "./Layout";
export * from "./Tabs";
export * from "./FilterBar";
export * from "./DataTable";
export * from "./DetailHeader";
export * from "./Form";
export * from "./Modal";
export * from "./Menu";
export * from "./Feedback";
export * from "./format";
export * from "./status";
