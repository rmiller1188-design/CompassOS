#!/usr/bin/env bash
set -u

echo "Compass Companion — selective-access probe"
echo
UDID="$(idevice_id -l 2>/dev/null | head -n1)"
if [ -z "$UDID" ]; then
  echo "FAIL: No iPhone detected."
  exit 2
fi
if ! idevicepair -u "$UDID" validate >/dev/null 2>&1; then
  echo "FAIL: iPhone pairing/trust is not valid."
  exit 3
fi
echo "PASS: iPhone connected and trusted."

if command -v afcclient >/dev/null 2>&1; then
  echo "PASS: afcclient is installed."
  echo "INFO: Standard AFC exposes user media/file-sharing areas, not the protected Messages database."
else
  echo "INFO: afcclient is not installed; this does not block MobileBackup2."
fi

if command -v ifuse >/dev/null 2>&1; then
  echo "PASS: ifuse is installed."
  echo "INFO: Standard ifuse/AFC access is sandboxed. Root filesystem access requires AFC2 on a jailbroken device."
else
  echo "INFO: ifuse is not installed."
fi

echo
echo "RESULT: Direct protected sms.db extraction is not provided by standard AFC/House Arrest."
echo "RESULT: idevicebackup2 exposes full/incremental backup, but no supported per-file backup selector."
echo "Compass should not promise direct selective Messages extraction through these stock services."
