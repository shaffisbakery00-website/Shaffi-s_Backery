'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const {
  startServer,
  login,
  request,
  createSection,
  cleanupSection,
  supabase,
  multipart,
  PNG_1x1,
  JPEG_TINY,
  publicUrlReachable,
} = require('./helpers');

let server;
let base;
let cookie;
const createdSections = [];
const createdDishes = [];

before(async () => {
  ({ server, base } = await startServer());
  ({ cookie } = await login(base));
});

after(async () => {
  for (const id of createdDishes) await supabase.from('dishes').delete().eq('id', id);
  for (const id of createdSections) await cleanupSection(id);
  server.close();
});

async function newSection() {
  const s = await createSection();
  createdSections.push(s.id);
  return s;
}

async function createDish(payload) {
  const res = await request(base, '/api/admin/dishes', { method: 'POST', body: payload, cookie });
  if (res.status === 201) createdDishes.push(res.data.dish.id);
  return res;
}

test('diet defaults to veg and accepts non_veg, rejecting anything else', async () => {
  const section = await newSection();

  const byDefault = await createDish({ name: 'Default Diet', price: 5, section_id: section.id });
  assert.equal(byDefault.status, 201);
  assert.equal(byDefault.data.dish.diet, 'veg');

  const nonVeg = await createDish({ name: 'Chicken Something', price: 6, section_id: section.id, diet: 'non_veg' });
  assert.equal(nonVeg.status, 201);
  assert.equal(nonVeg.data.dish.diet, 'non_veg');

  const invalid = await createDish({ name: 'Weird', price: 5, section_id: section.id, diet: 'maybe' });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.data.errors.diet);
});

test('badge defaults to none and accepts popular, best_choice and chefs_choice', async () => {
  const section = await newSection();

  const byDefault = await createDish({ name: 'No Badge', price: 5, section_id: section.id });
  assert.equal(byDefault.status, 201);
  assert.equal(byDefault.data.dish.badge, 'none');

  const popular = await createDish({ name: 'Popular One', price: 5, section_id: section.id, badge: 'popular' });
  assert.equal(popular.status, 201);
  assert.equal(popular.data.dish.badge, 'popular');

  const best = await createDish({ name: 'Best One', price: 5, section_id: section.id, badge: 'best_choice' });
  assert.equal(best.status, 201);
  assert.equal(best.data.dish.badge, 'best_choice');

  const chefs = await createDish({ name: 'Chefs One', price: 5, section_id: section.id, badge: 'chefs_choice' });
  assert.equal(chefs.status, 201);
  assert.equal(chefs.data.dish.badge, 'chefs_choice');

  const invalid = await createDish({ name: 'Weird Badge', price: 5, section_id: section.id, badge: 'gold' });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.data.errors.badge);
});

test('a dish can be created and appears in the admin list', async () => {
  const section = await newSection();
  const res = await createDish({ name: 'Belgian Chocolate Cake', description: 'Rich and moist', price: 12.5, section_id: section.id });
  assert.equal(res.status, 201);
  assert.equal(res.data.dish.name, 'Belgian Chocolate Cake');
  assert.equal(res.data.dish.price, 12.5);
  assert.equal(res.data.dish.section_name, section.name);
  assert.equal(res.data.dish.is_available, true);

  const list = await request(base, `/api/admin/dishes?section_id=${section.id}`, { cookie });
  assert.equal(list.status, 200);
  assert.ok(list.data.some((d) => d.id === res.data.dish.id));
});

test('validation rejects missing/invalid fields', async () => {
  const section = await newSection();

  const noName = await createDish({ name: '', price: 5, section_id: section.id });
  assert.equal(noName.status, 400);
  assert.ok(noName.data.errors.name);

  const badPrice = await createDish({ name: 'X', price: -1, section_id: section.id });
  assert.equal(badPrice.status, 400);
  assert.ok(badPrice.data.errors.price);

  const noSection = await createDish({ name: 'X', price: 5, section_id: 'not-a-uuid' });
  assert.equal(noSection.status, 400);
  assert.ok(noSection.data.errors.section_id);

  const ghostSection = await createDish({
    name: 'X',
    price: 5,
    section_id: '00000000-0000-0000-0000-000000000000',
  });
  assert.equal(ghostSection.status, 400);
});

test('a dish image uploads to storage, is publicly reachable, and can be replaced', async () => {
  const section = await newSection();
  const createRes = await request(base, '/api/admin/dishes', {
    method: 'POST',
    cookie,
    raw: true,
    body: multipart(
      { name: 'Carrot Cake', price: '10', section_id: section.id },
      { buffer: PNG_1x1, type: 'image/png', name: 'cake.png' }
    ),
  });
  assert.equal(createRes.status, 201);
  createdDishes.push(createRes.data.dish.id);
  const firstUrl = createRes.data.dish.image_url;
  assert.ok(firstUrl, 'image should be stored and exposed as a public URL');
  assert.equal(await publicUrlReachable(firstUrl), 200);

  const replaceRes = await request(base, `/api/admin/dishes/${createRes.data.dish.id}`, {
    method: 'PUT',
    cookie,
    raw: true,
    body: multipart(
      { name: 'Carrot Cake', price: '11', section_id: section.id },
      { buffer: JPEG_TINY, type: 'image/jpeg', name: 'cake.jpg' }
    ),
  });
  assert.equal(replaceRes.status, 200);
  assert.ok(replaceRes.data.dish.image_url);
  assert.notEqual(replaceRes.data.dish.image_url, firstUrl);
  assert.equal(await publicUrlReachable(replaceRes.data.dish.image_url), 200);
});

test('an unsupported file type is rejected by the server-side sniffer', async () => {
  const section = await newSection();
  const res = await request(base, '/api/admin/dishes', {
    method: 'POST',
    cookie,
    raw: true,
    body: multipart(
      { name: 'Fake', price: '1', section_id: section.id },
      { buffer: Buffer.from('this is not an image'), type: 'image/png', name: 'fake.png' }
    ),
  });
  assert.equal(res.status, 400);
});

test('toggle endpoints flip availability and the badge', async () => {
  const section = await newSection();
  const created = await createDish({ name: 'Toggle Me', price: 3, section_id: section.id });
  const id = created.data.dish.id;

  const off = await request(base, `/api/admin/dishes/${id}`, { method: 'PATCH', body: { is_available: false }, cookie });
  assert.equal(off.status, 200);
  assert.equal(off.data.dish.is_available, false);

  const badge = await request(base, `/api/admin/dishes/${id}`, { method: 'PATCH', body: { badge: 'best_choice' }, cookie });
  assert.equal(badge.status, 200);
  assert.equal(badge.data.dish.badge, 'best_choice');
  assert.equal(badge.data.dish.is_available, false);

  const invalid = await request(base, `/api/admin/dishes/${id}`, { method: 'PATCH', body: { badge: 'super_star' }, cookie });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.data.errors.badge);

  const empty = await request(base, `/api/admin/dishes/${id}`, { method: 'PATCH', body: {}, cookie });
  assert.equal(empty.status, 400);
});

test('filters narrow the admin list', async () => {
  const section = await newSection();
  const a = await createDish({ name: 'Filter Alpha ' + section.id.slice(0, 4), price: 1, section_id: section.id });
  const b = await createDish({ name: 'Filter Beta', price: 2, section_id: section.id });
  await request(base, `/api/admin/dishes/${b.data.dish.id}`, { method: 'PATCH', body: { is_available: false }, cookie });

  const bySearch = await request(base, '/api/admin/dishes?q=Filter', { cookie });
  assert.ok(bySearch.data.some((d) => d.id === a.data.dish.id));

  const unavailable = await request(base, `/api/admin/dishes?section_id=${section.id}&availability=false`, { cookie });
  assert.deepEqual(unavailable.data.map((d) => d.id), [b.data.dish.id]);
});

test('a dish can be deleted', async () => {
  const section = await newSection();
  const created = await createDish({ name: 'Delete Me', price: 4, section_id: section.id });
  const id = created.data.dish.id;

  const del = await request(base, `/api/admin/dishes/${id}`, { method: 'DELETE', cookie });
  assert.equal(del.status, 200);
  const idx = createdDishes.indexOf(id);
  if (idx >= 0) createdDishes.splice(idx, 1);

  const missing = await request(base, `/api/admin/dishes/${id}`, { method: 'DELETE', cookie });
  assert.equal(missing.status, 404);
});
