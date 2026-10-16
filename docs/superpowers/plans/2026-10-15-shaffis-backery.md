# Shaffi's Backery — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a complete, mobile-first digital menu website with a secure admin dashboard for Shaffi's Backery, backed by Supabase Postgres + Storage, deployable to Vercel.

**Architecture:** One Express app (`server/app.js`) shared by local dev (long-lived, serves `public/` + API) and Vercel (`api/index.js` wraps it with `serverless-http`; `vercel.json` rewrites only `/api/*`). All state (menu, sessions, rate limits) in Supabase Postgres via `pg` pooled connection; images in a public-read Supabase Storage bucket written only by the server. Frontend is vanilla HTML/CSS/JS: customer single page + admin hash-routed SPA.

**Tech Stack:** Node 24, Express, pg, multer, cookie-parser, serverless-http; Supabase Postgres/Storage; Google Fonts (Cormorant Garamond, DM Sans); `node --test` for API tests; Playwright (webapp-testing skill) for UI verification.

## Global Constraints

- Brand name spelled exactly: `Shaffi's Backery` (everywhere, including UI copy).
- Colors: `#FFFEFA` warm white, `#174C38` deep forest green, `#E8F0E9` muted sage, `#C6A15B` champagne gold, `#292D29` dark charcoal, `#777B75` soft gray. Gold never as text on white backgrounds.
- Fonts: Cormorant Garamond (headings/brand/review quotes), DM Sans (all functional text). Body text ≥16px on mobile.
- Prices display as `₹120` (no trailing `.00`; show paise only when present, e.g. `₹120.50`).
- Env vars (server-side only): `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Never expose any of them to the client. `.env` gitignored; `.env.example` placeholders only; never print secret values in README or logs.
- No cart/order/checkout/payment/delivery features. No invented address/hours/phone/social links.
- Mobile-first: usable 320–430px, no horizontal overflow, ≥44px touch targets. Both sites.
- Every admin mutation requires a valid session (401 otherwise); all queries parameterized; no stack traces in responses.
- Public menu shows only non-empty sections. Unavailable dishes stay visible, dimmed, labeled "Currently unavailable".
- Database starts completely empty (no seed content).
- No git commits (user has not requested git usage); `.gitignore` still required as deliverable.
- Dependencies: only `express`, `pg`, `multer`, `cookie-parser`, `serverless-http` (+ dev none). No frontend frameworks/libraries.

---

### Task 1: Project scaffold

**Files:**
- Create: `package.json`, `.gitignore`, `.env.example`, `server/dev.js`, `server/app.js`, `server/config.js`

**Interfaces:**
- Produces: `config` export `{ SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_PASSWORD, SESSION_SECRET, PORT, IS_PRODUCTION }`; `createApp()` returning an Express app; npm scripts `start`, `test`.

- [ ] **Step 1: Write `.gitignore`**

```
node_modules/
.env
.env.local
*.db
*.sqlite
uploads/
.DS_Store
.vercel
```

- [ ] **Step 2: Write `.env.example`** (placeholders only)

```
# Server
PORT=3000

# Admin auth — set your own strong password; NEVER commit the real .env
ADMIN_PASSWORD=change-me-to-a-strong-password
# Random 64+ char string used to sign session tokens (e.g. openssl rand -hex 32)
SESSION_SECRET=change-me-to-a-random-session-secret

# Supabase project (server-side only — never exposed to the browser)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

- [ ] **Step 3: `npm init -y` then install deps**

Run: `npm install express pg multer cookie-parser serverless-http`
Then set `"scripts": { "start": "node --env-file=.env server/dev.js", "test": "node --env-file=.env --test tests/" }` and `"type": "commonjs"` in `package.json`.

- [ ] **Step 4: Write `server/config.js`**

```js
'use strict';
const required = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}
module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL.replace(/\/$/, ''),
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  IS_PRODUCTION: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
  SESSION_COOKIE: 'sb_admin',
  SESSION_DAYS: 7,
  BUCKET: 'menu-images',
};
```

- [ ] **Step 5: Write `server/app.js` (skeleton) and `server/dev.js`**

`server/app.js`: `createApp()` — sets `trust proxy`, JSON body limit `1mb`, security headers middleware (`X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, a CSP allowing self + Google Fonts + data: images), `GET /api/health` → `{ok:true}`, serves `express.static(path.join(__dirname, '..', 'public'))`. Routes mounted in later tasks.

`server/dev.js`: `const { createApp } = require('./app'); const { PORT } = require('./config'); createApp().listen(PORT, () => console.log(`Shaffi's Backery listening on http://localhost:${PORT}`));` — never log secret values.

- [ ] **Step 6: Syntax-check and smoke test**

Run: `node --check server/app.js && node --check server/config.js && node --check server/dev.js`
Then start (`npm start`) and `curl -s http://localhost:3000/api/health` → expect `{"ok":true}`. Kill server.

---

### Task 2: Supabase schema, RLS, storage bucket

**Files:**
- Create: `supabase/migrations/0001_init.sql` (record of applied migration)

**Interfaces:**
- Produces: tables `sections, dishes, reviews, ads, sessions, rate_events`; storage bucket `menu-images` (public read); anon SELECT policies on menu tables.

- [ ] **Step 1: Apply migration via `supabase_apply_migration`** (name: `init_menu_schema`), SQL:

```sql
create extension if not exists pgcrypto;

create table public.sections (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.dishes (
  id uuid primary key default gen_random_uuid(),
  section_id uuid not null references public.sections(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 1 and 80),
  description text check (description is null or char_length(description) <= 600),
  price numeric(10,2) not null check (price >= 0),
  image_path text,
  is_popular boolean not null default false,
  is_available boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index dishes_section_idx on public.dishes(section_id);
create index dishes_updated_idx on public.dishes(updated_at desc);

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  author_name text not null check (char_length(trim(author_name)) between 2 and 40),
  content text not null check (char_length(trim(content)) between 5 and 500),
  rating integer not null check (rating between 1 and 5),
  created_at timestamptz not null default now()
);

create table public.ads (
  id uuid primary key default gen_random_uuid(),
  image_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  last_seen_at timestamptz not null default now()
);

create table public.rate_events (
  id bigserial primary key,
  action text not null,
  ip text not null,
  created_at timestamptz not null default now()
);
create index rate_events_idx on public.rate_events(action, ip, created_at);

alter table public.sections enable row level security;
alter table public.dishes enable row level security;
alter table public.reviews enable row level security;
alter table public.ads enable row level security;
alter table public.sessions enable row level security;
alter table public.rate_events enable row level security;

create policy "public read sections" on public.sections for select using (true);
create policy "public read dishes" on public.dishes for select using (true);
create policy "public read reviews" on public.reviews for select using (true);
create policy "public read ads" on public.ads for select using (true);

insert into storage.buckets (id, name, public)
values ('menu-images', 'menu-images', true)
on conflict (id) do nothing;
```

- [ ] **Step 2: Verify** with `supabase_execute_sql`: `select table_name from information_schema.tables where table_schema='public' order by 1;` → all 6 tables. `select id, public from storage.buckets where id='menu-images';` → one row, public=true.

- [ ] **Step 3: Save the same SQL** to `supabase/migrations/0001_init.sql` for the repo record.

---

### Task 3: Database pool + app wiring

**Files:**
- Create: `server/db.js`
- Modify: `server/app.js`

**Interfaces:**
- Produces: `db.query(text, params)` (Promise), `db.pool` (pg.Pool, max 5, idleTimeoutMillis 30000, connectionTimeoutMillis 10000, `connectionString` from `SUPABASE_URL`'s host — build pooler URL: `postgresql://postgres:${SUPABASE_SERVICE_ROLE_KEY}@db.${host}.supabase.co:6543/postgres` derived from `SUPABASE_URL`, with `ssl: { rejectUnauthorized: false }`).

- [ ] **Step 1: Implement `server/db.js`** with `new pg.Pool({...})` per above; export `{ pool, query }` where `query = (t, p) => pool.query(t, p)`. Derivation: `const u = new URL(config.SUPABASE_URL); const host = u.hostname.replace('.supabase.co',''); const connectionString = `postgresql://postgres:${key}@db.${host}.supabase.co:6543/postgres`;` Document in README that local dev may use port 5432 direct URL if pooler unavailable.
- [ ] **Step 2: Wire a `GET /api/health/db` route** in `app.js` running `select 1` → `{ok:true}`; 503 on failure.
- [ ] **Step 3: Run server, verify** `curl -s localhost:3000/api/health/db` → `{"ok":true}`.

---

### Task 4: Authentication (password, sessions, rate limit, guard)

**Files:**
- Create: `server/auth.js`, `server/ratelimit.js`, `server/middleware/requireAdmin.js`, `server/routes/auth.js`
- Modify: `server/app.js` (mount `/api/auth`)
- Test: `tests/auth.test.js`

**Interfaces:**
- Consumes: `config`, `db.query`
- Produces: `auth.verifyPassword(pw) → bool` (timingSafeEqual over sha256 digests); `auth.createSession(res) → void` (token cookie); `auth.getSession(req) → {id} | null`; `auth.destroySession(req,res)`; `rateLimit({action, limit, windowMs}) → middleware` (adds `req.clientIp`); `requireAdmin(req,res,next)` (401 `{error:'Authentication required'}` unless valid session); routes `POST /api/auth/login|logout`, `GET /api/auth/session`.

- [ ] **Step 1: Write failing tests** `tests/auth.test.js` (uses `createApp()` on ephemeral port, real DB):

```js
'use strict';
const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { createApp } = require('../server/app');
const config = require('../server/config');

let server, base, jar = '';
before(async () => {
  server = createApp().listen(0);
  await new Promise(r => server.once('listening', r));
  base = `http://localhost:${server.address().port}`;
});
after(() => server.close());

async function post(path, body, headers = {}) {
  return fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) });
}

test('login rejected with wrong password', async () => {
  const res = await post('/api/auth/login', { password: 'definitely-wrong' });
  assert.equal(res.status, 401);
  const body = await res.json();
  assert.match(body.error, /incorrect password/i);
  assert.ok(!JSON.stringify(body).includes(config.ADMIN_PASSWORD));
});

test('login accepted with correct password; sets HttpOnly cookie', async () => {
  const res = await post('/api/auth/login', { password: config.ADMIN_PASSWORD });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie') || '';
  assert.match(setCookie, /sb_admin=/);
  assert.match(setCookie, /HttpOnly/i);
  jar = setCookie.split(';')[0];
});

test('session endpoint reflects login state', async () => {
  const anon = await fetch(base + '/api/auth/session');
  assert.deepEqual(await anon.json(), { authenticated: false, username: "Shaffi's Backery" });
  const auth = await fetch(base + '/api/auth/session', { headers: { cookie: jar } });
  assert.deepEqual(await auth.json(), { authenticated: true, username: "Shaffi's Backery" });
});

test('admin mutation without session → 401', async () => {
  const res = await post('/api/admin/sections', { name: 'Hacked' });
  assert.equal(res.status, 401);
});

test('logout destroys session', async () => {
  const res = await post('/api/auth/logout', {}, { cookie: jar });
  assert.equal(res.status, 200);
  const auth = await fetch(base + '/api/auth/session', { headers: { cookie: jar } });
  assert.equal((await auth.json()).authenticated, false);
});
```

- [ ] **Step 2: Run tests to confirm FAIL** — Run: `npm test` → expect module-not-found for `server/routes/auth.js` etc.
- [ ] **Step 3: Implement `server/auth.js`**

```js
'use strict';
const crypto = require('crypto');
const config = require('./config');
const db = require('./db');

const hash = (v) => crypto.createHmac('sha256', config.SESSION_SECRET).update(v).digest('hex');
const safeEqual = (a, b) => {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
};

exports.verifyPassword = (pw) => safeEqual(pw, config.ADMIN_PASSWORD);

exports.createSession = async (res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.SESSION_DAYS * 864e5);
  await db.query('insert into sessions (token_hash, expires_at) values ($1, $2)', [hash(token), expires.toISOString()]);
  res.cookie(config.SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    expires,
  });
};

exports.getSession = async (req) => {
  const token = req.cookies?.[config.SESSION_COOKIE];
  if (!token) return null;
  const { rows } = await db.query(
    'select id, expires_at from sessions where token_hash = $1 and expires_at > now()',
    [hash(token)]
  );
  if (!rows[0]) return null;
  db.query('update sessions set last_seen_at = now() where id = $1', [rows[0].id]).catch(() => {});
  return rows[0];
};

exports.destroySession = async (req, res) => {
  const token = req.cookies?.[config.SESSION_COOKIE];
  if (token) await db.query('delete from sessions where token_hash = $1', [hash(token)]);
  res.clearCookie(config.SESSION_COOKIE, { path: '/' });
};
```

- [ ] **Step 4: Implement `server/ratelimit.js`** — `rateLimit({action, limit, windowMs})` middleware: compute `clientIp` from `x-forwarded-for` first value || `req.socket.remoteAddress`; `select count(*) from rate_events where action=$1 and ip=$2 and created_at > now() - ($3 || ' milliseconds')::interval`; if ≥ limit → 429 `{error:'Too many attempts. Please try again later.'}`; else insert event (fire-and-forget) and set `req.clientIp = ip`, `next()`. Also export `resetRateLimit(action, ip)` (delete rows) for successful logins.
- [ ] **Step 5: Implement `server/middleware/requireAdmin.js`** — calls `auth.getSession(req)`; sets `req.session`; 401 `{error:'Authentication required'}` if none; also enforce same-origin on mutations: if `req.method !== 'GET'` and `Origin` present and `new URL(origin).host !== req.headers.host` → 403 `{error:'Invalid request origin'}`.
- [ ] **Step 6: Implement `server/routes/auth.js`**

```js
const router = require('express').Router();
const auth = require('../auth');
const { rateLimit, resetRateLimit } = require('../ratelimit');
const config = require('../config');

router.post('/login',
  rateLimit({ action: 'login', limit: 5, windowMs: 15 * 60 * 1000 }),
  async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !auth.verifyPassword(password)) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }
    resetRateLimit('login', req.clientIp);
    await auth.createSession(res);
    res.json({ success: true, username: "Shaffi's Backery" });
  });

router.post('/logout', async (req, res) => {
  await auth.destroySession(req, res);
  res.json({ success: true });
});

router.get('/session', async (req, res) => {
  const session = await auth.getSession(req);
  res.json({ authenticated: Boolean(session), username: "Shaffi's Backery" });
});
module.exports = router;
```

- [ ] **Step 7: Mount in `app.js`: `app.use('/api/auth', require('./routes/auth'))` + `cookie-parser()` middleware before routes.**
- [ ] **Step 8: Run tests** — `npm test` → all auth tests PASS. (Rate-limit test: separate test hitting login 6× with wrong password expecting 429 on 6th; run last inside its own test file to avoid poisoning other tests' IP window — use `tests/ratelimit.test.js` expecting 429 after 5 failures.)

---

### Task 5: Public menu, reviews, ads endpoints

**Files:**
- Create: `server/routes/menu.js`, `server/routes/reviews.js`
- Modify: `server/app.js`
- Test: `tests/menu.test.js`

**Interfaces:**
- Produces: `GET /api/menu` → `{"sections":[{"id","name","display_order","dishes":[{"id","name","description","price","image_url","is_popular","is_available","section_id"}]}],"generated_at"}` — only sections with ≥1 dish; dishes `order by created_at asc`; `price` serialized as number; `image_url` = full public Storage URL or `null`; ETag enabled (Express default for `res.json` → 304 honored). `GET /api/reviews` → `[{id, author_name, content, rating, created_at}]` newest first. `GET /api/ads` → `[{id, image_url, created_at}]` active only.

- [ ] **Step 1: Write failing tests** (`tests/menu.test.js`): insert a section + dish directly via `db`, plus an empty section; `GET /api/menu` → exactly 1 section, dish fields present, empty section absent, price numeric; `GET /api/reviews` → `[]` initially; second request with `If-None-Match` header from first response → 304; cleanup deletes rows in `after`. Also test `GET /api/ads` → `[]`.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `server/routes/menu.js`**: 

```js
router.get('/', async (req, res) => {
  const [s, d] = await Promise.all([
    db.query('select id, name, display_order from sections order by display_order asc, created_at asc'),
    db.query(`select d.id, d.section_id, d.name, d.description, d.price, d.image_path,
                     d.is_popular, d.is_available
              from dishes d order by d.created_at asc`),
  ]);
  const dishesBySection = new Map();
  for (const dish of d.rows) {
    const row = { ...dish, price: Number(dish.price), image_url: dish.image_path ? images.publicUrl(dish.image_path) : null };
    delete row.image_path;
    if (!dishesBySection.has(dish.section_id)) dishesBySection.set(dish.section_id, []);
    dishesBySection.get(dish.section_id).push(row);
  }
  const sections = s.rows
    .map(sec => ({ ...sec, dishes: dishesBySection.get(sec.id) || [] }))
    .filter(sec => sec.dishes.length > 0);
  res.json({ sections, generated_at: new Date().toISOString() });
});
```

Wrap handlers in an async error wrapper → next(err); central error middleware returns `{error:'Something went wrong. Please try again.'}` 500 without stack.
- [ ] **Step 4: Create `server/images.js` with `publicUrl(path)` only** (`${config.SUPABASE_URL}/storage/v1/object/public/${config.BUCKET}/${path}`) — Task 7 extends this file with upload/remove/sniff; mount it in menu/ads routes for `image_path → image_url` mapping.
- [ ] **Step 4b: Implement `server/routes/reviews.js`** — `GET /`: `select id, author_name, content, rating, created_at from reviews order by created_at desc limit 100`.
- [ ] **Step 5: Ads public GET** in a small `server/routes/ads.js` public part or shared router: `select id, image_path, created_at from ads where is_active order by created_at desc` → map to `image_url`.
- [ ] **Step 6: Mount all three; run tests → PASS.**

---

### Task 6: Dishes CRUD + quick toggles

**Files:**
- Create: `server/routes/dishes.js`, `server/validate.js`
- Modify: `server/app.js` (mount `/api/admin/dishes` behind `requireAdmin`)
- Test: `tests/dishes.test.js`

**Interfaces:**
- Consumes: `requireAdmin`, `images` (Task 7 — accept optional multipart; JSON works without image)
- Produces: `validate.dishInput(body) → {ok, value|errors}` (name trimmed 1–80, description ≤600 or null, price: number ≥0, ≤2 decimals, finite; `section_id` uuid present); `validate.toggleInput(body)` allowing only `is_available`/`is_popular` booleans.

- [ ] **Step 1: Write failing tests** (`tests/dishes.test.js`): login → jar; create section; POST dish (JSON) 201 → fields; POST invalid (no name / negative price / missing section / non-existent section id) → 400 with field errors; PATCH `{"is_available":false}` → persists on refetch; PATCH `{"is_popular":true}` → persists; PATCH unknown field → 400; PUT edit name/price → 200; GET list with `?q=` filter → matches; DELETE → 200 and gone; unauthenticated POST → 401 (already covered but include one). Cleanup rows.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `server/validate.js`** with functions: `str(v, {min,max})`, `dishInput`, `toggleInput`, `sectionInput` (name 1–80), `reviewInput` (author_name 2–40, content 5–500, rating int 1–5, honeypot `website` must be empty), `reorderInput`. All trim whitespace; return `{ok:false, errors:{field:message}}`.
- [ ] **Step 4: Implement `server/routes/dishes.js`** — handlers:
  - `GET /` list: optional filters `q` (ILIKE on name), `section_id`, `availability=true|false`, `popular=true|false`; `order by updated_at desc`; returns `price: Number(...)`, `image_url`.
  - `POST /` create: validate → insert → 201 `{dish}`.
  - `PUT /:id` update (multipart-aware — image handling finalized in Task 7 via shared helper `images.fromRequest(req)`; for this task support JSON only and leave a hook).
  - `PATCH /:id` partial: validate toggles → `update ... set <field> = $1, updated_at = now() where id=$2` → return updated row. Reject unknown keys.
  - `DELETE /:id`: fetch row → delete (FK restrict irrelevant) → delete storage object if `image_path` (calls `images.remove`) → 200.
- [ ] **Step 5: Run → PASS.**

---

### Task 7: Image pipeline (sniffing, storage, dish image upload/replace/remove)

**Files:**
- Create: `server/images.js`
- Modify: `server/routes/dishes.js` (multipart support), `server/app.js` (multer error handling)
- Test: `tests/images.test.js`

**Interfaces:**
- Produces: `images.sniff(buf) → 'jpeg'|'png'|'webp'|'avif'|null` (magic bytes: JPEG `FF D8 FF`; PNG `89 50 4E 47 0D 0A 1A 0A`; WebP `RIFF....WEBP`; AVIF bytes 4–8 `ftyp` and 8–12 `avif|avis`); `images.upload(buffer, folder, ext) → path` (POST `${SUPABASE_URL}/storage/v1/object/menu-images/${path}` with `Authorization: Bearer ${serviceKey}`, `x-upsert: false`); `images.remove(path)` (DELETE `.../object/menu-images/${path}`); `images.publicUrl(path)` → `${SUPABASE_URL}/storage/v1/object/public/menu-images/${path}`; `images.fromRequest(req) → {buffer?, remove?: bool}` using multer memoryStorage, limit 3MB, single field `image`.

- [ ] **Step 1: Write failing tests** (`tests/images.test.js`): unit-test `sniff` against real tiny buffers (construct minimal PNG header bytes, JPEG SOI bytes, RIFF/WEBP, ftyp/avif; random bytes → null; GIF → null). Integration: create dish with multipart image (build `FormData` with a 1×1 PNG buffer) → `image_url` returned and publicly fetchable (GET image_url → 200, content-type image/png); PUT replace with JPEG buffer → new `image_url` differs and old object deleted (GET old → 404/400); PUT with `remove_image=1` → `image_url` null; PUT with `.txt` file → 400 unsupported type; >3MB buffer → 400 too large.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement `server/images.js`** per interface; build object keys `dishes/${crypto.randomUUID()}_${Date.now()}.${ext}` / `ads/...`.
- [ ] **Step 4: Wire multer in dishes routes**: if `req.is('multipart/form-data')` parse via `images.uploadMiddleware` then merge text fields (strings) into `req.body`; validate; on successful dish save with new image → upload, then remove old path. On `remove_image === '1'` → remove path, set null. Map multer `LIMIT_FILE_SIZE` → 400 `{error:'Image must be smaller than 3 MB.'}`.
- [ ] **Step 5: Run → PASS.**

---

### Task 8: Sections CRUD, reorder, safe delete

**Files:**
- Create: `server/routes/sections.js`
- Modify: `server/app.js`
- Test: `tests/sections.test.js`

**Interfaces:**
- Produces: `GET /api/admin/sections` → `[{id,name,display_order,dish_count,created_at,updated_at}]` ordered; `POST /` create (display_order = max+1); `PUT /:id` rename; `POST /:id/move {direction:'up'|'down'}` → swaps `display_order` with neighbor (single transaction); `POST /reassign {from_section_id, to_section_id}` → `update dishes set section_id=$2, updated_at=now() where section_id=$1` (to_section must exist, ≠ from); `DELETE /:id` → if dish_count > 0 → 409 `{error:'Section contains N dishes...', code:'SECTION_NOT_EMPTY', dish_count:N}`; else delete → 200.

- [ ] **Step 1: Write failing tests**: create 3 sections → order stable; rename; move up/down swaps order; delete empty → 200; delete with dishes → 409 with `dish_count`; reassign moves all dishes then section deletes; delete non-existent → 404; unauth → 401. Cleanup.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** with parameterized SQL; reorder inside `db.pool.connect()` transaction (`BEGIN/COMMIT/ROLLBACK`).
- [ ] **Step 4: Run → PASS.**

---

### Task 9: Public review submission + admin review/ads management + stats

**Files:**
- Create: `server/routes/admin.js` (stats, reviews admin, ads admin)
- Modify: `server/routes/reviews.js` (add POST), `server/app.js`
- Test: `tests/reviews.test.js`, `tests/stats.test.js`

**Interfaces:**
- Produces:
  - `POST /api/reviews` public: JSON only (`Content-Type: application/json` enforced → 415 otherwise), Origin same-host check, honeypot field `website` (if non-empty → 200 fake success without insert), `rateLimit({action:'review', limit:3, windowMs:3600e3})`, `reviewInput` validation → insert → 201 `{review}`. Sanitization: strip `<`/`>`? No — store raw text, render with `textContent` client-side (XSS-safe by construction); trim only.
  - `GET /api/admin/reviews` (behind requireAdmin) → all newest first (same shape as public).
  - `DELETE /api/admin/reviews/:id` → 200 / 404.
  - `GET /api/admin/ads` → all (incl. inactive) with `image_url`; `POST /api/admin/ads` multipart (`image` required, sniffed, ≤3MB) → 201; `PATCH /api/admin/ads/:id {is_active}`; `DELETE /api/admin/ads/:id` (+ storage cleanup).
  - `GET /api/admin/stats` → `{sections: n, dishes: n, available: n, popular: n, recent: [{id,name,price,is_available,is_popular,updated_at,section_name}]}` — single SQL using subselects; recent = top 5 by `updated_at desc`.

- [ ] **Step 1: Write failing tests** covering: review submit valid → 201 + appears in public GET; short content → 400; rating 0/6 → 400; honeypot filled → 201 but NOT in list; 4th submission within hour → 429; form-encoded content-type → 415; cross-origin Origin header → 403; admin GET reviews → sees it; admin DELETE → gone from public; ads create/patch/delete with image; stats reflect inserted fixture counts (insert known fixtures, assert exact numbers). Careful ordering: rate-limit test last in file or use separate action key.
- [ ] **Step 2: Run → FAIL.**
- [ ] **Step 3: Implement** routes per interface; mount `/api/admin/*` router behind `requireAdmin`; public `POST /api/reviews` in reviews router with JSON-only + origin + honeypot + rate limit.
- [ ] **Step 4: Run → PASS.**

---

### Task 10: Full API regression + node --check sweep

- [ ] **Step 1:** `npm test` — all test files green.
- [ ] **Step 2:** `node --check` every file in `server/` and `api/`.
- [ ] **Step 3:** Manual curl matrix (document results): health, menu `[]`, review POST, login wrong/right, unauth section create 401, auth section create 200, logout.
- [ ] **Step 4:** Confirm no `console.log` prints secrets (grep `console` in server/).

---

### Task 11: Customer website (`public/index.html`, `css/tokens.css`, `css/customer.css`, `js/customer.js`, `images/`)

**Files:**
- Create: all of the above.

**Interfaces:**
- Consumes: `GET /api/menu`, `GET /api/ads`, `GET /api/reviews`, `POST /api/reviews`.

**Structure (page order):**

```html
<a class="skip-link" href="#menu">Skip to menu</a>
<header class="hero">brand, tagline, welcome, gold rule, wheat SVG</header>
<nav class="chips" aria-label="Menu categories"><!-- buttons --></nav>
<main id="menu"><!-- sections injected --></main>
<section class="ads-band" aria-label="Offers and announcements"><!-- marquee --></section>
<section class="reviews-band" aria-label="Customer reviews">
  <button id="open-review">Share a review</button>
  <div class="marquee" id="reviews-marquee"></div>
</section>
<dialog id="review-dialog">name, stars, textarea, submit, cancel</dialog>
<div id="toast" aria-live="polite"></div>
<footer>Shaffi's Backery — Baked fresh with love.</footer>
```

- [ ] **Step 1: `css/tokens.css`** — `:root` with the six colors, `--radius: 14px`, `--shadow: 0 6px 24px rgba(23,76,56,.08)`, font stacks, spacing scale; `@media (prefers-reduced-motion)` respected globally.
- [ ] **Step 2: `index.html`** — semantic markup per structure; `<title>Shaffi's Backery — Menu</title>`, meta description, `theme-color #174C38`, preconnect + Google Fonts link (Cormorant Garamond 500/600/700 + italic; DM Sans 400/500/700), `<html lang="en">`, viewport meta.
- [ ] **Step 3: `css/customer.css`** — mobile-first:
  - Hero: ≤55vh mobile, sage radial ornament (pure CSS), centered brand (clamp 2.2rem–4rem), tagline in gold small-caps (on green? tagline gold text must sit on green or charcoal-on-white — use gold *rule + letterspaced charcoal* text to keep contrast).
  - Chips: `position: sticky; top: 0; z-index: 20; background: rgba(255,254,250,.96); overflow-x: auto; scrollbar-width: none; white-space: nowrap; display:flex; gap:8px; padding:10px 16px;` chip: `min-height:44px; padding:0 18px; border-radius:999px; border:1px solid var(--sage); background: var(--sage); color: var(--green); font-weight:500;` active: `background: var(--green); color: var(--white); border-color: var(--green);` `scroll-behavior: smooth` toggled only during programmatic scroll.
  - Sections: `h2` Cormorant 1.9rem green with gold hairline (`::after` 40px × 2px gold).
  - Cards: grid `1fr` → `repeat(2,1fr)` ≥640 → `repeat(3,1fr)` ≥1024; card white bg, 1px `#E8F0E9` border, radius 14, shadow subtle; image `aspect-ratio: 4/3; object-fit: cover;` skeleton shimmer via `.loading::after`; `.unavailable` → image `filter: grayscale(.5) brightness(.96)`, card `opacity:.68`, chip sage "Currently unavailable"; Popular badge: absolute top-left, `background: #FFFEFA; border:1px solid gold; color:#174C38; font-size:.7rem;` (gold border only, dark text — contrast-safe).
  - Price: `color: var(--green); font-weight: 700;` `₹` included.
  - Marquee (shared for ads/reviews): `.marquee { overflow: hidden; }` `.marquee-track { display:flex; width:max-content; animation: marquee-scroll 50s linear infinite; }` `.marquee-group { display:flex; gap:14px; padding-right:14px; }` `@keyframes marquee-scroll { to { transform: translateX(-50%); } }` pause on `:hover`/`:focus-within`/`.paused` (touchstart); `@media (prefers-reduced-motion: reduce){ .marquee{overflow-x:auto} .marquee-track{animation:none} }`. Ads card ~82vw ≤640, 340px above; image-only, radius 14. Review card: sage-tinted white, gold quote SVG, 5 gold stars (SVG), text Cormorant italic 1.05rem, author DM Sans 600 small-caps.
  - Review dialog: native `<dialog>`, bottom-sheet on mobile (`margin:auto auto 0; width:100%; max-width:none; border-radius:18px 18px 0 0;` ≥640 → centered card `max-width:440px; border-radius:18px`). Stars: 5 buttons `role="radio"` within `role="radiogroup"`, 44px targets, filled state gold. Textarea min 3 rows, `maxlength=500`.
  - Toast: fixed bottom-center pill, green success / red error, `aria-live`.
  - Footer: gold hairline top, centered, muted.
  - `body { overflow-x: hidden }` safety; focus-visible outlines `2px solid var(--green)` offset 2.
- [ ] **Step 4: `js/customer.js`** — vanilla, no deps:
  - `state = { menu, reviews, ads }`; `api(path, opts)` fetch wrapper with timeout (8s) + JSON handling + network-error throw.
  - `loadMenu()` → render chips + sections; skeletons first; error → retry panel (button calls `loadMenu()`).
  - Render dish card: `document.createElement` everywhere, `img.loading='lazy'` (first 2 cards `eager` + `fetchpriority="high"`), `alt="Photo of ${name}"` (missing image → `.no-image` div with inline SVG), price via `formatINR(n)` = `₹` + `Number.isInteger(n) ? n : n.toFixed(2)`.
  - Chips: build from non-empty sections; click → `section.scrollIntoView({behavior:'smooth', block:'start'})` + `scroll-margin-top` on sections (~70px) accounting for sticky chips; IntersectionObserver (`rootMargin: '-40% 0px -55% 0px'`) sets `.active` chip.
  - `loadAds()` / `loadReviews()`: hide bands when empty; marquee builds two identical `.marquee-group` children (aria-hidden on the duplicate).
  - Poll: `setInterval(30_000)` → only when `document.visibilityState==='visible'` → `Promise.all([loadMenu(silent), loadReviews(silent), loadAds(silent)])`; also refetch on `visibilitychange`→visible. Preserve scroll position and active chip on silent refresh (only re-render if payload JSON changed — compare `JSON.stringify`).
  - Review form: open dialog (`showModal()`), star buttons set `state.rating` (click + keyboard arrows), validation (name 2–40, content ≥5, rating required) with inline errors, submit disabled while pending, on success close + toast "Thank you! Your review is now showing." + `loadReviews()` (prepends naturally via newest-first), on 429 show server message, on network error keep form data + show retry.
  - XSS safety: all user text via `textContent` — never `innerHTML` with API data (static template strings for markup only).
- [ ] **Step 5: `images/wheat.svg`, `images/croissant-fallback.svg`** — simple gold-line inline SVGs.
- [ ] **Step 6: Run server; verify in browser at 375×812** via webapp-testing skill: empty state shows; add a dish via API (login curl + create) → appears; mark unavailable → chip shows; long name wraps; no horizontal scrollbar (`document.documentElement.scrollWidth <= innerWidth`); review submit flow works end-to-end.

---

### Task 12: Admin — login, shell, dashboard

**Files:**
- Create: `public/admin/index.html`, `public/css/admin.css`, `public/js/admin.js`

**Interfaces:**
- Consumes: `/api/auth/*`, `/api/admin/stats`.

- [ ] **Step 1: `admin/index.html`** — same fonts/tokens; containers: `#login-view` (wordmark, `h1` "Welcome back", form: password input + show/hide button (aria-pressed), submit "Sign in" with spinner, `#login-error` role=alert), `#app-view` (hidden initially): top bar (brand, "View customer menu" link target=_blank, logout), drawer nav (`<nav>` with links: Dashboard, Menu Items, Sections, Reviews, Ads — hash links; drawer toggle button on mobile with hamburger SVG, backdrop), `<main id="view-root">` where hash views render, `#toast`, shared `<dialog id="confirm-dialog">` (title, message, cancel + confirm buttons — one reusable confirm), reusable toast.
- [ ] **Step 2: `css/admin.css`** — tokens reused; login: centered card ≤400px, green primary button 48px; shell: top bar 56px white with gold hairline bottom; drawer: fixed slide-in 280px (transform −100% → 0, backdrop fade); desktop ≥900: inline horizontal nav (drawer button hidden); stat tiles: 2×2 grid mobile, 4-up desktop, sage bg, green numeral Cormorant; table styles desktop only (`.dishes-table` hidden ≤899), mobile `.dish-row` cards; switches: custom checkbox slider 44×26 with visible "Available"/"Popular" labels; forms: labels above inputs (16px font, 48px inputs), field errors red 13px, `.btn-primary` green, `.btn-outline` green border, `.btn-danger` red text button; loading spinner: CSS border spinner inside buttons, `.btn[disabled]{opacity:.65}`.
- [ ] **Step 3: `js/admin.js` — auth + router + dashboard** (single file, organized in sections; grows across Tasks 13–14):
  - `api(path, {method, body, formData})` — always `credentials:'same-origin'`; on 401 → force `showLogin()`; on non-JSON responses handle gracefully.
  - Boot: `GET /api/auth/session` → authenticated ? `showApp()` : `showLogin()`. Login submit → POST; error text into `#login-error`; button loading state; never store password anywhere.
  - Hash router: `#/dashboard` (default), `#/menu`, `#/sections`, `#/reviews`, `#/ads`; `hashchange` re-renders view into `#view-root`; logout button → POST logout → `showLogin()`.
  - Dashboard render: `GET /api/admin/stats` → greeting "Welcome back" + 4 tiles (Menu sections / Dishes / Available now / Popular) + buttons `Add dish` (→ `#/menu/new`) and `Manage sections` (→ `#/sections`) + "Recently updated" list with per-row quick switches calling the same `toggleDish()` helper as Task 13.
  - Helpers: `el(tag, attrs, children)` DOM builder; `toast(msg, type)`; `confirmDialog({title, message, confirmLabel, danger}) → Promise<boolean>` using the shared `<dialog>`; `spinner(btn)` on/off; `formatINR`.
- [ ] **Step 4: Verify with Playwright (mobile 390×844):** wrong password → red error; correct password (from env) → dashboard with 0-stats (empty DB); drawer opens/closes; logout → login view; refresh on `#/sections` restores session view (hash routing + session cookie); unauth direct API call 401 from console.

---

### Task 13: Admin — menu management + dish form

**Modify:** `public/js/admin.js`, `public/admin/index.html` (form template markup), `public/css/admin.css` (form styles)

- [ ] **Step 1: `#/menu` view** — toolbar: search input (debounced 250ms → re-fetch with `?q=`), three selects (section/availability/popular), "Add dish" button (→ `#/menu/new`). Data: `GET /api/admin/dishes?...`. Render desktop `<table>` (thumb 56px, Name, Section, Price, Available switch, Popular switch, Edit, Delete) and mobile cards — one render function, CSS switches which layout shows (duplicate DOM with `hidden` classes or single responsive card layout — choose single card layout that CSS turns into grid rows ≥900: simplest robust approach = card list everywhere with `.dishes-list` grid; table markup skipped entirely if it risks drift — **decision: responsive card rows**, spec-compliant "responsive table or list").
  - Switch component: `<label class="switch"><input type="checkbox" ...><span class="slider"></span><span class="switch-label">Available</span></label>`; `change` → optimistic update; `PATCH /api/admin/dishes/:id` → on failure revert checkbox + toast error; on success tiny "Saved" flash on the row.
  - Delete: `confirmDialog` → `DELETE` → remove row + toast; failure → toast.
  - Empty state: "No dishes yet" + Add dish CTA; no-results state when filters active.
- [ ] **Step 2: `#/menu/new` and `#/menu/:id/edit` views** — one `dishForm(dish|null)`:
  - Fields per spec: name\*, price\* (`type="number" step="0.01" min="0" inputmode="decimal"` with ₹ prefix adornment), section\* (`<select>` populated from `GET /api/admin/sections`; option "No sections yet — create one first" disabled if empty → link to `#/sections`), description textarea (600 max, live counter), image: file input `accept="image/jpeg,image/png,image/webp,image/avif"` + preview `<img>` (object URL) + Replace + Remove buttons (Remove sets hidden `remove_image` flag and clears preview), Available toggle (checked default for new), Popular toggle (off default).
  - Client validation mirror: name trimmed 1–80 required; price ≥ 0 required; section required; file ≤3MB and type in allowlist → inline errors; server errors mapped to fields when `errors` object returned, else toast.
  - Submit: disable + spinner; FormData when file present else JSON; `POST` (new) / `PUT` (edit); success → toast "Dish saved" → `#/menu`; failure → keep all values + toast/inline error. Object URL revoked on view teardown.
  - Image downscale helper `prepareImage(file)`: `createImageBitmap` → canvas max 1280px → `toBlob('image/webp', .82)`, if returned `blob.type !== 'image/webp'` fallback `toBlob('image/jpeg', .82)` → `{blob, ext}`; on decode failure pass original through (server still validates).
- [ ] **Step 3: Verify flows** (Playwright, mobile + desktop): create dish with photo → appears in list and on customer page; edit price → customer updates ≤30s (or immediate reload); toggle available/popular persists across refresh; delete confirmed; validation errors show inline; failed network (offline toggle via context.setOffline) reverts switch + toast; filters/search work; form survives a failed submit.

---

### Task 14: Admin — sections, reviews, ads views

**Modify:** `public/js/admin.js`, `admin/index.html`, `admin.css`

- [ ] **Step 1: `#/sections` view** — list rows: name (inline editable: pencil → input + save/cancel, Enter saves), dish count badge, ↑/↓ buttons (disabled at ends; `POST /:id/move`, optimistic swap or refetch), Delete (danger text). Add-section form at top (input + Add button; error if duplicate name exists? allow duplicates? **Decision: reject duplicate names case-insensitive** — 409 from server or pre-check list; simpler: server 400 on duplicate → inline error). Delete flow: `GET` counts from list row; if `dish_count > 0` → `confirmDialog` with message "This section has N dishes. Choose where to move them:" + a `<select>` of other sections injected into dialog → confirm → `POST /reassign` then `DELETE`; if none → toast explaining; if count 0 → plain confirm → delete. Empty state: "No sections yet".
- [ ] **Step 2: `#/reviews` view** — `GET /api/admin/reviews`: cards with 5 gold stars, author, content, date, Delete button → confirm "Delete this review by X? This cannot be undone." → DELETE → row removed + toast. Empty state: "No reviews yet — they'll appear here when customers submit them."
- [ ] **Step 3: `#/ads` view** — upload zone (file input + preview), "Upload ad" submit (FormData POST); list: thumbnail 120×80, date, active switch (PATCH), Delete (confirm + storage cleanup). Empty state: "No ads uploaded."
- [ ] **Step 4: Verify all three flows** on mobile viewport + desktop; confirm section-delete-with-dishes safety path (create sec + dish → delete → reassign UI → customer shows dish under new section).

---

### Task 15: Vercel deployment config

**Files:**
- Create: `api/index.js`, `vercel.json`
- Modify: `package.json` if needed

- [ ] **Step 1: `api/index.js`**

```js
'use strict';
const serverless = require('serverless-http');
const { createApp } = require('../server/app');
module.exports = serverless(createApp(), { binary: ['image/*'] });
```

- [ ] **Step 2: `vercel.json`**

```json
{
  "version": 2,
  "framework": null,
  "buildCommand": "",
  "outputDirectory": "public",
  "rewrites": [{ "source": "/api/:path*", "destination": "/api/index" }],
  "functions": { "api/index.js": { "memory": 1024, "maxDuration": 30 } },
  "headers": [
    { "source": "/(.*)", "headers": [
      { "key": "X-Content-Type-Options", "value": "nosniff" },
      { "key": "X-Frame-Options", "value": "DENY" },
      { "key": "Referrer-Policy", "value": "no-referrer" },
      { "key": "Strict-Transport-Security", "value": "max-age=63072000; includeSubDomains" }
    ]},
    { "source": "/(css|js|images)/(.*)", "headers": [
      { "key": "Cache-Control", "value": "public, max-age=86400" }
    ]}
  ]
}
```

- [ ] **Step 3:** Verify `require('../server/app')` resolves from `api/`; `node --check api/index.js`; start local server still works (dual-mode sanity). Note in README: on Vercel the static `public/` is served by CDN, `/api/*` rewritten to the function; env vars set in Vercel dashboard (Project → Settings → Environment Variables): `ADMIN_PASSWORD`, `SESSION_SECRET`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `NODE_ENV=production`.

---

### Task 16: README, security sweep, full acceptance checklist

**Files:**
- Create: `README.md`
- Verify: repo-wide

- [ ] **Step 1: `README.md`** sections: overview; features; prerequisites (Node 20+); local setup (`npm install`, copy `.env.example` → `.env`, fill values — instructions on generating `SESSION_SECRET` with `openssl rand -hex 32` and choosing a strong `ADMIN_PASSWORD`, values kept private, never committed); `npm start` / `npm test`; project structure; API summary table; **Database** (Supabase project, migration `0001_init.sql` applied, tables list, where data lives); **Section deletion policy** (move-or-cancel, never silent cascade); **Deployment on Vercel** (import repo, set env vars, deploy, note that SQLite-like local state doesn't exist — all data in Supabase); **QR code instructions** (open deployed URL, use any QR generator e.g. the phone camera or a QR site, print at tables — QR must point to site root, never `/admin`); **Security notes** (password/env handling, session cookie, rate limits, how to rotate `ADMIN_PASSWORD`); **Deployment-specific requirements** (env vars listed, Storage bucket `menu-images` must exist, no filesystem persistence needed).
- [ ] **Step 2: Security sweep**
  - `rg -n "ADMIN_PASSWORD|SESSION_SECRET|service_role|SUPABASE_SERVICE" public/` → zero matches in served assets.
  - `rg -n "\.env" .gitignore` present; `.env` not readable by git (no repo — fine).
  - Grep `localStorage|sessionStorage` in `public/js/` → zero matches.
  - Confirm error middleware hides stack traces (trigger 500 in test → body has no "at " / node_modules paths).
  - Confirm admin routes all 401 unauthenticated (test suite covers; spot-check `curl /api/admin/stats`).
- [ ] **Step 3: Execute full 17-point acceptance checklist from spec §11** (API + Playwright at 320px, 390px, 768px, 1280px widths): record pass/fail for each; fix failures before finishing. Include review submit → visible in marquee → admin delete → gone; ad upload → visible in strip; poll behavior (change price with menu open, confirm update ≤30s with Playwright clock or manual wait).
- [ ] **Step 4:** `npm test` green; `node --check` all JS; final report to user incl. where the admin password lives (`.env` — not printed), Vercel env var checklist, and QR instructions summary.

---

## Self-Review (plan vs spec)

1. **Spec coverage:** hero/chips/cards/popular/unavailable/empty-states/footer ✓ (T11); ads marquee ✓ (T9 ads API + T11); share-a-review flow ✓ (T9 + T11); admin login/dashboard/menu/form/sections/reviews/ads/nav ✓ (T12–14); auth security (env, cookies, rate limit, CSRF, no client secrets) ✓ (T4, T16); perf (ETag, CDN headers, pooling) ✓ (T5, T15); section delete safety ✓ (T8, T14); QR/README/deliverables ✓ (T16); 17-point checklist ✓ (T16 Step 3).
2. **Placeholders:** none — every step names exact files, endpoints, and test assertions; UI steps specify exact markup/CSS decisions.
3. **Type consistency:** `images.publicUrl(path)` used in menu/ads/dishes routes — defined T7 but referenced T5 (menu serialization) — ordering note: T5 uses it for `image_path` mapping, implementation must exist by T5; **fix: move `server/images.js` publicUrl/sniff stubs creation to T5's implement step? Better: T5 creates `server/images.js` with `publicUrl` only, T7 extends it.** Also `validate.dishInput` (T6) reused by T7 multipart merge — consistent. `confirmDialog` promise API consistent T13/T14. `api()` wrapper name consistent across customer/admin JS (separate files, fine).
