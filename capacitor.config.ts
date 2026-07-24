import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.getpumppilot.pumppilot",
  appName: "PumpPilot AI",
  webDir: "capacitor-www",
  server: {
    url: "https://getpumppilot.app",
    cleartext: false,
    androidScheme: "https",
    iosScheme: "https",
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2500,
      launchAutoHide: true,
      backgroundColor: "#0B0F19",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#3B82F6",
    },
    StatusBar: {
      style: "DARK",
      backgroundColor: "#0B0F19",
      overlaysWebView: false,
    },
  },
  android: {
    buildOptions: {
      keystorePath: undefined,
    },
  },
  ios: {
    contentInset: "always",
    allowsLinkPreview: false,
    scrollEnabled: "platform",
  },
};

export default config;
