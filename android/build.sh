#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
android_sdk="${ANDROID_HOME:?ANDROID_HOME is required}"
tools_path="$android_sdk/build-tools/35.0.0"
platform="$android_sdk/platforms/android-35/android.jar"
mkdir -p build/res build/generated build/classes build/dex build/dist
"$tools_path/aapt2" compile --dir res -o build/compiled.zip
"$tools_path/aapt2" link -A assets --manifest AndroidManifest.xml -I "$platform" --java build/generated --min-sdk-version 26 --target-sdk-version 35 -o build/base.apk build/compiled.zip
javac -source 8 -target 8 -bootclasspath "$platform" -d build/classes src/com/nakamacar/estimate/*.java build/generated/com/nakamacar/estimate/R.java
"$tools_path/d8" --lib "$platform" --min-api 26 --output build/dex build/classes/com/nakamacar/estimate/*.class
cp build/base.apk build/unaligned.apk
(cd build/dex && zip -q -u ../unaligned.apk classes.dex)
"$tools_path/zipalign" -f -p 4 build/unaligned.apk build/dist/nakama-car-unsigned.apk
"$tools_path/zipalign" -c -v 4 build/dist/nakama-car-unsigned.apk
"$tools_path/aapt2" dump badging build/dist/nakama-car-unsigned.apk
# Include the official verifier for local release signing; no private key leaves the signing machine.
cp "$tools_path/lib/apksigner.jar" build/dist/apksigner.jar
