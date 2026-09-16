# Streaming MobileBackup2 prototype

## Goal

Determine whether Compass Companion can consume an iPhone MobileBackup2 stream while retaining only Compass-relevant records and discarding large payloads such as the camera/media library.

## Confirmed constraints

- The user's Chromebook Linux environment can detect and pair with the iPhone through libimobiledevice.
- `idevicebackup2` can start a MobileBackup2 backup, but the Chromebook cannot retain a full backup of the user's device.
- Stock iOS does not expose the protected Messages database through ordinary AFC access.
- `idevicebackup2` does not provide a supported per-domain/per-file backup selector.

## Prototype decision

Do not modify or wrap the installed `idevicebackup2` executable and do not pretend that deleting files after they are written solves the storage problem. The phone performs free-space checks and the backup protocol expects filesystem semantics/state.

A legitimate streaming implementation therefore requires a purpose-built MobileBackup2 client using libimobiledevice/mobilebackup2 APIs. It must correctly handle protocol messages, metadata, manifests, status responses, encryption state, and backup consistency while selectively persisting payloads.

That work is materially different from shelling out to `idevicebackup2` and is not yet proven against iOS 26.5.

## Compass policy

Until that client is proven:

1. Do not initiate a full backup on storage-constrained Chromebooks.
2. Keep the existing CSV import path operational for Messages and Calls.
3. Keep the local `sms.db` parser available for backups produced elsewhere.
4. Treat Photos/Videos separately through user-selected media access rather than forcing them through MobileBackup2.
5. Continue consumer CompassOS work independently of this experimental bridge.

## Exit criteria

The streaming prototype is successful only when it can:

- pair with a stock iPhone;
- negotiate MobileBackup2;
- complete the protocol without corrupting backup state;
- retain a known Compass-relevant file while discarding an unrelated large payload;
- remain under a bounded local storage budget;
- repeat successfully for an incremental sync.

Until all six are demonstrated, the UI must not label this feature as direct/selective iPhone sync.
