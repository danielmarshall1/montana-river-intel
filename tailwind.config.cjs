/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ["ui-monospace", "monospace"],
      },
      colors: {
        tier: {
          hot: "#b91c1c",
          good: "#15803d",
          fair: "#d97706",
          tough: "#475569",
        },
      },
      boxShadow: {
        soft: "0 2px 8px rgba(0,0,0,0.06)",
        "soft-lg": "0 4px 20px rgba(0,0,0,0.08)",
      },
    },
  },
  plugins: [require("@tailwindcss/typography")],
};
