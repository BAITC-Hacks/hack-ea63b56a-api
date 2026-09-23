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
        amber: "#986014",
      },
      boxShadow: { panel: "0 18px 50px -36px rgba(18, 47, 45, .28)" },
    },
  },
  plugins: [],
} satisfies Config;
