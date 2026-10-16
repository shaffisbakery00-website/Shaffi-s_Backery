'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, login, request, randomIp, supabase } = require('./helpers');

let server;
let base;
let cookie;
const author = `Tester ${Date.now()}`;

before(async () => {
  ({ server, base } = await startServer());
  ({ cookie } = await login(base));
});

after(async () => {
  await supabase.from('reviews').delete().like('author_name', 'Tester %');
  await supabase.from('reviews').delete().eq('author_name', 'Spam Bot');
  await supabase.from('reviews').delete().eq('author_name', 'Admin Removable');
  server.close();
});

test('a visitor can submit a review and it appears in the public list', async () => {
  const res = await request(base, '/api/reviews', {
    method: 'POST',
    ip: randomIp(),
    body: { author_name: author, content: 'The chocolate cake was divine!', rating: 5 },
  });
  assert.equal(res.status, 201);
  assert.equal(res.data.review.rating, 5);

  const list = await request(base, '/api/reviews');
  assert.ok(list.data.some((r) => r.id === res.data.review.id));
});

test('invalid review input is rejected with field errors', async () => {
  const cases = [
    { author_name: '', content: 'good enough text', rating: 5 },
    { author_name: 'Ok Name', content: 'no', rating: 5 },
    { author_name: 'Ok Name', content: 'good enough text', rating: 9 },
    { author_name: 'Ok Name', content: 'good enough text', rating: 0 },
    { author_name: 'Ok Name', content: 'good enough text' },
  ];
  for (const body of cases) {
    const res = await request(base, '/api/reviews', { method: 'POST', ip: randomIp(), body });
    assert.equal(res.status, 400, JSON.stringify(body));
    assert.ok(res.data.errors);
  }
});

test('the honeypot silently discards bot submissions', async () => {
  const res = await request(base, '/api/reviews', {
    method: 'POST',
    ip: randomIp(),
    body: { author_name: 'Spam Bot', content: 'buy cheap things now', rating: 5, website: 'http://spam.example' },
  });
  assert.equal(res.status, 201);

  const { count } = await supabase
    .from('reviews')
    .select('id', { count: 'exact', head: true })
    .eq('author_name', 'Spam Bot');
  assert.equal(count, 0);
});

test('a non-JSON content type is rejected with 415', async () => {
  const res = await request(base, '/api/reviews', {
    method: 'POST',
    ip: randomIp(),
    raw: true,
    headers: { 'Content-Type': 'text/plain' },
    body: 'author_name=x',
  });
  assert.equal(res.status, 415);
});

test('a cross-origin submission is rejected with 403', async () => {
  const res = await request(base, '/api/reviews', {
    method: 'POST',
    ip: randomIp(),
    headers: { Origin: 'https://evil.example.com' },
    body: { author_name: 'Ok Name', content: 'good enough text', rating: 4 },
  });
  assert.equal(res.status, 403);
});

test('an admin can delete a review', async () => {
  const created = await request(base, '/api/reviews', {
    method: 'POST',
    ip: randomIp(),
    body: { author_name: 'Admin Removable', content: 'Please remove me later.', rating: 3 },
  });
  assert.equal(created.status, 201);

  const list = await request(base, '/api/admin/reviews', { cookie });
  assert.ok(list.data.some((r) => r.id === created.data.review.id));

  const del = await request(base, `/api/admin/reviews/${created.data.review.id}`, { method: 'DELETE', cookie });
  assert.equal(del.status, 200);

  const after = await request(base, '/api/reviews');
  assert.ok(!after.data.some((r) => r.id === created.data.review.id));
});
