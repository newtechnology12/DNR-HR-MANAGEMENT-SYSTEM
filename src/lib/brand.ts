/**
 * Product and organisation branding. Override per deployment with VITE_* variables
 * (see README → Environment variables) — nothing in the screens hard-codes the client's name.
 */
const env = import.meta.env;

export const BRAND = {
  product: env.VITE_PRODUCT_NAME || "RALGA IMS",
  productLong: env.VITE_PRODUCT_LONG_NAME || "Integrated Management System",
  orgShort: env.VITE_ORG_SHORT_NAME || "RALGA",
  orgName: env.VITE_ORG_NAME || "Rwanda Association of Local Government Authorities",
  orgAddress: env.VITE_ORG_ADDRESS || "General Secretariat, Kigali, Rwanda",
  vendor: env.VITE_VENDOR_NAME || "DNR Partners",
  currency: "RWF",
};

/** Demo sign-in shortcuts are shown in development, or when a demo build sets VITE_DEMO_LOGINS=true. */
export const DEMO_LOGINS_ENABLED = Boolean(env.DEV) || env.VITE_DEMO_LOGINS === "true";
