# NAKAMA CAR Android

An installable Android 8+ launcher for the production web application. Opens a secure browser Custom Tab, with normal browser fallback where Custom Tabs are unavailable. Requires an installed web browser and internet access. Browser chrome may be visible. This is not an offline/native replacement for the web application.

The installed icon uses the existing NAKAMA CAR logo. The browser manages login sessions, uploads, PDF downloads, TLS and web permissions. This APK requests no Android permissions and contains no credentials or API keys.

## Build

With JDK 17, Android SDK platform 35 and build tools 35.0.0 installed:

```sh
bash android/build.sh
```

Output is unsigned. Sign it locally using the retained private release key with the official `apksigner`, then run `apksigner verify --verbose --print-certs` and record the APK SHA-256. Never commit or upload the release signing key. Keep the same key and increment versionCode for future updates.

The build script verifies package alignment and prints manifest/resource metadata. A physical-device smoke test remains necessary for the final signed release (install, launch, login, file selection, PDF download and back navigation).

## Release 1.0.0

APK SHA-256: `4790dd24412bacbe7294a0c19ff22de47562787f79fdf361fbb1382616cb13c3`

Release certificate SHA-256: `e16603b5d6e82af70442730eb9ccc96901e849b2c2f8e9d8b835e187b9157678`
