import { defineConfig, configDefaults } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the same "@/..." alias the app uses (tsconfig paths) so unit tests can
// import modules like src/lib/sync.ts that reference "@/components/...".
export default defineConfig({
  // Use React's automatic JSX runtime (same as the app) so component tests can
  // render .tsx without importing React explicitly.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // firebase-tests/ needs the Firestore/Storage emulators running (Java +
    // firebase-tools) and is excluded from the default `npm test` run so the
    // main gate stays fast and dependency-free. Run it explicitly via
    // `npm run test:rules` (wraps it in `firebase emulators:exec`).
    exclude: [...configDefaults.exclude, "firebase-tests/**"],
  },
});
