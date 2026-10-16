'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, login, request, createSection, cleanupSection, supabase } = require('./helpers');

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

test('sections can be created, listed with counts, and renamed', async () => {
  const created = await request(base, '/api/admin/sections', { method: 'POST', body: { name: `Cakes ${Date.now()}`, }, cookie });
  assert.equal(created.status, 201);
  createdSections.push(created.data.section.id);
  assert.equal(created.data.section.dish_count, 0);

  const rename = await request(base, `/api/admin/sections/${created.data.section.id}`, {
    method: 'PUT',
    body: { name: `Cakes & Tarts ${Date.now()}` },
    cookie,
  });
  assert.equal(rename.status, 200);

  const list = await request(base, '/api/admin/sections', { cookie });
  const found = list.data.find((s) => s.id === created.data.section.id);
  assert.ok(found);
  assert.equal(found.dish_count, 0);
});

test('duplicate section names are rejected', async () => {
  const name = `Dupes ${Date.now()}`;
  const first = await request(base, '/api/admin/sections', { method: 'POST', body: { name }, cookie });
  createdSections.push(first.data.section.id);

  const second = await request(base, '/api/admin/sections', { method: 'POST', body: { name }, cookie });
  assert.equal(second.status, 400);
});

test('sections reorder up and down without corrupting order', async () => {
  const one = await newSection();
  const two = await newSection();

  const before = await request(base, '/api/admin/sections', { cookie });
  const order = (list) => list.data.map((s) => s.id);
  const start = order(before);
  const iOne = start.indexOf(one.id);
  const iTwo = start.indexOf(two.id);
  assert.ok(iOne >= 0 && iTwo >= 0);

  // Move the later one up and confirm it now precedes the other among our own pair.
  const later = iOne > iTwo ? one : two;
  const earlier = iOne > iTwo ? two : one;
  const moved = await request(base, `/api/admin/sections/${later.id}/move`, { method: 'POST', body: { direction: 'up' }, cookie });
  assert.equal(moved.status, 200);

  const afterMove = order(await request(base, '/api/admin/sections', { cookie }));
  assert.ok(afterMove.indexOf(later.id) < afterMove.indexOf(earlier.id));

  const movedBack = await request(base, `/api/admin/sections/${later.id}/move`, { method: 'POST', body: { direction: 'down' }, cookie });
  assert.equal(movedBack.status, 200);
  const afterBack = order(await request(base, '/api/admin/sections', { cookie }));
  assert.ok(afterBack.indexOf(later.id) > afterBack.indexOf(earlier.id));

  const bad = await request(base, `/api/admin/sections/${later.id}/move`, { method: 'POST', body: { direction: 'sideways' }, cookie });
  assert.equal(bad.status, 400);
});

test('deleting a non-empty section is refused with a code and dish count', async () => {
  const section = await newSection();
  const dish = await request(base, '/api/admin/dishes', {
    method: 'POST',
    body: { name: 'Guarded Dish', price: 5, section_id: section.id },
    cookie,
  });
  createdDishes.push(dish.data.dish.id);

  const del = await request(base, `/api/admin/sections/${section.id}`, { method: 'DELETE', cookie });
  assert.equal(del.status, 409);
  assert.equal(del.data.code, 'SECTION_NOT_EMPTY');
  assert.equal(del.data.dish_count, 1);

  // Section still exists.
  const list = await request(base, '/api/admin/sections', { cookie });
  assert.ok(list.data.some((s) => s.id === section.id));
});

test('reassign moves dishes to another section then deletes the source', async () => {
  const from = await newSection();
  const to = await newSection();
  const dish = await request(base, '/api/admin/dishes', {
    method: 'POST',
    body: { name: 'Movable Dish', price: 6, section_id: from.id },
    cookie,
  });
  createdDishes.push(dish.data.dish.id);

  const res = await request(base, '/api/admin/sections/reassign', {
    method: 'POST',
    body: { from_section_id: from.id, to_section_id: to.id },
    cookie,
  });
  assert.equal(res.status, 200);

  const idx = createdSections.indexOf(from.id);
  if (idx >= 0) createdSections.splice(idx, 1);

  const { data } = await supabase.from('dishes').select('section_id').eq('id', dish.data.dish.id).single();
  assert.equal(data.section_id, to.id);

  const list = await request(base, '/api/admin/sections', { cookie });
  assert.ok(!list.data.some((s) => s.id === from.id));
});

test('an empty section can be deleted', async () => {
  const section = await newSection();
  const del = await request(base, `/api/admin/sections/${section.id}`, { method: 'DELETE', cookie });
  assert.equal(del.status, 200);
  const idx = createdSections.indexOf(section.id);
  if (idx >= 0) createdSections.splice(idx, 1);
});
