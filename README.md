# Compass AI M25.2 — Widget Studio

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https%3A%2F%2Fgithub.com%2Frmiller1188-design%2FCompassOS)

Compass AI is a condensed two-person communications OS prototype built around five primary destinations:

- Home
- Messages
- Calendar
- Us
- Search

The repository contains the finalized M25.2 interactive release and a root-level `render.yaml` Blueprint for deployment as a free Render static site.

## Deploy on Render

1. Click **Deploy to Render** above.
2. Sign in to Render and review the `compass-os` static site Blueprint.
3. Approve the Blueprint deployment.
4. Render will publish the site and automatically redeploy future commits to `main`.

## Widget sizing

- Small
- Medium
- Large
- Wide
- Full width
- Exact 2–12 column width
- Automatic or fixed height
- Exact fixed height
- Adjustable internal padding

## Layout

- Click a widget to edit it
- Drag widgets to rearrange them
- Move earlier or later
- Layout order persists per screen
- Home, Messages, Calendar, Us, and Search each keep their own layout
- Reset one screen without resetting the others

## Text and typography

- Edit widget title
- Edit first supporting text
- Direct on-widget text editing
- Apple/System font
- Rounded font
- Serif font
- Monospace font
- Humanist font
- Title size
- Body size
- Title weight
- Line height
- Letter spacing
- Left, center, or right alignment
- Independent title and body colors

## Panel styling

- Per-widget background color
- Background-only transparency
- Corner radius
- Border width
- Border color
- None, soft, standard, strong, or glow shadow

## Widget actions

- Duplicate
- Minimize or expand
- Hide
- Restore
- Reset
- Delete copied widgets

## Transparency correction

Transparency no longer changes the opacity of the text, buttons, icons, or the entire element.

Each panel uses:

1. An isolated page-background layer that masks the interface underneath.
2. A separate translucent surface layer.
3. A fully opaque content layer for text, buttons, and icons.

Reducing transparency reveals the app background or wallpaper—not the text and cards underneath the panel.

## Prototype boundaries

- No live Gmail or Microsoft OAuth is enabled yet.
- No unrestricted native iMessage or carrier call-history access is claimed.
- Money movement is simulated and requires a production payment provider before real transfers.
- Files and preferences persist locally in the browser preview.
