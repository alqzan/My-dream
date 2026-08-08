import { defineConfig } from "vitest/config";

// Separate, minimal config for firebase-tests/ (Firestore/Storage emulator
// rules tests) — the main vitest.config.ts excludes this directory so the
// default `npm test` run never needs Java/the emulators. Used only via
// `npm run test:rules`, which wraps this in `firebase emulators:exec`.
export default defineConfig({
  test: {
    include: ["firebase-tests/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 20_000,
  },
});
