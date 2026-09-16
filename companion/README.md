# Compass Companion

Compass Companion is the local device bridge for CompassOS. It is intentionally separate from the hosted web app because browsers cannot directly read protected iPhone backup databases.

## Chromebook target

The first target is ChromeOS with the Linux development environment enabled.

The Companion performs a capability check before offering backup/import actions:

1. Confirm Linux environment.
2. Confirm `libimobiledevice` tools are installed.
3. Detect a USB-connected iPhone with `idevice_id`.
4. Confirm pairing/trust with `idevicepair`.
5. Confirm `idevicebackup2` is available.
6. Only then enable local backup creation.

## Privacy model

- Device pairing and backup happen locally.
- No backup is uploaded automatically.
- Compass only receives data after an explicit import action.
- Raw backup folders remain local unless the user deliberately selects them.

## Current web support

CompassOS currently processes Messages CSV and Call History CSV through `/api/import/phone`. The iPhone Import Center also exposes the categories planned for the Companion: Messages, Calls, Voicemail, Contacts, Photos & Videos, Calendar, Notes & Files.

## Next parser layer

The backup parser will map supported Apple backup records into Compass data models while preserving source timestamps and deterministic external IDs for deduplication. Protected/encrypted backups will require local unlock credentials and will never send those credentials to CompassOS.
