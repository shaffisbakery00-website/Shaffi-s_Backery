'use strict';

const router = require('express').Router();
const { supabase } = require('../db');
const { rateLimit } = require('../ratelimit');
const validate = require('../validate');
const { httpError } = require('../httpError');

// GET /api/reviews — public, newest first.
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, author_name, content, rating, created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return res.status(503).json({ error: 'Reviews are temporarily unavailable.' });
  res.json(data);
});

// POST /api/reviews — visitor-submitted. JSON only + same-origin + honeypot + rate limit.
router.post(
  '/',
  rateLimit({ action: 'review', limit: 3, windowMs: 60 * 60 * 1000 }),
  async (req, res) => {
    if (!req.is('application/json')) {
      return res.status(415).json({ error: 'Unsupported content type.' });
    }
    const origin = req.headers.origin;
    if (origin) {
      let originHost;
      try {
        originHost = new URL(origin).host;
      } catch (_) {
        return res.status(403).json({ error: 'Invalid request origin' });
      }
      if (originHost !== req.headers.host) {
        return res.status(403).json({ error: 'Invalid request origin' });
      }
    }

    // Honeypot: real users never fill this hidden field. Pretend success.
    if (req.body && String(req.body.website || '').trim() !== '') {
      return res.status(201).json({ success: true });
    }

    const parsed = validate.reviewInput(req.body || {});
    if (!parsed.ok) {
      return res.status(400).json({ error: 'Please fix the highlighted fields.', errors: parsed.errors });
    }

    const { data, error } = await supabase
      .from('reviews')
      .insert(parsed.value)
      .select('id, author_name, content, rating, created_at')
      .single();
    if (error) throw httpError(502, 'Could not save your review. Please try again.');

    res.status(201).json({ review: data });
  }
);

module.exports = router;
