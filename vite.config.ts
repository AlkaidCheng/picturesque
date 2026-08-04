import { fileURLToPath, URL } from "node:url";

import { defineConfig } from "vite";

const configuredPort = Number(process.env.PORT);
const port = Number.isInteger(configuredPort) && configuredPort > 0 && configuredPort <= 65_535
  ? configuredPort
  : 4173;

export default defineConfig({
  base: "./",
  build: {
    rollupOptions: {
      input: {
        app: fileURLToPath(new URL("./index.html", import.meta.url)),
        roadmap: fileURLToPath(new URL("./docs/roadmap.html", import.meta.url))
      }
    }
  },
  preview: {
    host: "127.0.0.1",
    port,
    strictPort: true
  },
  server: {
    host: "127.0.0.1",
    port,
    strictPort: true
  }
});
