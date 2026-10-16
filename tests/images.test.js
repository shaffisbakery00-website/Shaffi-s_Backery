'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, login, request, createSection, cleanupSection, supabase, multipart, PNG_1x1, JPEG_TINY } = require('./helpers');
const { sniff } = require('../server/images');

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

test('the sniffer recognises supported formats and rejects junk', () => {
  assert.equal(sniff(PNG_1x1), 'png');
  assert.equal(sniff(JPEG_TINY), 'jpeg');
  assert.equal(sniff(Buffer.from('not an image at all')), null);
});

test('an image larger than 3 MB is rejected', async () => {
  const section = await createSection();
  createdSections.push(section.id);

  const big = Buffer.alloc(3 * 1024 * 1024 + 100);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(big, 0);

  const res = await request(base, '/api/admin/dishes', {
    method: 'POST',
    cookie,
    raw: true,
    body: multipart(
      { name: 'Too Big', price: '1', section_id: section.id },
      { buffer: big, type: 'image/png', name: 'big.png' }
    ),
  });
  assert.equal(res.status, 400);
  assert.match(res.data.error, /smaller than 3 MB/i);
});
