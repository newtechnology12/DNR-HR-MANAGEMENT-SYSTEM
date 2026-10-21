/** @type {import('tailwindcss').Config} */
// Colours, type, radius, heights and shadows come from src/design/tokens.json (the one design source).
const tokens = require("./src/design/tokens.json");

const fontSize = Object.fromEntries(Object.entries(tokens.fontSize).map(([k, v]) => [`t-${k}`, v]));

module.exports = {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      screens: {
        xs: "300px",
        ms: "500px",
      },
      fontFamily: {
        sans: tokens.font.sans,
        mono: tokens.font.mono,
      },
      // text-t-title, text-t-section, text-t-body, text-t-small, text-t-label, text-t-hint, text-t-kpi…
      fontSize,
      colors: {
        // bg-ims-page, text-ims-muted, border-ims-border, bg-ims-success-bg…
        ims: tokens.color,
        // RALGA brand (www.ralga.rw), used by the logo and the sign-in pages.
        ralga: {
          navy: "#003F82",
          "navy-dark": "#003268",
          ink: "#001B3D",
          sky: "#00A1DE",
          "sky-dark": "#0079A8",
          brand: "#189FF9",
          yellow: "#E5BE01",
          "yellow-dark": "#7A6300",
          green: "#20603D",
          mist: "#F4F4F4",
        },
        primary: {
          DEFAULT: tokens.color.primary,
          foreground: "#FFFFFF",
        },
        primaryDark: tokens.color["primary-hover"],
        info: {
          DEFAULT: tokens.color.link,
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: tokens.color.success,
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: tokens.color.warning,
          foreground: "#FFFFFF",
        },
        danger: {
          DEFAULT: tokens.color.danger,
          foreground: "#FFFFFF",
        },
      },
      borderRadius: {
        btn: tokens.radius.control,
        input: tokens.radius.control,
        control: tokens.radius.control,
        card: tokens.radius.card,
        modal: "16px",
        pill: tokens.radius.pill,
      },
      height: {
        control: tokens.height.control,
        button: tokens.height.button,
        row: tokens.height.row,
      },
      minHeight: {
        control: tokens.height.control,
        button: tokens.height.button,
        row: tokens.height.row,
      },
      boxShadow: {
        // Cards have a border and no shadow; only modals and menus float.
        card: "none",
        "card-hover": "none",
        modal: tokens.shadow.modal,
        menu: tokens.shadow.menu,
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [
    require("tailwindcss-animate"),
    require("@tailwindcss/container-queries"),
  ],
};
