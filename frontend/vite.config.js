import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
    strictPort: true,
    // Browser calls /api on Vite; Vite forwards it to the small Node API.
    proxy: { "/api": "http://localhost:3001" },
  },
});
