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

async function addDish(section_id, extra = {}) {
  const res = await request(base, '/api/admin/dishes', {
    method: 'POST',
    body: { name: 'Menu Dish ' + Date.now(), price: 9, section_id, ...extra },
    cookie,
  });
  createdDishes.push(res.data.dish.id);
  return res.data.dish;
}

test('the public menu nests dishes under sections and omits empty sections', async () => {
  const withDish = await createSection();
  createdSections.push(withDish.id);
  const empty = await createSection();
  createdSections.push(empty.id);

  const dish = await addDish(withDish.id);

  const res = await request(base, '/api/menu');
  assert.equal(res.status, 200);
  assert.ok(res.data.generated_at);

  const shown = res.data.sections.find((s) => s.id === withDish.id);
  assert.ok(shown, 'section with a dish should be present');
  assert.ok(shown.dishes.some((d) => d.id === dish.id));
  const serialized = shown.dishes.find((d) => d.id === dish.id);
  assert.equal(serialized.price, 9);
  assert.equal(typeof serialized.is_available, 'boolean');
  assert.ok('image_url' in serialized);

  assert.ok(!res.data.sections.some((s) => s.id === empty.id), 'empty section should be hidden');
});

test('dishes keep their section association in the public menu', async () => {
  const section = await createSection();
  createdSections.push(section.id);
  const dish = await addDish(section.id, { name: 'Nested Check' });

  const res = await request(base, '/api/menu');
  const shown = res.data.sections.find((s) => s.id === section.id);
  assert.ok(shown.dishes.every((d) => d.section_id === section.id));
  assert.ok(shown.dishes.some((d) => d.id === dish.id));
});
