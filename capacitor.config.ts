import type { CapacitorConfig } from "@capacitor/cli";

const APP_ID = "com.alqzan.madar";

const config: CapacitorConfig = {
  appId: APP_ID,
  appName: "مدار",
  webDir: process.env.CAPACITOR_WEB_DIR || "out",
};

export default config;
