#!/usr/bin/env bash
set -euo pipefail

BASE="${COMPASS_BACKUP_DIR:-$HOME/CompassOS/iPhoneBackups}"
mkdir -p "$BASE"

for tool in idevice_id idevicepair ideviceinfo idevicebackup2; do
  command -v "$tool" >/dev/null 2>&1 || { echo "Missing $tool. Run companion/check-iphone.sh first."; exit 2; }
done

UDID="$(idevice_id -l 2>/dev/null | head -n1 || true)"
[ -n "$UDID" ] || { echo "No iPhone detected. Unlock and reconnect it, then run the connection check."; exit 3; }

idevicepair -u "$UDID" validate >/dev/null 2>&1 || { echo "iPhone is not paired/trusted. Keep it unlocked and run: idevicepair -u $UDID pair"; exit 4; }

NAME="$(ideviceinfo -u "$UDID" -k DeviceName 2>/dev/null || echo iPhone)"
SAFE_NAME="$(printf '%s' "$NAME" | tr -cd '[:alnum:]_.-' | cut -c1-40)"
STAMP="$(date +%Y%m%d-%H%M%S)"
TARGET="$BASE/${SAFE_NAME:-iPhone}-$STAMP"
mkdir -p "$TARGET"

echo "Compass Companion"
echo "Device: $NAME"
echo "Local backup folder: $TARGET"
echo ""
echo "Nothing is uploaded to Compass during this step."
echo "Keep the iPhone unlocked and connected until the backup completes."
echo ""

idevicebackup2 -u "$UDID" backup --full "$TARGET"

echo ""
echo "Backup command completed. Validating backup metadata..."
if idevicebackup2 -u "$UDID" info "$TARGET" >/dev/null 2>&1; then
  echo "READY: local Apple backup completed and is readable."
  printf '%s\n' "$TARGET" > "$BASE/.latest"
  echo "Saved as latest Compass backup: $TARGET"
else
  echo "WARNING: backup command returned but Compass could not validate it with idevicebackup2 info."
  exit 5
fi
