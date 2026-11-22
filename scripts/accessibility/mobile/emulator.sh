#!/usr/bin/env bash
# Starts an isolated, account-free emulator using Google's Play system image.
set -euo pipefail
out="$GITHUB_WORKSPACE/test-output/mobile-access"
mkdir -p "$out"
sdk="$ANDROID_HOME/cmdline-tools/latest/bin"
emulator="$ANDROID_HOME/emulator/emulator"
image='system-images;android-37.2;google_apis_playstore_ps16k;x86_64'
sudo setfacl -m "u:$(id -un):rw" /dev/kvm
"$sdk/sdkmanager" --install 'emulator' 'platform-tools' "$image" > "$RUNNER_TEMP/android-install.log"
echo no | "$sdk/avdmanager" create avd --force --name accessible --device pixel_7 --package "$image"
nohup "$emulator" -avd accessible -no-window -no-snapshot -no-boot-anim -gpu swiftshader_indirect -no-metrics -noaudio > "$out/emulator.log" 2>&1 &
adb wait-for-device
for i in {1..150}; do
  if [[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]; then break; fi
  sleep 2
done
adb shell input keyevent KEYCODE_WAKEUP
adb shell wm dismiss-keyguard
adb shell pm list packages | sort > "$out/packages.txt"
{
  adb shell getprop ro.build.fingerprint
  adb shell getprop ro.build.version.release
  adb shell dumpsys package com.android.chrome | grep 'versionName=' | head -1
  adb shell dumpsys package com.google.android.marvin.talkback | grep 'versionName=' | head -1 || true
  adb shell cmd package query-services --brief -a android.accessibilityservice.AccessibilityService
} | tee "$out/environment.txt"
nohup python3 -m http.server 8941 --bind 127.0.0.1 > "$RUNNER_TEMP/site-server.log" 2>&1 &
adb reverse tcp:8941 tcp:8941
