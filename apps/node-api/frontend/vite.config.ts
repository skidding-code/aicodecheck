import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: requests to /api are forwarded to the Node (Express) backend and
// the /api prefix is stripped before reaching the server.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: process.env.VITE_API_TARGET ?? "http://localhost:8080",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
