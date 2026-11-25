import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Separate release entry: the development archive still builds its workbench.
export default defineConfig({
  plugins: [react()],
  server: { host: "127.0.0.1", port: 5177 },
  preview: { host: "127.0.0.1", port: 5178 },
  build: { rollupOptions: { input: "index.html" } },
});
