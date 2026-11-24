import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Vite config for `npm run dev` / `npm run build`.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
