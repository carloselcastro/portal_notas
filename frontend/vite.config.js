import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    // Em dev, redireciona /api/* para o FastAPI rodando em :8000
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
