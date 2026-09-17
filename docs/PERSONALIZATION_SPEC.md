# CompassOS Personalization Product Contract

CompassOS must feel owned, finished, and configurable rather than like a diagnostic dashboard.

## Product rules

1. Daily surfaces never expose engineering language such as health, sync state, provider status, migration, beta, coming soon, or construction language unless an action genuinely failed. Diagnostics belong under Settings > Connections > Diagnostics.
2. Every major page must support an explicit Edit mode. Editable sections can be reordered, resized, hidden, restored, and reset. Hidden sections never delete underlying user data.
3. Personalization persists to the signed-in profile and follows the user across devices.
4. Navigation is user-owned: labels, order, visibility, sidebar density, and mobile favorites are customization concerns rather than fixed product assumptions.
5. Appearance changes apply live. The user should not need to save/reload to understand a setting.
6. Empty states describe the useful next action, not implementation status.
7. AI suggestions and outbound actions remain visibly distinct. Proposed actions require review before execution.
8. Connected-account identity remains available where provenance matters, but it should not dominate the visual hierarchy.
9. Mobile is a first-class layout, not a collapsed desktop layout.
10. Reset controls must exist at page, navigation, and full-personalization levels.

## Appearance Studio target

Theme mode; accent; density; corner radius; surface; motion; text scale; navigation mode; chrome; background; sidebar width; content width; card spacing; card elevation; border strength; header behavior; sidebar behavior; navigation visibility/order; mobile favorites; dashboard presets; page-specific layout; reduced-transparency/accessibility controls.

## Layout editing target

Direct manipulation is the primary interaction. Sections expose an edit handle while editing. Users can drag to reorder, select width, hide, restore, and reset. A settings panel remains available for precision and accessibility. Layout identity should use explicit `data-layout-id` values wherever possible so saved layouts survive content changes.

## Finished-product language

Prefer: Sources, Accounts, Connected, Updated, Review, Today, Workspace, Personal Studio.
Avoid on normal surfaces: Account health, System pulse, Live data, Sync health, Not implemented, Coming soon, Beta, Under construction.
