import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// Resolve the same "@/..." alias the app uses (tsconfig paths) so unit tests can
// import modules like src/lib/sync.ts that reference "@/components/...".
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
});
