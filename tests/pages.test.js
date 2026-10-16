'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, request } = require('./helpers');

let server;
let base;

before(async () => {
  ({ server, base } = await startServer());
});

after(() => server.close());

test('the customer page is served with the expected CSP and no inline scripts', async () => {
  const res = await request(base, '/', { raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);

  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /script-src 'self'/);
  assert.match(csp, /default-src 'self'/);

  assert.match(res.data, /Shaffi's Backery/);
  assert.match(res.data, /src="\/js\/customer\.js"/);

  const scripts = res.data.match(/<script\b[^>]*>/gi) || [];
  assert.ok(scripts.length > 0, 'page should reference its script');
  for (const tag of scripts) {
    assert.match(tag, /\bsrc=/, `every <script> must use src, found: ${tag}`);
  }
});

test('the admin page is served and loads its own bundle', async () => {
  const res = await request(base, '/admin', { raw: true });
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type') || '', /text\/html/);
  assert.match(res.data, /Admin access/);
  assert.match(res.data, /src="\/js\/admin\.js"/);

  const scripts = res.data.match(/<script\b[^>]*>/gi) || [];
  for (const tag of scripts) {
    assert.match(tag, /\bsrc=/, `every <script> must use src, found: ${tag}`);
  }
});

test('a deep admin URL falls back to the admin shell', async () => {
  const res = await request(base, '/admin/some/deep/link', { raw: true });
  assert.equal(res.status, 200);
  assert.match(res.data, /Admin access/);
});

test('static assets are served', async () => {
  const paths = [
    '/js/customer.js',
    '/js/admin.js',
    '/css/tokens.css',
    '/css/customer.css',
    '/css/admin.css',
    '/images/favicon.svg',
  ];
  for (const path of paths) {
    const res = await request(base, path, { raw: true });
    assert.equal(res.status, 200, `${path} should be served`);
  }
});

test('unknown API routes return JSON 404', async () => {
  const res = await request(base, '/api/does-not-exist');
  assert.equal(res.status, 404);
  assert.deepEqual(res.data, { error: 'Not found' });
});

test('health endpoints respond', async () => {
  const plain = await request(base, '/api/health');
  assert.equal(plain.status, 200);
  assert.deepEqual(plain.data, { ok: true });

  const db = await request(base, '/api/health/db');
  assert.equal(db.status, 200);
  assert.deepEqual(db.data, { ok: true });
});
