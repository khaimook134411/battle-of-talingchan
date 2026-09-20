import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  root: "src/client",
  publicDir: "../../public",
  plugins: [react()],
  build: { outDir: "../../dist", emptyOutDir: true },
  server: { proxy: { "/socket.io": { target: "http://localhost:3001", ws: true } } },
});
