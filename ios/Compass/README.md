# Compass iPhone Companion Scaffold

This folder contains the Swift source for the first native Compass companion and Share extension.

## Xcode targets

Create one Xcode project named `Compass` with:

1. iOS App target: `Compass`
2. Share Extension target: `CompassShare`
3. App Group shared by both targets: `group.com.compass.youandus`
4. Keychain Access Group shared by both targets: `YOUR_TEAM_ID.com.compass.youandus.shared`

Add the Swift files from `App`, `Shared`, and `ShareExtension` to the matching targets.

## Required configuration

- Set `CompassConfiguration.apiBaseURL` to the deployed M26 web URL.
- Store the signed-in Supabase access token in the shared Keychain group.
- Store the selected private/shared workspace IDs in the App Group defaults.
- Add the `CompassShare` extension to the app.

## Share flow

The extension receives only content explicitly selected by the user through the iOS Share Sheet. It can send:

- text
- URLs
- photos
- videos
- PDFs and documents

The extension does not read historical iMessage conversations. It submits selected content to `/api/share-intake` with the user’s Supabase bearer token and chosen workspace.

## Distribution

Local testing can be performed from Xcode. TestFlight distribution requires an Apple Developer Program account and App Store Connect configuration.
