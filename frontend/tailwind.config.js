/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
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
