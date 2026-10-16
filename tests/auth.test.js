'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, login, request, randomIp, config } = require('./helpers');

let server;
let base;

before(async () => {
  ({ server, base } = await startServer());
});

after(() => server.close());

test('login is rejected with the wrong password (generic message, no secret leaked)', async () => {
  const res = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { password: 'definitely-wrong-password' },
    ip: randomIp(),
  });
  assert.equal(res.status, 401);
  assert.match(res.data.error, /incorrect password/i);
  assert.ok(!JSON.stringify(res.data).includes(config.ADMIN_PASSWORD));
});

test('login succeeds with the configured password and sets a hardened cookie', async () => {
  const res = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { password: config.ADMIN_PASSWORD },
    ip: randomIp(),
  });
  assert.equal(res.status, 200);
  const setCookie = res.headers.get('set-cookie') || '';
  assert.match(setCookie, /sb_admin=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Lax/i);
  assert.match(setCookie, /Path=\//i);
});

test('session endpoint reflects authentication state', async () => {
  const anon = await request(base, '/api/auth/session');
  assert.deepEqual(anon.data, { authenticated: false, username: "Shaffi's Backery" });

  const { cookie } = await login(base);
  const authed = await request(base, '/api/auth/session', { cookie });
  assert.deepEqual(authed.data, { authenticated: true, username: "Shaffi's Backery" });
});

test('a forged session cookie is rejected', async () => {
  const res = await request(base, '/api/auth/session', { cookie: 'sb_admin=not-a-real-token' });
  assert.equal(res.data.authenticated, false);
});

test('logout destroys the server-side session', async () => {
  const { cookie } = await login(base);
  const before = await request(base, '/api/auth/session', { cookie });
  assert.equal(before.data.authenticated, true);

  const out = await request(base, '/api/auth/logout', { method: 'POST', cookie });
  assert.equal(out.status, 200);

  const afterLogout = await request(base, '/api/auth/session', { cookie });
  assert.equal(afterLogout.data.authenticated, false);
});

test('every admin mutation endpoint requires a session', async () => {
  const attempts = [
    ['POST', '/api/admin/dishes', { name: 'x', price: 1, section_id: 'a' }],
    ['PUT', '/api/admin/dishes/00000000-0000-0000-0000-000000000000', { name: 'x' }],
    ['PATCH', '/api/admin/dishes/00000000-0000-0000-0000-000000000000', { is_popular: true }],
    ['DELETE', '/api/admin/dishes/00000000-0000-0000-0000-000000000000'],
    ['POST', '/api/admin/sections', { name: 'Hacked' }],
    ['PUT', '/api/admin/sections/00000000-0000-0000-0000-000000000000', { name: 'Hacked' }],
    ['POST', '/api/admin/sections/00000000-0000-0000-0000-000000000000/move', { direction: 'up' }],
    ['DELETE', '/api/admin/sections/00000000-0000-0000-0000-000000000000'],
    ['GET', '/api/admin/stats'],
    ['GET', '/api/admin/dishes'],
    ['DELETE', '/api/admin/reviews/00000000-0000-0000-0000-000000000000'],
    ['POST', '/api/admin/ads'],
    ['DELETE', '/api/admin/ads/00000000-0000-0000-0000-000000000000'],
  ];
  for (const [method, path, body] of attempts) {
    const res = await request(base, path, { method, body });
    assert.equal(res.status, 401, `${method} ${path} should be 401 without a session`);
  }
});

test('cross-origin admin mutation is rejected even with a valid session', async () => {
  const { cookie } = await login(base);
  const res = await request(base, '/api/admin/sections', {
    method: 'POST',
    cookie,
    body: { name: 'Cross origin attempt' },
    headers: { Origin: 'https://evil.example.com' },
  });
  assert.equal(res.status, 403);
});

test('public endpoints need no authentication', async () => {
  for (const path of ['/api/menu', '/api/reviews', '/api/ads']) {
    const res = await request(base, path);
    assert.equal(res.status, 200, `${path} should be public`);
  }
});
