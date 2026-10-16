import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { VitePWA } from "vite-plugin-pwa"

const pagesBase = "/fitness-pwa/"

export default defineConfig({
  base: pagesBase,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon-192.png", "icon-512.png"],
      manifest: {
        name: "تناسب",
        short_name: "تناسب",
        description: "برنامه شخصی تغذیه و تمرین، آفلاین",
        lang: "fa",
        dir: "rtl",
        display: "standalone",
        background_color: "#14181d",
        theme_color: "#14181d",
        id: pagesBase,
        start_url: pagesBase,
        scope: pagesBase,
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,png,woff,woff2}"],
        navigateFallback: "index.html",
      },
    }),
  ],
})
