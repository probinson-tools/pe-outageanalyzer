import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      borderColor: { DEFAULT: "#e5e7eb57" },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        navy: {
          950: "#0F1117",
          900: "#1A1D2E",
          800: "#21253a",
          700: "#2a2f4a",
          600: "#343959",
        },
      },
      fontFamily: {
        mono: ["JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", "monospace"],
      },
    },
  },
  plugins: [],
};
export default config;
