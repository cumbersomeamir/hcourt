# Hcourt Mobile

React Native CLI TypeScript wrapper for the existing Hcourt responsive web application. It does not add a backend or duplicate API logic.

## Setup

```powershell
cd mobile
Copy-Item .env.example .env
npm install
```

Set `APP_WEB_URL` in `.env` to the deployed Hcourt domain before a production build. The app only permits WebView navigation and native downloads from that exact origin. Do not add API keys, credentials, or tokens to this file.

```powershell
npm start
npm run android
```

On macOS, install pods before running iOS:

```sh
cd mobile
npm install
bundle install
bundle exec pod install --project-directory=ios
npm run ios
```

## Native wrapper behavior

- Android back goes back within the WebView, then exits normally at the root page.
- `hcourt://court-view`, `hcourt://orders`, and other in-app paths open the matching configured web route.
- Network loss displays a native offline state; normal site pages remain unchanged when online.
- Direct PDFs and download URLs on the configured domain are sent to the platform download handler.
- Android 13+ notification permission is requested as push-notification groundwork. Connect APNs/FCM in `src/pushNotifications.ts` only after platform provider configuration is available.
- Set `APP_ENABLE_BIOMETRIC_LOCK=true` to require the device’s enrolled biometrics before loading the WebView.

## Release builds

Android (Windows):

```powershell
cd mobile
npm run android:apk
npm run android:aab
```

Artifacts are at `android/app/build/outputs/apk/release/app-release.apk` and `android/app/build/outputs/bundle/release/app-release.aab`. Configure your release signing key before distribution; the scaffold’s debug signing must not be used for Play Store releases.

iOS (macOS with an Apple signing team):

```sh
cd mobile
bundle exec pod install --project-directory=ios
cp ios/ExportOptions.plist.example ios/ExportOptions.plist
xcodebuild -workspace ios/HcourtMobile.xcworkspace -scheme HcourtMobile -configuration Release -archivePath build/HcourtMobile.xcarchive archive
xcodebuild -exportArchive -archivePath build/HcourtMobile.xcarchive -exportOptionsPlist ios/ExportOptions.plist -exportPath build/ipa
```

The IPA is written to `build/ipa`.
