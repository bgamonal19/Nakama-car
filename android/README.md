# NAKAMA CAR Android

Android 8+ app with an embedded WebView for the production application. Version 1.1.0 replaces the browser Custom Tab launcher: normal workshop navigation has no browser address bar. Internet is required; this is not an offline replacement for the web application.

The package and retained release certificate are unchanged, so Android can update 1.0.0 in place. WebView has its own session storage: users must sign in once after upgrading from the browser launcher. Subsequent sessions persist in the WebView.

## Behavior

- Only the production HTTPS origin is displayed inside the app; external HTTPS, telephone and email links use their corresponding external applications.
- JavaScript and DOM storage support the existing web app. TLS errors are rejected, mixed content and file access are disabled, and no JavaScript-to-Java interface is exposed.
- Android's file picker handles user-selected uploads without broad storage permissions.
- Existing estimate PDF blob popups are saved through Android's document picker. Transfer is limited to 16 MiB, read in bounded chunks, and checked for a PDF header.
- Android Back navigates page history. System bars, cutouts and the keyboard are inset from the content. Offline/load errors provide a retry button.
- Only the INTERNET permission is requested. No credentials or API keys are included.

## Build and checks

Use JDK 17, ANDROID_HOME pointing to Android SDK platform 35 and build tools 35.0.0:

```sh
bash android/build.sh
javac -d android/build/tests android/src/com/nakamacar/estimate/NavigationPolicy.java android/tests/NavigationPolicyTest.java
java -cp android/build/tests com.nakamacar.estimate.NavigationPolicyTest
node --test android/tests/native.test.cjs
```

Build output is unsigned. Sign locally using the retained private release key and official apksigner, then verify with `apksigner verify --verbose --print-certs`. Never commit or upload the signing key. Keep the same certificate and increment versionCode for updates.

Validated for this release: compilation, resource/package alignment, 24 URL-policy checks, seven popup/PDF JavaScript tests, and APK signature verification. Physical-device testing remains pending: install over 1.0.0, launch with no browser toolbar, login persistence, back navigation, file selection, PDF saving, rotation, keyboard/cutouts and offline retry.

## Release 1.1.0

APK SHA-256: `6c9e77373697c225e224b75107d8ef422fbbc613235925daadbd7cce29d9035a`

Release certificate SHA-256: `e16603b5d6e82af70442730eb9ccc96901e849b2c2f8e9d8b835e187b9157678`

## Release 1.1.1

The launcher icon is now an Android adaptive icon with a white background and the existing full-color logo inset by 21/108 on each edge. Android applies its device/launcher mask, including circles and rounded squares; both `icon` and `roundIcon` reference this resource. Fractional insets preserve the logo's margin at different launcher sizes. Brand colors are retained; a monochrome themed layer is not provided.

versionCode 3, same package and release certificate. Validated: Android compilation, alignment, compiled adaptive-icon resource references, and v2/v3 signatures. Launcher rendering on a physical device remains pending.

APK SHA-256: `db8deca9557e1c02d3b2e77cb0007863b463144acccf38ab9d7adf1dcd6afa1c`
