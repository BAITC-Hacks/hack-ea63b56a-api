import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#202c2d",
        muted: "#657476",
        line: "#dce5e2",
        canvas: "#f7f9f7",
        teal: "#0d766f",
        "teal-dark": "#075b56",
        "teal-soft": "#e8f3ef",
        amber: "#986014",
        "field-hover": "#a8b9b4",
        "success-line": "#cbe7df",
        "success-bg": "#eef8f4",
        "success-text": "#225d51",
        "warning-line": "#eadcc5",
        "warning-bg": "#fcf7ed",
        "warning-text": "#76521f",
        "synthetic-bg": "#fff0d9",
        "synthetic-text": "#835316",
        "source-bg": "#eaf5f0",
        "source-text": "#26634e",
        "flag-bg": "#f3f4f3",
        "selected-bg": "#edf6f2",
      },
      boxShadow: { panel: "0 18px 50px -36px rgba(18, 47, 45, .28)" },
    },
  },
  plugins: [],
} satisfies Config;
