import type { CapacitorConfig } from "@capacitor/cli";

const APP_ID = "com.alqzan.madar";

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: "مدار",
  webDir: process.env.CAPACITOR_WEB_DIR || "out",
  plugins: {
    CapacitorUpdater: {
      // Manual manifest polling is used because GitHub Pages serves static GETs,
      // not Capgo's POST update API. The timeout covers hydrated startup plus
      // BootGuard's existing 20-second stability window; this delays rollback
      // for up to 90 seconds if a candidate bundle never confirms readiness.
      autoUpdate: "off",
      appReadyTimeout: 90_000,
    },
  },
};

export default config;
