# Shaffi's Backery — digital menu & admin

A fast, mobile-first menu that guests open from a QR code, plus a private
dashboard where the owner manages everything. No ordering, payments or customer
accounts — just a beautiful, always-current menu.

- **Customer menu** (`/`) — sections, dishes, prices, photos, offers banner and
  visitor-submitted reviews that scroll in a marquee.
- **Admin dashboard** (`/admin`) — password protected. Manage dishes, sections,
  reviews and offers, with photos stored in Supabase Storage.

## Tech

- **Node.js + Express** — one small server that also serves the static pages.
- **Supabase** — Postgres for data, Storage for images. All database access uses
  the service-role key from the server only.
- **Vercel** — the same Express app is wrapped for serverless via
  `serverless-http` (`api/index.js`).

No frontend framework and no build step: plain HTML, CSS and JavaScript.

## Requirements

- Node.js 20 or newer
- A Supabase project (free tier is fine)

## Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Create the database schema**

   In the Supabase dashboard, open **SQL Editor** and run the two files in
   `supabase/migrations/`, in order:

   1. `0001_init.sql` — tables, row-level-security policies and the
      `menu-images` storage bucket.
   2. `0002_atomic_ops_and_stats.sql` — the helper functions the app uses for
      reordering sections and counting stats.

3. **Configure environment variables**

   Copy `.env.example` to `.env` and fill it in:

   | Variable | Notes |
   | --- | --- |
   | `PORT` | Local dev port (default `3000`). |
   | `ADMIN_PASSWORD` | Your dashboard password. Choose something strong. |
   | `SESSION_SECRET` | Long random string used to sign sessions, e.g. `openssl rand -hex 32`. |
   | `SUPABASE_URL` | Project URL, e.g. `https://xxxx.supabase.co`. |
   | `SUPABASE_SERVICE_ROLE_KEY` | Service-role key (**server-side secret**). |

   `.env` is git-ignored. Never commit it.

4. **Run locally**

   ```bash
   npm start
   ```

   - Menu: <http://localhost:3000>
   - Admin: <http://localhost:3000/admin> (sign in with `ADMIN_PASSWORD`)

   The database starts empty, so the menu first shows a friendly “being
   prepared” message. Add a section and your first dish from the admin
   dashboard and it appears within seconds.

## Using the dashboard

- **Overview** — counts of sections, dishes, available and popular items, plus
  the five most recently changed dishes.
- **Menu** — create, rename, reorder and delete sections; add, edit and delete
  dishes with photos, availability and “popular” flags.
  - A section that still contains dishes can’t be deleted by accident: you are
    asked where to move the dishes first.
- **Reviews** — see every guest review and remove any you don’t want to show.
- **Offers** — upload banner images for the scrolling strip on the menu, and
  switch them on or off.

## Tests

```bash
npm test
```

The suite runs against your configured Supabase project. It exercises auth and
rate limiting, dish/section/review/offer CRUD, image upload and validation, the
public menu, and static page serving (CSP and no inline scripts). Test rows are
cleaned up afterwards.

## Deploying to Vercel

1. Push this project to a Git repository.
2. Import it in Vercel.
3. Add the same environment variables from `.env` in
   **Project → Settings → Environment Variables**
   (`ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL`,
   `SUPABASE_SERVICE_ROLE_KEY`). You do not need `PORT`.
4. Deploy. `vercel.json` routes every request to the Express app in
   `api/index.js`.

### QR code

Generate a QR code that points at your deployed root URL (for example with any
free QR generator) and print it for tables or the counter. Guests land straight
on the menu.

## Notes

- **Currency** — prices show as plain numbers by default. To add a currency
  symbol, set `data-currency` on the `<body>` tag in `public/index.html`
  (for example `data-currency="ETB"`).
- **Keeping the menu fresh** — the customer page refreshes when the tab becomes
  visible and every 30 seconds while open, so admin changes appear quickly.
- **Security** — the admin session is an HttpOnly cookie, logins are rate
  limited, image uploads are validated by content (not filename), and the
  service-role key never reaches the browser.

## Project layout

```
api/            Vercel serverless entry point
public/         Customer menu and admin dashboard (HTML/CSS/JS)
server/         Express app, routes, auth, validation, storage helpers
supabase/       SQL migrations
tests/          Node test-runner suite
```
