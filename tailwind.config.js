/** @type {import('tailwindcss').Config} */
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
        sans: ["InterVariable", "Inter", "sans-serif"],
      },
      colors: {
        // RALGA brand (www.ralga.rw): navy buttons and links, deep navy footer, sky-blue accents,
        // the logo blue, and the Rwanda flag's yellow and green.
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
          DEFAULT: "#003F82",
          foreground: "#FFFFFF",
        },
        primaryDark: "#003268",
        info: {
          DEFAULT: "#2563EB",
          foreground: "#FFFFFF",
        },
        success: {
          DEFAULT: "#22C55E",
          foreground: "#FFFFFF",
        },
        warning: {
          DEFAULT: "#F59E0B",
          foreground: "#1F2937",
        },
        danger: {
          DEFAULT: "#EF4444",
          foreground: "#FFFFFF",
        },
      },
      borderRadius: {
        btn: "10px",
        input: "10px",
        card: "14px",
        modal: "16px",
      },
      boxShadow: {
        card: "0 1px 2px 0 rgb(0 0 0 / 0.04), 0 1px 3px 0 rgb(0 0 0 / 0.06)",
        "card-hover": "0 4px 12px 0 rgb(0 0 0 / 0.08)",
        modal: "0 20px 25px -5px rgb(0 0 0 / 0.1), 0 8px 10px -6px rgb(0 0 0 / 0.1)",
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
