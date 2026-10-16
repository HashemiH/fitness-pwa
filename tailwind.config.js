/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#080D12",
        card: "#111A21",
        elevated: "#1B2730",
        line: "#293640",
        mint: "#20E3A2",
        pine: "#12B981",
        mist: "#98A7B2",
        paper: "#F4F7F8",
        amber: "#F4B860",
        danger: "#F07178",
      },
      fontFamily: {
        sans: ["Vazirmatn", "Tahoma", "sans-serif"],
      },
    },
  },
  plugins: [],
}
