import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import node from "@astrojs/node";

// https://astro.build/config
export default defineConfig({
  output: "server",
  adapter: node({ mode: "standalone" }),
  integrations: [react()],
  server: {
    port: 4321,
  },
  vite: {
    optimizeDeps: {
      // Heavy client deps used by the export module tree (islands import these
      // through `lib/export`). Pre-bundling them at startup keeps island
      // hydration from stalling on on-demand optimization (HTTP 504).
      include: ["docx", "jspdf", "marked"],
    },
  },
});
