#!/usr/bin/env bash
# Starts an isolated, account-free emulator using Google's Play system image.
set -euo pipefail
out="$GITHUB_WORKSPACE/test-output/mobile-access"
mkdir -p "$out"
export ANDROID_AVD_HOME="$RUNNER_TEMP/rgaa-avds" ANDROID_USER_HOME="$RUNNER_TEMP/rgaa-android-user"
mkdir -p "$ANDROID_AVD_HOME" "$ANDROID_USER_HOME"
echo "ANDROID_USER_HOME=$ANDROID_USER_HOME" >> "$GITHUB_ENV"
export PATH="$ANDROID_HOME/platform-tools:$PATH"
echo "$ANDROID_HOME/platform-tools" >> "$GITHUB_PATH"
sdk="$ANDROID_HOME/cmdline-tools/latest/bin"
emulator="$ANDROID_HOME/emulator/emulator"
image='system-images;android-37.2;google_apis_playstore_ps16k;x86_64'
sudo setfacl -m "u:$(id -un):rw" /dev/kvm
"$sdk/sdkmanager" --install 'emulator' 'platform-tools' "$image" > "$RUNNER_TEMP/android-install.log"
avd="$ANDROID_AVD_HOME/accessible.avd"
echo no | "$sdk/avdmanager" create avd --force --name accessible --path "$avd" --device pixel_7 --package "$image"
test -s "$avd/config.ini"
# Both SDK tools now use the same explicit AVD index, including newer emulator releases.
printf 'avd.ini.encoding=UTF-8\npath=%s\ntarget=android-37.2\n' "$avd" > "$ANDROID_AVD_HOME/accessible.ini"
"$emulator" -list-avds | grep -Fx accessible
# Keep the guest audio mixer active for the emulator's native WebM recorder.
# This software-only ALSA endpoint has no physical speaker or microphone.
export ALSA_CONFIG_PATH="$RUNNER_TEMP/rgaa-asound.conf"
printf 'pcm.!default { type null }\n' > "$ALSA_CONFIG_PATH"
nohup "$emulator" -avd accessible -no-window -no-snapshot -no-boot-anim -gpu swiftshader_indirect -no-metrics -audio alsa > "$out/emulator.log" 2>&1 &
emulator_pid=$!
for i in {1..30}; do
  kill -0 "$emulator_pid" 2>/dev/null || { tail -35 "$out/emulator.log"; exit 1; }
  if timeout 7 adb wait-for-device; then break; fi
done
test "$(adb get-state)" = device
for i in {1..150}; do
  if [[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == 1 ]]; then break; fi
  sleep 2
done
[[ "$(adb shell getprop sys.boot_completed | tr -d '\r')" == 1 ]] || { tail -35 "$out/emulator.log"; exit 1; }
# Android can restart adbd just after its first completed boot. Keep the temporary
# AVD, and require three consecutive working shell queries before starting Chrome.
sleep 10
settled=0
for i in {1..30}; do
  if [[ "$(timeout 6 adb shell getprop sys.boot_completed 2>/dev/null | tr -d '\r')" == 1 ]]; then
    settled=$((settled + 1))
    if ((settled >= 3)); then break; fi
  else
    settled=0
    timeout 6 adb reconnect offline >/dev/null 2>&1 || true
  fi
  sleep 2
done
((settled >= 3)) || { tail -30 "$out/emulator.log"; exit 1; }
read_device() {
  for i in {1..6}; do
    if adb "$@"; then return 0; fi
    timeout 12 adb wait-for-device || true
    sleep 2
  done
  return 1
}
read_device shell input keyevent KEYCODE_WAKEUP
read_device shell wm dismiss-keyguard
read_device shell pm list packages | sort > "$out/packages.txt"
{
  read_device shell getprop ro.build.fingerprint
  read_device shell getprop ro.build.version.release
  read_device shell dumpsys package com.android.chrome | grep 'versionName=' | head -1
  read_device shell dumpsys package com.google.android.marvin.talkback | grep 'versionName=' | head -1 || true
  read_device shell cmd package query-services --brief -a android.accessibilityservice.AccessibilityService
} | tee "$out/environment.txt"
nohup python3 scripts/accessibility/mobile/server.py > "$RUNNER_TEMP/site-server.log" 2>&1 &
read_device reverse tcp:8941 tcp:8941
