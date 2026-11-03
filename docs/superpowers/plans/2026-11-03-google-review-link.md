# Google-Review-Link Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove all on-site review storage/display/moderation; "Share a review" opens Google's own review box for Shaffi's Bakery (`placeid=ChIJRQH83EC9qDsRi1TrNUR8_nI`).

**Architecture:** Pure removal + one anchor link. Express routes for reviews are deleted, the Supabase `reviews` table is dropped via migration, customer/admin review UI and JS are deleted, and the floating "Share a review" button becomes a `<a target="_blank" rel="noopener">` to Google's official free deep link.

**Tech Stack:** Node ≥20 (`node --test`), Express 5, Supabase, static HTML/CSS/JS. Test command: `npm test` (= `node --env-file=.env --test --test-concurrency=1`; requires a live Supabase from `.env`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-11-03-google-review-link-design.md`.
- Deep link constant, use verbatim everywhere: `https://search.google.com/local/writereview?placeid=ChIJRQH83EC9qDsRi1TrNUR8_nI`
- No new dependencies. No new comments. No API keys. Site never displays or stores reviews again.
- Keep everything non-review intact: menu/dishes/sections/ads (offers), auth, rate-limit middleware (login uses it), toolbar ticker marquee.
- Windows/PowerShell environment: chain commands with `;`. Test runs need `.env` present (gitignored, exists).
- Do not commit `.env`, `.playwright-cli/`, or unrelated working-tree changes (`.gitignore` currently has an uncommitted edit adding a duplicate `.vercel` line — leave it; Task 6 cleans it intentionally).

---

### Task 1: Customer page — remove review UI (HTML, JS, CSS)

**Files:**
- Modify: `public/index.html` (delete lines 51–53, 113–153, 155, 196–202)
- Modify: `public/js/customer.js`
- Modify: `public/css/customer.css`
- Modify: `tests/pages.test.js` (add two absence assertions to the customer-page test)

**Interfaces:**
- Consumes: nothing new.
- Produces: `public/index.html` with no `#reviews-marquee`, no `#review-dialog`, no `#review-template`, no `#toast`; `customer.js` with no review/toast code (menu + offers/ads polling intact, `getJSON`/`show` still used).

- [ ] **Step 1: Write failing tests (TDD)**

In `tests/pages.test.js`, inside `test('the customer page is served with the expected CSP and no inline scripts', …)` after the existing `assert.match(res.data, /src="\/js\/customer\.js"/);` line, add:

```js
  assert.doesNotMatch(res.data, /review-dialog|reviews-marquee|review-template|review-form/);
```

- [ ] **Step 2: Run to verify FAIL**

Run: `npm test` (or `node --env-file=.env --test tests/pages.test.js`)
Expected: FAIL — current HTML still contains those HTML ids.

- [ ] **Step 3: Edit `public/index.html`**

3a. Delete the reviews marquee (lines 51–53):

```html
      <div class="marquee marquee--reviews" id="reviews-marquee">
        <div class="marquee__track" id="reviews-track"></div>
      </div>
```

(Keep the surrounding `<section class="offers">` above and `</header>` after.)

3b. Delete the entire review dialog, lines 113–153 (`<dialog class="dialog" id="review-dialog" …>` through its closing `</dialog>`), and the toast div on line 155:

```html
    <div class="toast" id="toast" role="status" aria-live="polite"></div>
```

3c. Delete the review template (lines 196–202):

```html
    <template id="review-template">
      <figure class="review-card">
        <div class="review-card__stars" aria-hidden="true"></div>
        <blockquote class="review-card__quote"></blockquote>
        <figcaption class="review-card__author"></figcaption>
      </figure>
    </template>
```

- [ ] **Step 4: Edit `public/js/customer.js`**

4a. `STATE` (line 4) → remove `reviews` and `reviewSig`:

```js
  const STATE = { menu: [], ads: [], query: '', filter: 'all', menuSig: '', adSig: '' };
```

4b. `els` (lines 6–21) → remove the `reviewsTrack`, `reviewsEmpty`, `dialog`, `form`, `error`, `stars`, and `toast` entries; result:

```js
  const els = {
    menu: document.getElementById('menu'),
    menuEmpty: document.getElementById('menu-empty'),
    menuLoading: document.getElementById('menu-loading'),
    chips: document.getElementById('section-chips'),
    search: document.getElementById('menu-search'),
    offers: document.getElementById('offers'),
    offersTrack: document.getElementById('offers-track'),
  };
```

4c. Delete the `STAR` const (lines 23–24).

4d. Delete the `toast` function (lines 42–47).

4e. Delete `fillMarquee` (lines 224–233) — keep `buildOffer` that follows it.

4f. Delete `buildReview` (lines 250–262).

4g. Delete `renderReviews` (lines 358–362).

4h. Delete `loadReviews` (lines 384–395) — keep `loadAds`.

4i. `refreshAll` (lines 410–414) → remove the `loadReviews();` line; result:

```js
  function refreshAll() {
    loadMenu();
    loadAds();
  }
```

4j. Delete the entire Review-dialog section, lines 422–540, from `/* ----------------------- Review dialog ----------------------- */` through the end of `submitReview` (inclusive) — that is: `let rating = 0;`, `buildStars`, `setRating`, `openDialog`, `closeDialog`, `showErrors`, `submitReview`.

4k. In the wire-up section, delete lines 554–566 — the `for (const id of ['open-review', 'open-review2'])` loop, the `close-review` listener, the two `els.dialog` listeners, and `els.form.addEventListener('submit', submitReview);`.

4l. Delete the `buildStars();` call (line 579). The IIFE still ends with:

```js
  wireSliderSwipe();
  refreshAll();
  startPolling();
})();
```

- [ ] **Step 5: Edit `public/css/customer.css`**

5a. Delete the reviews-ticker block (lines 49–61): `.marquee--reviews` and `.marquee--reviews .marquee__track` (keep the following `/* ---------- Toolbar ---------- */`).

5b. Delete the reviews-band block (lines 604–632): `.reviews`, `.reviews__head`, `.reviews__title`, `.reviews__subtitle`, `.reviews__actions`. **Keep** `.btn`, `.btn--primary`, `.btn--ghost`, `.btn svg`, `.btn:disabled` (lines 634–679) — the island link still uses them.

5c. Delete the review-card block (lines 681–734): `.review-card`, `.review-card__stars` (+ `svg`, `.off`), `.review-card__quote`, `.review-card__author`, `.reviews .marquee__track`, `.review-card__author::before`.

5d. Delete the whole Dialog section (lines 736–870): `.dialog`…`.form-error` (`.dialog*`, `.field*`, `.honeypot`, `.stars`, `.stars__item*`, `.form-error`). Verified only the review dialog uses these in the customer page (toolbar search uses `.search` classes; dialogs exist only in `admin/`).

5e. Delete the Toast section (lines 872–894): `.toast` and `.toast.is-visible`.

5f. In the `@media (max-width: 640px)` block, delete only the review rules (lines 987–997): `.marquee--reviews { … }`, `.review-card { … }`, `.review-card__quote { … }`. Keep the `.hero*` rules around them.

- [ ] **Step 6: Run tests to verify PASS**

Run: `npm test`
Expected: all pages/auth/menu/etc. PASS; the new absence assertion passes.

- [ ] **Step 7: Syntax-check the JS**

Run: `node --check public/js/customer.js`
Expected: no output (clean).

- [ ] **Step 8: Commit**

```powershell
git add public/index.html public/js/customer.js public/css/customer.css tests/pages.test.js
git commit -m "feat(customer): remove stored-review UI, template and styles"
```

---

### Task 2: Customer page — "Share a review" opens Google's review box

**Files:**
- Modify: `tests/pages.test.js` (add presence assertion)
- Modify: `public/index.html` (island button → anchor)

**Interfaces:**
- Produces: the deep-link constant lives verbatim in `public/index.html`.

- [ ] **Step 1: Write failing test**

In `tests/pages.test.js`, same customer-page test, after the Task-1 absence assertion add:

```js
  assert.match(res.data,
    /href="https:\/\/search\.google\.com\/local\/writereview\?placeid=ChIJRQH83EC9qDsRi1TrNUR8_nI"/);
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node --env-file=.env --test tests/pages.test.js`
Expected: FAIL — button has no href yet.

- [ ] **Step 3: Edit `public/index.html` (island, lines ~108–111)**

Replace:

```html
    <aside class="island" id="review-island" aria-label="Share a review">
      <span>Enjoyed your visit? We would love to hear from you.</span>
      <button class="btn btn--primary btn--small" type="button" id="open-review">Share a review</button>
    </aside>
```

with:

```html
    <aside class="island" id="review-island" aria-label="Share a review">
      <span>Enjoyed your visit? We would love to hear from you.</span>
      <a class="btn btn--primary btn--small" id="open-review"
         href="https://search.google.com/local/writereview?placeid=ChIJRQH83EC9qDsRi1TrNUR8_nI"
         target="_blank" rel="noopener"
         aria-label="Share a review on Google">Share a review</a>
    </aside>
```

- [ ] **Step 4: Run tests to verify PASS**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Verify the deep link is alive**

```powershell
$r = Invoke-WebRequest -Uri "https://search.google.com/local/writereview?placeid=ChIJRQH83EC9qDsRi1TrNUR8_nI" -UseBasicParsing -UserAgent "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" -MaximumRedirection 5; "STATUS=$($r.StatusCode) FINAL=$($r.BaseResponse.ResponseUri)"
```

Expected: `STATUS=200` and final URL on `search.google.com` (a redirect to `accounts.google.com` sign-in is also acceptable — the box itself requires sign-in). Anything 4xx with "not found" means the place ID went stale → re-run the ID lookup (spec §The deep link) and update the two occurrences.

- [ ] **Step 6: Commit**

```powershell
git add public/index.html tests/pages.test.js
git commit -m "feat(customer): share a review opens Google's review box"
```

---

### Task 3: Admin page — remove Reviews tab + moderation

**Files:**
- Modify: `tests/pages.test.js` (tab absence assertion)
- Modify: `public/admin/index.html` (delete lines 101, 154–163, 400–413)
- Modify: `public/js/admin.js` (STATE line 9, section 760–803, line 1132, line 1193)
- Modify: `public/css/admin.css` (delete lines 711–730 review rules)

**Interfaces:**
- Produces: admin JS with no `loadReviews`/`renderReviews`/`deleteReview`; tabs = overview, menu, ads("Offers").

- [ ] **Step 1: Write failing test**

In `tests/pages.test.js`, inside `test('the admin page is served and loads its own bundle', …)` after `assert.match(res.data, /src="\/js\/admin\.js"/);` add:

```js
  assert.doesNotMatch(res.data, /data-tab="reviews"|panel-reviews|review-template/);
```

- [ ] **Step 2: Run to verify FAIL**

Run: `node --env-file=.env --test tests/pages.test.js`
Expected: FAIL.

- [ ] **Step 3: Edit `public/admin/index.html`**

3a. Delete the tab button (line 101):

```html
          <button class="tab" role="tab" aria-selected="false" data-tab="reviews">Reviews</button>
```

3b. Delete the whole panel block (lines 154–163), including the `<!-- Reviews -->` comment:

```html
        <!-- Reviews -->
        <section class="panel" id="panel-reviews" role="tabpanel" aria-label="Reviews">
          <div class="section-head">
            <h2>Reviews</h2>
            <button class="btn btn--ghost btn--sm" type="button" id="refresh-reviews">Refresh</button>
          </div>
          <div class="card">
            <ul class="list reviews-list" id="reviews-list"></ul>
          </div>
        </section>
```

3c. Delete the review template (lines 400–413):

```html
    <template id="review-template">
      <li class="row review-item">
        <div class="row__main">
          <p class="row__title review-item__author"></p>
          <p class="stars review-item__stars"></p>
          <p class="quote review-item__quote"></p>
        </div>
        <div class="row__actions">
          <button class="icon-btn" type="button" data-action="delete" aria-label="Delete review">
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </button>
        </div>
      </li>
    </template>
```

- [ ] **Step 4: Edit `public/js/admin.js`**

4a. STATE (line 9) → delete `reviews: [],`. Result:

```js
  const STATE = {
    sections: [],
    dishes: [],
    ads: [],
    filters: { q: '', section_id: '', availability: '' },
    activeTab: 'overview',
  };
```

4b. Delete the Reviews section (lines 760–803): `/* --------------------------- Reviews --------------------------- */` + `loadReviews` + `renderReviews` + `deleteReview`. The file then continues with the Ads section (`/* --------------------------- Ads --------------------------- */`).

4c. Delete line 1132 `if (tab === 'reviews') loadReviews();` from `switchTab`.

4d. Delete line 1193 `$('refresh-reviews').addEventListener('click', loadReviews);` from `wire()`.

- [ ] **Step 5: Edit `public/css/admin.css`**

Delete the review item rules (lines 711–730): `.reviews-list .review-item`, `.stars`, `.stars .off`, `.quote` — **note the comment header is `/* ---------- Reviews & ads ---------- */` and `.ads-grid` below it stays**; result keeps:

```css
/* ---------- Reviews & ads ---------- */

.ads-grid {
```

(`.stars`/`.quote` are used by nothing else in the admin page — verified. `.emptyNote` comes from JS `emptyNote`, untouched.)

- [ ] **Step 6: Run tests to verify PASS + syntax check**

Run: `npm test`
Run: `node --check public/js/admin.js`
Expected: PASS / no output.

- [ ] **Step 7: Commit**

```powershell
git add public/admin/index.html public/js/admin.js public/css/admin.css tests/pages.test.js
git commit -m "feat(admin): remove reviews moderation"
```

---

### Task 4: Server — delete review routes/validator + delete/trim review tests

**Files:**
- Delete: `server/routes/reviews.js`
- Modify: `server/routes/api.js` (line 8)
- Modify: `server/routes/admin.js` (lines 43–67)
- Modify: `server/validate.js` (lines 143–163 and export line 193)
- Delete: `tests/reviews.test.js`
- Modify: `tests/ratelimit.test.js` (lines 58–71)
- Modify: `tests/auth.test.js` (line 79, path list line 101)

**Interfaces:**
- Produces: no `GET/POST /api/reviews`, no `GET/DELETE /api/admin/reviews[/:id]`, no `validate.reviewInput`. `validate.isUuid` etc. unchanged. Note `requireAdmin` runs before 404 on `/api/admin/reviews*` — unauthenticated hits still return 401.

- [ ] **Step 1: Update/remove the affected tests FIRST (red)**

1a. Delete `tests/reviews.test.js` entirely.

1b. In `tests/ratelimit.test.js` delete the whole review test (lines 58–71), `test('review submissions are rate limited after 3 from the same IP', …)` through its closing `});`. The login rate-limit test above it stays.

1c. In `tests/auth.test.js`:
- Delete line 79: `['DELETE', '/api/admin/reviews/00000000-0000-0000-0000-000000000000'],`
- Change line 101 from:

```js
  for (const path of ['/api/menu', '/api/reviews', '/api/ads']) {
```

to:

```js
  for (const path of ['/api/menu', '/api/ads']) {
```

1d. Run: `node --env-file=.env --test tests/auth.test.js tests/ratelimit.test.js`
Expected: PASS **with the old server still in place** (tests no longer reference reviews).

- [ ] **Step 2: Delete `server/routes/reviews.js`**

```powershell
git rm server/routes/reviews.js
```

- [ ] **Step 3: Unmount in `server/routes/api.js`**

Delete line 8 `router.use('/reviews', require('./reviews'));` — resulting body:

```js
router.use('/auth', require('./auth'));
router.use('/menu', require('./menu'));
router.use('/ads', require('./ads'));

router.use('/admin/dishes', requireAdmin, require('./dishes'));
router.use('/admin/sections', requireAdmin, require('./sections'));
router.use('/admin', requireAdmin, require('./admin'));
```

- [ ] **Step 4: Delete admin review endpoints in `server/routes/admin.js`**

Delete lines 43–67, i.e. `// GET /api/admin/reviews — all reviews, newest first.` through the end of `router.delete('/reviews/:id', …)` (`});`), keeping the ads endpoints above and below.

- [ ] **Step 5: Delete `reviewInput` from `server/validate.js`**

Delete lines 143–163 (`function reviewInput(body = {}) { … }`) and delete `reviewInput,` from `module.exports` (was line 193). Result:

```js
module.exports = {
  isUuid,
  toBool,
  dishInput,
  toggleInput,
  adInput,
  sectionInput,
  directionInput,
  reassignInput,
};
```

Confirm no other server file references `reviewInput` (the only consumer was `server/routes/reviews.js`).

- [ ] **Step 6: Verify the 404 behavior (both guards matter)**

Start the server in a background terminal opening: `npm start` (defaults to `PORT` from `.env`, typically 3000). Then:

```powershell
(curl.exe -s -o NUL -w "no-cookie:%{http_code}`n" http://localhost:3000/api/admin/reviews);
(curl.exe -s -o NUL -w "reviews:%{http_code}`n" http://localhost:3000/api/reviews)
```

Expected: `no-cookie:401` (requireAdmin still guards the admin router), `reviews:404` with JSON body `{"error":"Not found"}`. An authenticated check (optional, needs a session cookie via login) returns 404. Stop the server afterwards.

- [ ] **Step 7: Full suite + syntax check**

Run: `npm test`
Run: `node --check server/routes/admin.js; node --check server/validate.js; node --check server/routes/api.js`
Expected: all tests PASS; syntax clean.

- [ ] **Step 8: Commit**

```powershell
git add -A
git commit -m "refactor(api): remove review endpoints, validator and review tests"
```

---

### Task 5: Supabase migration — drop the `reviews` table

**Files:**
- Create: `supabase/migrations/0007_drop_reviews.sql`

**Interfaces:**
- Produces: no `public.reviews` table (policies on it drop automatically with the table).

- [ ] **Step 1: Create the migration file**

```sql
-- Migration 0007: reviews no longer stored on-site; see docs/superpowers/specs/2026-11-03-google-review-link-design.md
drop table if exists public.reviews;
```

- [ ] **Step 2: Apply it**

Apply in **Supabase Dashboard → SQL Editor** (this project applies migrations manually — same as the original build):

```sql
drop table if exists public.reviews;
```

Then verify in Table Editor: `reviews` no longer listed. (If preferred instead, run the statement against the project's Postgres connection string with psql.)

**Failed drop:** if `ERROR: permission denied`, ensure the SQL editor runs as `postgres` role; the anonymous key must NOT be able to DDL.

- [ ] **Step 3: Full suite still green (tests no longer touch the table)**

Run: `npm test`
Expected: PASS.

- [ ] **Step 4: Commit**

```powershell
git add supabase/migrations/0007_drop_reviews.sql
git commit -m "chore(db): drop reviews table"
```

---

### Task 6: Final sweep, repo hygiene, live verification

**Files:**
- Modify: `.gitignore` (normalize; add `.playwright-cli/`)
- Verify: repo-wide leftover review references; live page

- [ ] **Step 1: Repo hygiene — .gitignore and .playwright-cli/**

Current working tree has an uncommitted `.gitignore` edit that appended a duplicate `.vercel`. Rewrite `.gitignore` as exactly:

```
node_modules/
.env
uploads/
.DS_Store
.vercel
.playwright-cli/
```

Delete tooling leftovers: `Remove-Item -Recurse -Force .playwright-cli` (created by a failed `playwright-cli` attempt at design time).

- [ ] **Step 2: Leftover-reference sweep**

```powershell
git grep -i review -- public server tests README.md
```

Expected: **no matches, exit code 1** ("git grep -i review" returns nothing). The `public` paths must not even contain `review-island`… actually `#review-island` id stays (harmless label) — if that one id bothers the sweep, keep it: `id="review-island"` is an aria landmark, not review code. `docs/superpowers/**` keeps historical specs/plans — untouched by design. Also check the migrations record: `git grep -i review -- supabase/migrations` should only hit `0007_drop_reviews.sql`'s own file-name comment. If README mentions reviews, remove those mentions in the same commit.

- [ ] **Step 3: Log sanity + full suite one more time**

Run: `npm test`
Run: `git log --oneline -5`
Expected: suite PASS; 5 new commits from this plan present.

- [ ] **Step 4: Live manual verification (server + real browser)**

1. Run `npm start` in one terminal.
2. Open `http://localhost:3000/` — home page loads, **no scrolling reviews strip**, no console errors.
3. Tap **"Share a review"** → new tab opens Google's "Rate & review" box for Shaffi's Bakery (must be signed in to a Google account to post — normal Google behavior).
4. Open `/admin`, log in — no Reviews tab; Overview/Menu/Offers tabs work; refresh Overview.
5. On a phone, `npm start` exposed on LAN (`--host`-less: bind already does; visit from phone via PC IP:PORT) — same link behavior. Optional; the mobile layout matters because the island is fixed to the bottom.

If Google's box shows the wrong place or none: the place ID went stale — re-run the headless extraction (the same headless-Maps method used during design) and replace the href in `public/index.html`.

- [ ] **Step 5: Commit**

```powershell
git add .gitignore
git commit -m "chore(repo): ignore .playwright-cli, tidy .gitignore"
```

---

## Notes

- Comment style: the repo streamlines comments; this plan adds zero new comments except the migration file header.
- If any test outside the listed ones turns red mid-plan, fix by keeping the removals, never by re-adding review functionality.
- Vercel deploy (`api/index.js` + `vercel.json` functions) mounts the same `server/app.js` — no config change needed; the deleted route simply disappears on deploy.
