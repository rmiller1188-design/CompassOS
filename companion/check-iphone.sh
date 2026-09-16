#!/usr/bin/env bash
set -u

say(){ printf '%s\n' "$1"; }
missing=0

say "Compass Companion — iPhone connection check"
say ""

for tool in idevice_id idevicepair ideviceinfo idevicebackup2; do
  if command -v "$tool" >/dev/null 2>&1; then
    say "✓ $tool installed"
  else
    say "✗ $tool missing"
    missing=1
  fi
done

if [ "$missing" -eq 1 ]; then
  say ""
  say "Install the required ChromeOS Linux packages with:"
  say "sudo apt update && sudo apt install -y libimobiledevice-utils usbmuxd"
  exit 2
fi

say ""
ids="$(idevice_id -l 2>/dev/null || true)"
if [ -z "$ids" ]; then
  say "✗ No iPhone is visible to the Linux container."
  say "Unlock the iPhone, reconnect USB, tap Trust/Allow if prompted, and make sure ChromeOS exposes the USB device to Linux."
  exit 3
fi

id="$(printf '%s\n' "$ids" | head -n 1)"
say "✓ iPhone detected: ${id:0:8}…"

pair="$(idevicepair -u "$id" validate 2>&1 || true)"
if printf '%s' "$pair" | grep -qiE 'SUCCESS|validated'; then
  say "✓ Pairing/trust validated"
else
  say "! Pairing needs attention"
  say "Run: idevicepair -u $id pair"
  say "Keep the iPhone unlocked and accept Trust on the phone."
  exit 4
fi

name="$(ideviceinfo -u "$id" -k DeviceName 2>/dev/null || true)"
version="$(ideviceinfo -u "$id" -k ProductVersion 2>/dev/null || true)"
[ -n "$name" ] && say "✓ Device: $name"
[ -n "$version" ] && say "✓ iOS: $version"
say ""
say "READY: this Chromebook Linux environment can communicate with the iPhone."
say "Next step: Compass Companion can create a local Apple backup with idevicebackup2."
