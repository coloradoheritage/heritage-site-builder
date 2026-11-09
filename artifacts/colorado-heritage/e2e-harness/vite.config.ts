import path from "path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

const here = import.meta.dirname;
const appRoot = path.resolve(here, "..");

export default defineConfig({
  root: here,
  base: "/",
  plugins: [react(), tailwindcss({ optimize: false })],
  resolve: {
    alias: { "@": path.resolve(appRoot, "src") },
    dedupe: ["react", "react-dom"],
  },
  server: { port: 5199, strictPort: true, host: "127.0.0.1", fs: { allow: [path.resolve(appRoot, "..", "..")] } },
});
