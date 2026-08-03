# Compass AI M25.2 — Widget Studio

M25.2 keeps the five-tab Compass structure:

- Home
- Messages
- Calendar
- Us
- Search

It turns each major pane into a configurable widget.

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
- Minimize/expand
- Hide
- Restore
- Reset
- Delete copied widgets

## Transparency correction
Transparency no longer changes the opacity of the text, buttons, icons, or the entire element.

Each panel now uses:
1. an isolated page-background layer that masks the interface underneath; and
2. a separate translucent surface layer.

This means reducing transparency reveals the app background or wallpaper—not the text and cards underneath the panel.

All settings persist locally in the standalone preview.
