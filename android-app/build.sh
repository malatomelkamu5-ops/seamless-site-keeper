#!/usr/bin/env bash
# Builds public/BHSSS-Exam.apk. Needs: Android build-tools 34 in $BT, android-34 android.jar in $PLATFORM,
# a JDK on PATH, and the signing keystore in $KEYSTORE (keep the same one so updates install over the old app).
set -euo pipefail
cd "$(dirname "$0")"
BT=${BT:-/tmp/apk/android-14}; PLATFORM=${PLATFORM:-/tmp/apk/android-34/android.jar}
KEYSTORE=${KEYSTORE:-/mnt/documents/.lovable/android/bhsss-exam.keystore}; VERSION=${VERSION:-2}
OUT=/tmp/apk/out; rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/obj" "$OUT/dex"
"$BT/aapt2" compile --dir res -o "$OUT/res.zip"
"$BT/aapt2" link -o "$OUT/base.apk" -I "$PLATFORM" --manifest AndroidManifest.xml --java "$OUT/gen" \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VERSION" --version-name "1.$VERSION" "$OUT/res.zip"
javac -encoding UTF-8 -source 8 -target 8 -bootclasspath "$PLATFORM" -classpath "$PLATFORM" -d "$OUT/obj" $(find src "$OUT/gen" -name '*.java')
"$BT/d8" --lib "$PLATFORM" --min-api 24 --output "$OUT/dex" $(find "$OUT/obj" -name '*.class')
(cd "$OUT/dex" && zip -q "$OUT/base.apk" classes.dex)
"$BT/zipalign" -f -p 4 "$OUT/base.apk" "$OUT/aligned.apk"
"$BT/apksigner" sign --ks "$KEYSTORE" --ks-pass env:KS_PASS --out ../public/BHSSS-Exam.apk "$OUT/aligned.apk"
"$BT/apksigner" verify --print-certs ../public/BHSSS-Exam.apk | head -2
