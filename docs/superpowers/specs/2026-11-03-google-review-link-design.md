# Google-Review-Link Design — 2026-11-03

## Goal

Stop storing and displaying reviews on the Shaffi's Bakery site. Reviews happen exclusively on Google:

- Customer taps "Share a review" on the site → **Google's own "Rate & review" box** for Shaffi's Bakery opens in a new tab.
- The home page **scrolling reviews marquee** is deleted.
- The admin **Reviews tab** (view + delete moderation) is deleted.

## Decisions made with the owner

1. **No site reviews at all** — nothing stored in Supabase, nothing shown on the home page.
2. **Free and simple** — no Google Maps Platform API key, no billing, no third-party widget. Only Google's official free deep link.
3. Owner approves deleting the reviews display and the admin moderation feature.

## The deep link

Google Place ID for Shaffi's Bakery, opposite Ooty, Coonoor Rd, Bombay Castel, Ooty, Tamil Nadu 643001 (feature id `0x3ba8bd40dcfc0145:0x72fe7c4435eb548b`, CID `8286196996812526731`):

```
ChIJRQH83EC9qDsRi1TrNUR8_nI
```

Review deep link (official Google format, free, no API call at runtime):

```
https://search.google.com/local/writereview?placeid=ChIJRQH83EC9qDsRi1TrNUR8_nI
```

It was derived by loading the place in a headless browser and extracting the ID from Maps network payloads near "Shaffi". If the link ever stops resolving (Google says place IDs can change, rarely), the fix is to re-run the same lookup and replace the URL constant — no code structure change.

Customers must be signed in to Google to post; Google itself handles that prompt inside its box. Nothing for us to handle or mirror.

## Changes

### Customer side (`public/index.html`, `public/js/customer.js`, `public/css/customer.css`)

- Delete the reviews marquee (`#reviews-marquee` / `#reviews-track` block inside the hero) and its CSS (`.marquee--reviews`, `.review-card*`, reviews band styles).
- Delete the review dialog (`#review-dialog` with form, stars radiogroup, honeypot) and the review `<template>`.
- Convert the single "Share a review" island button (`#open-review`; there is no `open-review2` element in the HTML — that JS loop entry is dead code and disappears) into an anchor link:

  ```html
  <a class="btn btn--primary btn--small" id="open-review"
     href="https://search.google.com/local/writereview?placeid=ChIJRQH83EC9qDsRi1TrNUR8_nI"
     target="_blank" rel="noopener" aria-label="Share a review on Google">Share a review</a>
  ```

- `customer.js`: remove all review code — `STATE.reviews`/`reviewSig`, review element lookups, `buildReview`, `renderReviews`, `loadReviews` + its call, `fillMarquee` (its only usage is the reviews marquee), the review-dialog section and its open/close/submit wiring (including the nonexistent-element `open-review2` loop entry).
- Delete now-unused JS/CSS only where nothing else references it. The base `.marquee` CSS stays — the toolbar ticker uses it.

### Admin side (`public/admin/index.html`, `public/js/admin.js`, `public/css/admin.css`)

- Delete the Reviews tab button, the `#panel-reviews` section, its refresh/list markup, the `#review-template`, and the CSS for `.reviews-list`/`.review-item`.
- `admin.js`: remove the reviews STATE field, `loadReviews`/`renderReviews`/`deleteReview`, the `tab === 'reviews'` branch, and the `#refresh-reviews` listener.

### Server

- Delete `server/routes/reviews.js`; unmount it from `server/routes/api.js`.
- Delete the `GET /api/admin/reviews` and `DELETE /api/admin/reviews/:id` endpoints from `server/routes/admin.js`.
- Delete `reviewInput` (and its export) from `server/validate.js`.

### Database (Supabase)

- New migration `supabase/migrations/0007_drop_reviews.sql`:

  ```sql
  drop table if exists public.reviews;
  ```

  Existing data (if any) is discarded on purpose — the owner no longer wants site reviews. RLS policies for the table drop with it.

### Tests

- Delete `tests/reviews.test.js`.
- `tests/ratelimit.test.js`: remove the review rate-limit test (keep login rate-limit tests; the limiter middleware itself stays for login).
- `tests/auth.test.js`: drop the `/api/admin/reviews/:id` entry from the admin-route protection matrix and `/api/reviews` from the public-paths loop.
- `tests/pages.test.js`: no review references today — no change expected.

## Error handling

- Not-signed-in reviewers: Google shows its own sign-in flow. No site logic.
- Dead place ID (Google changes it): the symptom is Google's box failing to find the place. Recovery = one-line URL replacement after re-running the ID lookup.
- No server endpoint remains for reviews; old clients that POST there simply get 404 from Express.

## Out of scope

- Displaying any reviews (Google or otherwise) on the site.
- Any Google API integration, key, or billing.
- Backing up existing `reviews` rows before dropping.

## Verification (done during implementation)

1. `npm test` — full suite green after edits.
2. Serve locally; both "Share a review" links open Google's review box for Shaffi's Bakery (check via headless-browser script or manually on the owner's phone).
3. `GET /api/reviews` → 404; `/api/admin/reviews` → 404; admin dashboard has no Reviews tab.
4. Home page renders normally with no marquee, no console errors.
