import { defineConfig } from "vitest/config";
import path from "path";

const rootDir = path.dirname(new URL(import.meta.url).pathname);

export default defineConfig({
  resolve: {
    alias: {
      "@": rootDir,
    },
  },
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // Integration tests share one Postgres connection and mutate real rows
    // (cleaned up per-test) — run them one at a time, not in parallel.
    fileParallelism: false,
  },
});
