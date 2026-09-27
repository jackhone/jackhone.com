# Booking Page Setup

An unlisted page that lets people book time straight into my Cal.com calendar, styled
with the site's own design tokens instead of a Cal.com embed.

Live URL: **https://jackhone.com/book/m9qtetikcnkt/**

It is deliberately not linked from anywhere on the site. Share the link directly.

## Files

| File | Purpose |
| --- | --- |
| `book/m9qtetikcnkt/index.html` | The booking page itself |
| `book/index.html` | Placeholder so `/book/` never renders a directory listing |
| `booking.js` | Availability fetching, slot picking, and booking submission |
| `styles.css` | Booking styles, under the "Booking page (Cal.com)" comment |

## How it works

The page calls the public Cal.com API v2 directly from the browser:

- `GET https://api.cal.com/v2/slots` — real availability for the next 60 days
- `POST https://api.cal.com/v2/bookings` — creates the booking

Both endpoints accept unauthenticated requests and return
`access-control-allow-origin: *`, so **no API key and no backend are needed**. That
matters because this site is a static GitHub Pages deploy with nowhere to hide a
secret. Nothing sensitive ships to the browser.

Each endpoint needs a `cal-api-version` header, pinned at the top of `booking.js`
(`2024-09-04` for slots, `2024-08-13` for bookings). Cal.com treats a missing or
unrecognised version as an older endpoint, so keep those values in place.

Times are requested with the visitor's IANA timezone, so availability is grouped and
labelled in their local days and hours.

## Changing the meeting lengths

The page reads its event types from a `data-cal-event-types` attribute, so this needs
no JavaScript changes:

```html
data-cal-event-types='[{"slug":"15min","minutes":15,"label":"Quick sync"}]'
```

- `slug` must match the Cal.com event type slug (the last part of `cal.com/jackhone/15min`)
- `minutes` must match its real length, since it is used to show the end time
- `label` is the descriptive name shown next to the length buttons

Current event types can be listed with:

```bash
curl -s "https://api.cal.com/v2/event-types?username=jackhone" \
  -H "cal-api-version: 2024-06-14"
```

Hidden event types work fine here, which is a good way to keep a length available by
link only.

## Rotating the link

To invalidate the old link, rename the directory and push:

```bash
git mv book/m9qtetikcnkt book/<new-random-slug>
```

Nothing else references the folder name, so no other file needs editing. Use something
unguessable — `python3 -c "import secrets,string;print(''.join(secrets.choice('abcdefghijkmnpqrstuvwxyz23456789') for _ in range(12)))"`.

## What "private" does and does not mean

The page is unlisted, not authenticated. Specifically:

- It carries `<meta name="robots" content="noindex, nofollow">` and is linked from
  nowhere, so search engines should not surface it.
- It is **not** listed in `robots.txt` on purpose. A `Disallow` line would publish the
  secret path to anyone who reads that file.
- **This repository is public**, so the folder name is visible to anyone browsing it on
  GitHub, and it stays in the git history even after a rename. Treat the link as
  obscure rather than secret.
- A static host cannot check a password, so there is no real access control. This is
  fine in practice: `cal.com/jackhone` is already public, so the only thing the URL
  protects is the fact that a bespoke booking page exists.

If it ever needs genuine gating, that means a small serverless function to hold a
shared secret, which would end the "static site, no backend" simplicity.

## Testing locally

```bash
python3 -m http.server 8788
```

Then open http://localhost:8788/book/m9qtetikcnkt/.

Requests hit the real Cal.com API, so **submitting the form creates a real booking**.
Cancel any test bookings from the "Reschedule or cancel" link on the confirmation
screen. Cal.com rejects undeliverable addresses, so `@example.com` will not work for a
test — use a real inbox.

## Analytics

The page loads PostHog like the homepage and captures `booking_slot_selected`,
`booking_confirmed`, and `booking_failed`. The calls are guarded, so the page still
works if PostHog is blocked.
