'use strict';

const router = require('express').Router();
const auth = require('../auth');
const { rateLimit, resetRateLimit } = require('../ratelimit');

const USERNAME = "Shaffi's Backery";

router.post(
  '/login',
  rateLimit({ action: 'login', limit: 5, windowMs: 15 * 60 * 1000 }),
  async (req, res) => {
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!password || !auth.verifyPassword(password)) {
      return res.status(401).json({ error: 'Incorrect password. Please try again.' });
    }
    await resetRateLimit('login', req.clientIp);
    await auth.createSession(res);
    res.json({ success: true, username: USERNAME });
  }
);

router.post('/logout', async (req, res) => {
  await auth.destroySession(req, res);
  res.json({ success: true });
});

router.get('/session', async (req, res) => {
  const session = await auth.getSession(req);
  res.json({ authenticated: Boolean(session), username: USERNAME });
});

module.exports = router;
