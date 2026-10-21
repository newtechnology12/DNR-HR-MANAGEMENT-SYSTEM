/**
 * Design tokens for code that cannot use Tailwind classes (charts, canvas, inline SVG).
 * The values live in tokens.json, which Tailwind reads too — change them there, never here.
 */
import tokens from "./tokens.json";

export const color = tokens.color;
export const chart = tokens.chart;
export const radius = tokens.radius;
export const font = { sans: tokens.font.sans.map((f) => (f.includes(" ") ? `"${f}"` : f)).join(", ") };
export default tokens;
