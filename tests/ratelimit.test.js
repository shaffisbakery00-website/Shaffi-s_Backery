'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { startServer, request, randomIp, config, supabase } = require('./helpers');

let server;
let base;

before(async () => {
  ({ server, base } = await startServer());
});

after(() => server.close());

test('login is rate limited after 5 failures from the same IP', async () => {
  const ip = randomIp();
  for (let i = 0; i < 5; i += 1) {
    const res = await request(base, '/api/auth/login', {
      method: 'POST',
      body: { password: 'wrong' },
      ip,
    });
    assert.equal(res.status, 401, `attempt ${i + 1} should be 401`);
  }
  const sixth = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { password: 'wrong' },
    ip,
  });
  assert.equal(sixth.status, 429);

  await supabase.from('rate_events').delete().eq('ip', ip);
});

test('a successful login clears the failure window for that IP', async () => {
  const ip = randomIp();
  for (let i = 0; i < 3; i += 1) {
    await request(base, '/api/auth/login', { method: 'POST', body: { password: 'wrong' }, ip });
  }
  const ok = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { password: config.ADMIN_PASSWORD },
    ip,
  });
  assert.equal(ok.status, 200);

  const stillOk = await request(base, '/api/auth/login', {
    method: 'POST',
    body: { password: config.ADMIN_PASSWORD },
    ip,
  });
  assert.equal(stillOk.status, 200);

  await supabase.from('rate_events').delete().eq('ip', ip);
});
