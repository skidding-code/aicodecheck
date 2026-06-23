import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Dev proxy: requests to /api are forwarded to the FastAPI backend and the
// /api prefix is stripped before reaching the server.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
