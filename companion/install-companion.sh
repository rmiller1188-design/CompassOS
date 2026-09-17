#!/usr/bin/env bash
set -euo pipefail
INSTALL="$HOME/CompassOS/CompanionApp"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
printf '\nInstalling Compass Companion...\n'
for cmd in idevice_id idevicepair ideviceinfo; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    printf 'Required iPhone tools are missing. Run:\n  sudo apt update && sudo apt install -y libimobiledevice-utils usbmuxd\n'
    exit 1
  fi
done
mkdir -p "$INSTALL"
cp "$ROOT/compass-companion.sh" "$INSTALL/compass-companion"
cp "$ROOT/export-messages.py" "$INSTALL/export-messages.py"
chmod +x "$INSTALL/compass-companion" "$INSTALL/export-messages.py"
mkdir -p "$HOME/.local/bin"
ln -sf "$INSTALL/compass-companion" "$HOME/.local/bin/compass-companion"
printf '\nCompass Companion installed.\nRun it with:\n  ~/.local/bin/compass-companion\n\n'
