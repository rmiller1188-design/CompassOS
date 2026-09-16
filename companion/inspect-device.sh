#!/usr/bin/env bash
set -euo pipefail

printf 'Compass Companion — lightweight device inspection\n\n'
UDID="$(idevice_id -l | head -n1)"
if [ -z "$UDID" ]; then
  echo 'No iPhone detected.' >&2
  exit 2
fi
idevicepair -u "$UDID" validate >/dev/null
printf 'Device: %s\n' "$(ideviceinfo -u "$UDID" -k DeviceName 2>/dev/null || echo iPhone)"
printf 'iOS: %s\n' "$(ideviceinfo -u "$UDID" -k ProductVersion 2>/dev/null || echo unknown)"
printf 'UDID: %.8s…\n' "$UDID"
printf '\nConnection ready. No full-device backup was started.\n'
printf 'Compass will use small, dataset-specific working files rather than retaining the photo/video library.\n'
