/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        ink: {
          950: "#070a12",
          900: "#0b1020",
          850: "#0f1528",
          800: "#141b32",
          700: "#1c2440",
          600: "#28324f",
        },
        brand: {
          400: "#6ea8fe",
          500: "#4d8bff",
          600: "#3b6fe0",
        },
      },
      fontFamily: {
        mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
