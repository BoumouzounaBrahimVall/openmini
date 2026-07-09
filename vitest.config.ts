import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // apps/ hosts throwaway/playground apps with their own toolchains (Jest).
    exclude: ["**/node_modules/**", "**/dist/**", "apps/**"],
    coverage: {
      include: ["packages/*/src/**", "conformance/src/**"],
      exclude: ["**/*.test.ts"],
    },
  },
});
