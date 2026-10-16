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
} = require('./helpers');

let server;
let base;
let cookie;
const createdSections = [];
const createdDishes = [];
const createdAds = [];

before(async () => {
  ({ server, base } = await startServer());
  ({ cookie } = await login(base));
});

after(async () => {
  for (const id of createdDishes) await supabase.from('dishes').delete().eq('id', id);
  for (const id of createdSections) await cleanupSection(id);
  for (const id of createdAds) await supabase.from('ads').delete().eq('id', id);
  server.close();
});

test('stats count reflects a newly created section and dish', async () => {
  const before = await request(base, '/api/admin/stats', { cookie });
  assert.equal(before.status, 200);

  const section = await createSection();
  createdSections.push(section.id);
  const dish = await request(base, '/api/admin/dishes', {
    method: 'POST',
    body: { name: 'Stats Dish', price: 7, section_id: section.id, is_popular: true },
    cookie,
  });
  createdDishes.push(dish.data.dish.id);

  const after = await request(base, '/api/admin/stats', { cookie });
  assert.equal(after.data.sections, before.data.sections + 1);
  assert.equal(after.data.dishes, before.data.dishes + 1);
  assert.equal(after.data.popular, before.data.popular + 1);
  assert.ok(Array.isArray(after.data.recent));
  assert.equal(after.data.recent[0].id, dish.data.dish.id);
  assert.equal(after.data.recent[0].section_name, section.name);
});

test('ads can be uploaded, listed (admin + public), toggled, and deleted', async () => {
  const created = await request(base, '/api/admin/ads', {
    method: 'POST',
    cookie,
    raw: true,
    body: multipart({}, { buffer: PNG_1x1, type: 'image/png', name: 'promo.png' }),
  });
  assert.equal(created.status, 201);
  createdAds.push(created.data.ad.id);
  assert.ok(created.data.ad.image_url);

  const publicList = await request(base, '/api/ads');
  assert.ok(publicList.data.some((a) => a.id === created.data.ad.id));

  const adminList = await request(base, '/api/admin/ads', { cookie });
  assert.ok(adminList.data.some((a) => a.id === created.data.ad.id));

  const off = await request(base, `/api/admin/ads/${created.data.ad.id}`, { method: 'PATCH', body: { is_active: false }, cookie });
  assert.equal(off.status, 200);
  assert.equal(off.data.ad.is_active, false);

  const publicAfter = await request(base, '/api/ads');
  assert.ok(!publicAfter.data.some((a) => a.id === created.data.ad.id));

  const del = await request(base, `/api/admin/ads/${created.data.ad.id}`, { method: 'DELETE', cookie });
  assert.equal(del.status, 200);
  const idx = createdAds.indexOf(created.data.ad.id);
  if (idx >= 0) createdAds.splice(idx, 1);
});

test('ad upload without an image is rejected', async () => {
  const res = await request(base, '/api/admin/ads', {
    method: 'POST',
    cookie,
    raw: true,
    body: multipart({}),
  });
  assert.equal(res.status, 400);
});
