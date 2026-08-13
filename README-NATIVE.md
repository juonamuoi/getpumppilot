# PumpPilot AI — Native Mobile Apps

This project is a **Capacitor-wrapped native app** that loads the live web app at `https://getpumppilot.app`. It gives you App Store and Google Play presence while keeping the web app as the single source of truth.

## What was scaffolded

- `capacitor.config.ts` — app id, name, remote URL, splash/status-bar config.
- `capacitor-www/` — minimal offline-safe loader.
- `ios/` and `android/` — native Xcode / Android Studio projects.
- `assets/icon.png` and `assets/splash.png` — source images used to generate all icon/splash sizes.
- `src/lib/native.ts` — safe native helpers (no-op in browser).
- `src/routes/refer.tsx` — uses the native share sheet when available.

## Requirements

- **iOS**: macOS with Xcode 15+ and an Apple Developer account.
- **Android**: Android Studio Hedgehog+ and JDK 17+.
- **Both**: Node/Bun, the project dependencies already installed.

## Quick commands

```bash
# Sync web assets and plugins into native projects
bun run cap:sync

# Open iOS project in Xcode
bun run cap:open:ios

# Open Android project in Android Studio
bun run cap:open:android

# Regenerate icons/splash after changing assets/icon.png or assets/splash.png
bun run cap:assets
```

## Build & submit

### iOS

1. `bun run cap:sync`
2. `bun run cap:open:ios`
3. In Xcode: select your team, set a unique bundle ID if needed, choose **Any iOS Device (arm64)**.
4. **Product → Archive**, then **Distribute App** → **App Store Connect**.

### Android

1. `bun run cap:open:android`
2. In Android Studio: **Build → Generate Signed App Bundle / APK**.
3. Create/upload a release keystore (save it — you cannot update the app without it).
4. Upload the `.aab` to Google Play Console.

## Important notes

- The app loads `https://getpumppilot.app`. Make sure the live site stays online; the native shell is useless without it.
- If you later want to bundle the web app locally instead, change `server.url` to `undefined` and set `webDir` to a static build folder. You will also need to replace TanStack server functions with API calls.
- Apple sometimes rejects simple “website wrapper” apps. To reduce rejection risk, this wrapper already uses native splash screen, status bar styling, and the native share sheet. You can add more native features (push notifications, biometric lock, widgets) over time.
- Keep `capacitor-www/index.html` simple — it only appears when the remote URL cannot be reached.

## Push notifications

Momentum and scanner alerts are delivered to the device OS:

- **Native (iOS/Android)** — `@capacitor/local-notifications` schedules the alert; `@capacitor/push-notifications` registers the device with APNs/FCM for future server-sent pushes. The token is stored per device via Capacitor Preferences.
- **Browser** — falls back to the Web Notifications API.

Enable it from the **Realtime momentum alerts** card ("Enable push"), and make sure the *Push* channel is on in `/alerts` → Rules.

Platform setup needed before store builds:

- **Android** — `POST_NOTIFICATIONS` is declared in `AndroidManifest.xml`. For remote push add your Firebase `google-services.json` to `android/app/`.
- **iOS** — `UIBackgroundModes: remote-notification` is set in `Info.plist`. In Xcode enable the **Push Notifications** capability and upload an APNs key in the Apple Developer console.
