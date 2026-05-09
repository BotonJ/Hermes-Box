import { defineConfig } from "vite";
import preact from "@preact/preset-vite";
import path from "path";

const host = process.env.TAURI_DEV_HOST;

export default defineConfig({
  plugins: [preact()],
  test: {
    globals: true,
    environment: "jsdom",
    exclude: ["**/node_modules/**", "**/.claude/**"],
    alias: {
      "tauri-pty": path.resolve(__dirname, "src/__mocks__/tauri-pty.ts"),
    },
  },
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 5174,
        }
      : undefined,
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
