# CompassOS — Engineering Handoff

Updated: 2026-09-17
Handoff baseline commit: `f5bbbca0c7932cf450c1d5238f3a3aac060f5b49`
Safe rollback branch: `checkpoint-pre-cto-2026-09-17`
Production branch: `m26-connected-accounts`
CTO working branch: `cto-transfer`

## 1. Purpose
CompassOS is a private personal/household operating system. It should feel understandable to an ordinary iPhone user, not like an enterprise dashboard. The product direction is: more capability, less interface.

Primary users are a household/couple. Main surfaces should prioritize communication, calendar, people, photos, files, memories, shared household information, search and simple customization.

DO NOT reintroduce estimating, construction, project engineering, RFIs, scope tracking, work dashboards or other employment-specific functionality into the consumer product.

## 2. Product principles
- Consumer-first and iOS-inspired, but not an Apple clone.
- Main screens contain useful information, not configuration explanations.
- Technical/provider/configuration details belong in Settings.
- Progressive disclosure: summary first, full content when opened.
- No fake/demo communications or household records in production UI.
- Search should span the user's useful personal information.
- Desktop and mobile must both be first-class.
- Accessibility, responsive behavior and readable contrast matter.
- Deep customization is welcome, but complexity stays behind Settings/Edit controls.

## 3. Current primary information architecture
Desktop primary navigation:
- Home
- Messages
- Phone
- Calendar
- People
- Photos
- Files
- Us
- Search

Mobile fixed navigation currently targets five high-frequency areas:
- Home
- Messages
- Phone
- Photos
- Us

Settings is reached separately.

## 4. Current stack / infrastructure
Repository: `rmiller1188-design/CompassOS`
Production branch: `m26-connected-accounts`
Production URL: `https://compass-os-m26.onrender.com`
App URL: `https://compass-os-m26.onrender.com/app`

Application is Next.js/TypeScript and uses Supabase for auth/data. Production hosting is Render. Render is configured for automatic deployment from `m26-connected-accounts`; do not manually trigger duplicate deployments after a push unless auto-deploy is disabled or a redeploy is explicitly required.

Supabase project ref currently used by production: `lbsovxsnjhrrgmuetvis`.

Never commit credentials, access tokens, API keys, OAuth client secrets, Supabase service-role keys or device identifiers. Preserve the existing environment-variable model.

Do not migrate infrastructure merely because another stack is preferred. Any Supabase/Render replacement requires an explicit architectural reason and owner approval.

## 5. Current consumer UI status
### Home
Simplified consumer Home exists. It contains a greeting, app grid, recent messages, Up Next, and Photos/Memories-oriented content. Previous work/estimating dashboard concepts were removed.

### Messages
`src/app/app/messages/page.tsx`

Current Messages supports combined views for:
- All
- Texts
- Calls
- Voicemail
- Gmail
- Outlook

It reads actual `communication_items`. When `body_text` exists, the conversation displays the actual plain-text body rather than only a preview.

Known defect: mobile conversation behavior still needs correction. Existing CSS hides `.conversation-clean` below approximately 720px. Implement a proper mobile inbox → conversation → Back flow without breaking desktop split-view behavior. Prefer explicit selection state/query behavior over brittle viewport hacks.

HTML email rendering and rich attachment rendering are not complete.

### Phone
`src/app/app/phone/page.tsx`

Dedicated Phone hub exists and uses real `communication_items` with `call` and `voicemail` channels. It shows Recents and Voicemail and links to filtered Messages views. Do not populate it with fabricated calls.

Phone-specific styling still needs a full responsive/theme audit.

### Photos
Consumer Photos surface exists with library/category concepts including Albums/Memories/Favorites/Videos/Shared and related categories added during iteration. It currently relies on available file/media records. Real Apple-style album/memory/person models and complete thumbnail/media ingestion are not finished.

### Files / People / Calendar / Us
These should become coherent consumer applications using the same visual language. Continue simplifying and making each useful rather than adding dashboard density.

## 6. Appearance Studio
Appearance settings were redesigned toward a consumer personalization studio with theme preset, light/dark, width, density, accent, background, card style/depth, corner shape, spacing, navigation, top bar, text size, emphasis, transparency/descriptions/date-time toggles and animation.

There are multiple preset/accent/background/surface values in `src/lib/personalization.ts`, the appearance API and personalization CSS.

Known issue: some consumer surfaces still use hardcoded white/light colors in `src/app/globals.css`, so dark themes can produce white cards and poor text contrast. Propagate theme variables across Home, Messages, Phone, Photos and subsequent consumer surfaces. Do not merely add more presets until existing presets render consistently.

## 7. Connected accounts
Connected Accounts lives at `/app/settings/connections`.

Gmail and Outlook are intended to coexist. Provider complexity should be hidden from ordinary main-screen use while still visible/manageable in Settings.

The page also contains the iPhone Import Center.

## 8. iPhone Import Center
`src/components/phone-import.tsx`

Intended categories:
- Messages
- Calls
- Voicemail
- Contacts
- Photos & Videos
- Calendar
- Notes & Files

The browser uploader accepts common CSV/contact/calendar/media/document formats, but backend automatic processing is currently primarily the CSV phone-import route. Do not imply every accepted/staged format has a complete parser.

Existing route: `src/app/api/import/phone/route.ts`.

It can detect supported message/call CSV exports and insert into `communication_items` using provider `iphone` and channels such as `sms`/`call`. Review deduplication and database uniqueness before treating repeated/racing imports as fully idempotent.

## 9. Compass Companion
`companion/`

Companion exists because a normal web application cannot directly read protected iPhone Messages/call/voicemail databases.

Intended architecture:
`iPhone -> USB -> ChromeOS/Crostini Linux -> Compass Companion -> user-approved Compass import`

Current components include device/pairing diagnostics, backup/capability research, a local Apple Messages `sms.db` exporter, a one-command launcher and Chromebook/Linux installer.

Recent files include:
- `companion/check-iphone.sh`
- `companion/inspect-device.sh`
- `companion/check-selective-access.sh`
- `companion/export-messages.py`
- `companion/stream-backup-prototype.md`
- `companion/compass-companion.sh`
- `companion/install-companion.sh`

The launcher is an early CLI interface, not yet a polished packaged Chromebook application.

## 10. Verified iPhone/Chromebook facts
Testing on the target Chromebook has established:
- Crostini Linux can see the connected iPhone through `libimobiledevice`/`usbmuxd`.
- `idevice_id -l` detected the device.
- `idevicepair validate` succeeded.
- `ideviceinfo` successfully read device information.
- The tested iPhone reports iOS 26.5.
- MobileBackup2 negotiation succeeded using `idevicebackup2`.
- A full backup failed with Apple `MBErrorDomain/105` due insufficient destination free space.

The iPhone has far more used storage than the Chromebook can accommodate. A conventional full-device backup is therefore not a viable production workflow on this target machine.

ChromeOS Files exposing a small collection of photos/videos over USB is normal DCIM/media access and must not be confused with access to protected Messages/call databases.

## 11. Protected iPhone data boundary
Do not claim direct protected-data synchronization is working yet.

Established constraints:
- Stock `idevicebackup2` is a full/incremental backup client; it does not provide a supported simple `backup only sms.db` selector.
- Ordinary AFC/House Arrest access is sandboxed and cannot read the stock protected Messages/call databases.
- Root/AFC2-style access would require a jailbroken device and is not an acceptable product requirement.
- A normal full backup cannot fit on the current Chromebook.

Current research direction is a storage-bounded MobileBackup2 client/streaming prototype that could potentially acknowledge the backup protocol while retaining only Compass-relevant records and discarding unrelated large payloads. This remains experimental and MUST be proven against the real device before the UI advertises it as working.

Research questions before implementation claims:
1. Precisely how MobileBackup2 communicates/checks destination free space and what produces Error 105.
2. Whether incoming transfer metadata identifies domain/path/file sufficiently early to selectively retain target data.
3. Manifest ordering/availability and how file IDs map to protected databases.
4. Whether a custom client can safely discard unrelated payload while maintaining protocol correctness, consistency and backup status.
5. Encryption/password behavior and safe local handling.

Do not solve this by silently creating a huge backup and deleting files afterward; that does not solve the storage constraint.

## 12. Privacy/security rules
- Phone extraction is local-first.
- Import only data the user intentionally selects/authorizes.
- Never upload an entire iPhone backup to Compass cloud storage as an implementation shortcut.
- Never expose or log raw device UDIDs unnecessarily.
- Never request secrets in chat or commit them to the repository.
- Do not weaken authentication to make integrations easier.
- Preserve user isolation (`owner_id` or equivalent) on imported records.
- Clearly distinguish experimental capability from verified functionality.

## 13. Immediate engineering priorities
Work in this order unless a discovered dependency changes it:

1. Fix mobile Messages inbox/conversation navigation and add a proper Back path while retaining full `body_text` display.
2. Finish responsive/theme-aware Phone styling.
3. Remove hardcoded light surfaces from the current consumer UI and make Appearance themes consistent.
4. Improve Photos into a genuinely useful library/album/memory experience using real records.
5. Improve Files.
6. Improve People.
7. Improve Calendar.
8. Improve Home and Us as the shared household layer.
9. Refine Appearance Studio after the surfaces correctly consume its variables.
10. Continue Companion as a separate, explicitly experimental engineering track; prove storage-bounded protected-data extraction before integrating a direct-sync promise.

## 14. Quality bar
Before describing a feature as finished:
- inspect the current implementation rather than relying on this document alone;
- build/typecheck/lint using the repository's actual scripts;
- test relevant routes at mobile and desktop widths;
- verify empty states and real-data states;
- verify light and dark themes;
- verify auth/user isolation for data changes;
- avoid fake production records;
- state remaining limitations explicitly.

Production changes should normally arrive through a reviewed branch/PR. Do not point experimental development directly at the production branch.

## 15. Handoff / rollback protocol
The exact pre-handoff code state is preserved at:
`checkpoint-pre-cto-2026-09-17`

That branch points to baseline commit:
`f5bbbca0c7932cf450c1d5238f3a3aac060f5b49`

The existing production branch remains:
`m26-connected-accounts`

CTO/new-agent work should use:
`cto-transfer`

Do not merge `cto-transfer` into production automatically. Produce reviewable commits/PRs. If the experiment is abandoned, return to `m26-connected-accounts` or the checkpoint branch; no pre-handoff work needs to be reconstructed from memory.

When handing work back, update this document with:
- latest working commit;
- files changed;
- migrations/schema changes;
- environment variables added/removed (names only, never values);
- verified features;
- known failures;
- build/test results;
- exact next task.

## 16. Definition of success
CompassOS should ultimately feel like one coherent private household system rather than a collection of dashboards: messages and phone history that open into real content; useful calendar and people views; photos, albums and memories; organized files; shared household information in Us; strong global search; and personalization that works consistently without exposing implementation complexity.

Preserve what already works. Improve incrementally. Verify before claiming completion.