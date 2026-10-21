/**
 * tailwind-merge that knows the design tokens. Without this it cannot tell a token font size
 * (text-t-body) from a token colour (text-ims-muted) and silently drops one of them.
 */
import { extendTailwindMerge } from "tailwind-merge";
import tokens from "./tokens.json";

const sizes = Object.keys(tokens.fontSize).map((k) => `t-${k}`);
const heights = Object.keys(tokens.height);
const radii = ["control", "card", "pill", "btn", "input", "modal"];

export const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: sizes }],
      h: [{ h: heights }],
      "min-h": [{ "min-h": heights }],
      rounded: [{ rounded: radii }],
      shadow: [{ shadow: ["card", "card-hover", "modal", "menu"] }],
    },
  },
});
