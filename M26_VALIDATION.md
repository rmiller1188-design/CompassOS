# Compass M26 Validation Status

Date: 2026-08-06

## Current branch

- Branch: `m26-connected-accounts`
- Current branch head: `06459d3b2882a1671d45dff2c53fb80e5ef0dd5a`
- Current source-code head under validation: `c3fe524df53ac335ab2cbbbd0a0761b9882b34f0`
- Main release PR: #3 (draft)
- Production M25.2 on `main` remains unchanged.

The only commit after the source-code head updates this validation document; application source is unchanged.

## Completed environment checks

- Supabase migrations 001-006 executed.
- Render M26 service reached live/readiness state.
- Google OAuth connection and real Gmail synchronization verified.
- Google Calendar all-calendar import implemented.
- Connected message, calendar, search, settings, tasks, Us sharing, and file workflows expanded.

## Interaction hardening

The current branch includes:

- working task status, open/detail, due-date, source-message, and delete controls;
- working message quick summary, local draft, copy, and follow-up actions;
- clickable message, calendar, contact, search, file, dashboard, shared-event, settings, and navigation controls;
- secure file open, download, and delete routes;
- calendar-to-task and calendar-to-Us actions;
- visible success, error, busy, cancellation, focus, hover, and pressed feedback;
- a source audit that rejects permanently disabled or deceptive preview controls during `npm run typecheck`;
- a local Daily Brief fallback when no OpenAI API key is configured.

## Automated validation

The previous validation run confirmed:

- ordered migrations: PASS
- dependency installation: PASS
- TypeScript: PASS

That run found one ESLint issue in secure file navigation. Commit `c3fe524df53ac335ab2cbbbd0a0761b9882b34f0` replaced the rejected direct location assignment with a standards-safe new-window action. A clean Node 22 validation run is queued for that exact source commit.

Do not mark PR #3 ready or merge it until the current validation run completes successfully and the deployed M26 service is smoke-tested after Render reports Live.

## Remaining external checks

- Microsoft Entra authorization and real sync
- two-account privacy and Us invitation acceptance test
- Xcode compile/signing on macOS
