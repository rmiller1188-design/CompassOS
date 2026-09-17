#!/usr/bin/env bash
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="$HOME/CompassOS/Companion"
mkdir -p "$WORK"
clear
printf '\n  Compass Companion\n  Your iPhone bridge for CompassOS\n\n'
missing=0
for cmd in idevice_id idevicepair ideviceinfo; do
  if ! command -v "$cmd" >/dev/null 2>&1; then printf '  ✕ Missing: %s\n' "$cmd"; missing=1; fi
done
if [ "$missing" -eq 1 ]; then
  printf '\n  Install the required Chromebook Linux tools with:\n  sudo apt update && sudo apt install -y libimobiledevice-utils usbmuxd\n\n'
  exit 1
fi
DEVICE="$(idevice_id -l 2>/dev/null | head -n1 || true)"
if [ -z "$DEVICE" ]; then
  printf '  iPhone: Not connected\n\n  Connect the iPhone with USB-C, unlock it, and approve Trust if prompted.\n\n'
  exit 2
fi
if ! idevicepair validate >/dev/null 2>&1; then
  printf '  iPhone: Connected, not trusted\n\n  Unlock the iPhone, approve Trust, then run this again.\n\n'
  exit 3
fi
NAME="$(ideviceinfo -k DeviceName 2>/dev/null || printf 'iPhone')"
IOS="$(ideviceinfo -k ProductVersion 2>/dev/null || printf 'Unknown')"
printf '  ✓ %s connected\n' "$NAME"
printf '  ✓ Trusted\n'
printf '  ✓ iOS %s\n\n' "$IOS"
printf '  Available now\n'
printf '  [1] Check connection again\n'
printf '  [2] Convert a local Apple Messages sms.db to Compass CSV\n'
printf '  [3] Open Compass Import Center\n'
printf '  [4] Show protected-data sync status\n'
printf '  [q] Quit\n\n'
read -r -p '  Choose: ' choice
case "$choice" in
  1) exec "$0" ;;
  2)
    read -r -p '  Path to sms.db: ' db
    if [ ! -f "$db" ]; then printf '\n  File not found.\n'; exit 4; fi
    out="$WORK/messages-$(date +%Y%m%d-%H%M%S).csv"
    python3 "$ROOT/export-messages.py" "$db" "$out" && printf '\n  Created: %s\n' "$out"
    ;;
  3)
    url='https://compass-os-m26.onrender.com/app/settings/connections'
    if command -v garcon-url-handler >/dev/null 2>&1; then garcon-url-handler "$url" >/dev/null 2>&1 & else printf '\n  Open: %s\n' "$url"; fi
    ;;
  4)
    printf '\n  Protected Messages / Calls / Voicemail direct sync: EXPERIMENTAL\n'
    printf '  Your iPhone connection is working, but Compass will not start a full backup on this Chromebook.\n'
    printf '  The storage-bounded MobileBackup2 bridge is still under development.\n'
    ;;
  q|Q) exit 0 ;;
  *) printf '\n  Unknown choice.\n'; exit 5 ;;
esac
printf '\n'
