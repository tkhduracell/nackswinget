import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(import.meta.dirname), "server-only": path.resolve(import.meta.dirname, "test/server-only-stub.ts") } },
  test: { include: ["**/*.test.ts"], exclude: ["node_modules/**", ".next/**"], env: { TZ: "Europe/Stockholm" } },
});
