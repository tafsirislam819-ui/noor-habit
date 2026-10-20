import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.noorhabit.app",
  appName: "Noor Habit",
  webDir: "dist/client",
  plugins: {
    LocalNotifications: { smallIcon: "ic_stat_icon_config_sample", iconColor: "#7c6cf0" },
    StatusBar: {
      overlaysWebView: true,
      style: "DARK",
      backgroundColor: "#00000000",
    },
  },
};

export default config;
