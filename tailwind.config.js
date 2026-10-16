/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#14181d",
        card: "#1c232b",
        line: "#2a3440",
        mint: "#3ddc97",
        mist: "#c5d0dc",
      },
      fontFamily: {
        sans: ["Vazirmatn", "Tahoma", "sans-serif"],
      },
    },
  },
  plugins: [],
}
