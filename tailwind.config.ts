import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Segoe UI", "Tahoma", "sans-serif"],
      },
      colors: {
        surface: "#f3f6fc",
        panel: "#ffffff",
        accent: "#0f6cbd",
        ink: "#111827",
      },
      boxShadow: {
        glass: "0 10px 30px rgba(15,108,189,0.14)",
      },
    },
  },
  plugins: [],
} satisfies Config;
