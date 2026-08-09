/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        /* Outfit is the Innovare corporate typeface (innovare-group.com).
           Loaded in index.html; the system stack keeps the app readable if the
           font CDN is blocked. */
        sans: [
          "Outfit",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica Neue",
          "Arial",
          "sans-serif",
        ],
      },
      colors: {
        /* Innovare corporate palette (innovare-group.com).
           `brand` is the magenta-purple of the site header, buttons and
           headings; `gold` is the amber accent used on their stat-card bars and
           active nav link. Shade numbers follow Tailwind conventions so
           bg-brand-700 / text-brand-800 behave as expected. */
        brand: {
          50: "#fbf4f8",
          100: "#f5e7f0",
          200: "#ebd2e3",
          300: "#d9a6c9",
          400: "#bd6ba4",
          500: "#a24186",
          600: "#8e3374",
          700: "#7b2a63", // primary — site header / CTA purple
          800: "#5f2150",
          900: "#4a1a3b",
        },
        gold: {
          50: "#fef8ee",
          100: "#fcefda",
          200: "#f8dfb6",
          300: "#f2c98a",
          400: "#efb662",
          500: "#e9a13b", // accent — site stat bars / active nav
          600: "#d18a28",
          700: "#b9741c",
          800: "#8f5915",
          900: "#6b4310",
        },
        lf: {
          surface: "var(--lf-surface)",
          muted: "var(--lf-surface-muted)",
          page: "var(--lf-surface-page)",
          border: "var(--lf-border)",
          "border-strong": "var(--lf-border-strong)",
          text: "var(--lf-text)",
          "text-muted": "var(--lf-text-muted)",
          "text-subtle": "var(--lf-text-subtle)",
          accent: "var(--lf-accent)",
          "accent-hover": "var(--lf-accent-hover)",
          "accent-active": "var(--lf-accent-active)",
          "accent-soft": "var(--lf-accent-soft)",
          gold: "var(--lf-gold)",
          "gold-soft": "var(--lf-gold-soft)",
          success: "var(--lf-success)",
          "success-soft": "var(--lf-success-soft)",
          danger: "var(--lf-danger)",
          "danger-hover": "var(--lf-danger-hover)",
          "danger-soft": "var(--lf-danger-soft)",
          warning: "var(--lf-warning)",
          "warning-soft": "var(--lf-warning-soft)",
        },
      },
      borderRadius: {
        "2xl": "1rem",
      },
      boxShadow: {
        "lf-sm": "var(--lf-shadow-sm)",
        "lf-md": "var(--lf-shadow-md)",
        "lf-lg": "var(--lf-shadow-lg)",
        "lf-card": "var(--lf-shadow-card-hover)",
        "lf-modal": "var(--lf-shadow-modal)",
      },
      transitionDuration: {
        250: "250ms",
      },
    },
  },
  plugins: [],
};
