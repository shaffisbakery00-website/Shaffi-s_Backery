'use strict';

const router = require('express').Router();
const { supabase } = require('../db');
const images = require('../images');
const validate = require('../validate');
const { httpError } = require('../httpError');
const { serializeAd, serializeDish } = require('../util');

// GET /api/admin/stats — real aggregates + recently updated dishes.
router.get('/stats', async (req, res) => {
  const [statsResult, recentResult] = await Promise.all([
    supabase.rpc('fn_stats'),
    supabase
      .from('dishes')
      .select(
        'id, section_id, name, description, price, diet, image_path, is_popular, is_available, created_at, updated_at, section:sections(name)'
      )
      .order('updated_at', { ascending: false })
      .limit(5),
  ]);

  if (statsResult.error || recentResult.error) {
    throw httpError(502, 'Could not load dashboard data.');
  }

  const stats = statsResult.data || {};
  res.json({
    sections: Number(stats.sections || 0),
    dishes: Number(stats.dishes || 0),
    available: Number(stats.available || 0),
    popular: Number(stats.popular || 0),
    recent: recentResult.data.map((row) => {
      const dish = serializeDish(row);
      dish.section_name = row.section ? row.section.name : null;
      return dish;
    }),
  });
});

// GET /api/admin/reviews — all reviews, newest first.
router.get('/reviews', async (req, res) => {
  const { data, error } = await supabase
    .from('reviews')
    .select('id, author_name, content, rating, created_at')
    .order('created_at', { ascending: false });
  if (error) throw httpError(502, 'Could not load reviews.');
  res.json(data);
});

// DELETE /api/admin/reviews/:id
router.delete('/reviews/:id', async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Review not found.');

  const { data, error } = await supabase
    .from('reviews')
    .delete()
    .eq('id', req.params.id)
    .select('id')
    .maybeSingle();
  if (error) throw httpError(502, 'Could not delete the review.');
  if (!data) throw httpError(404, 'Review not found.');

  res.json({ success: true });
});

// GET /api/admin/ads — all ads including inactive.
router.get('/ads', async (req, res) => {
  const { data, error } = await supabase
    .from('ads')
    .select('id, image_path, is_active, created_at')
    .order('created_at', { ascending: false });
  if (error) throw httpError(502, 'Could not load ads.');
  res.json(data.map(serializeAd));
});

// POST /api/admin/ads — upload a new ad image (multipart, image required).
router.post('/ads', images.uploadMiddleware, async (req, res) => {
  const image = images.fromRequest(req);
  if (!image.buffer) {
    return res.status(400).json({ error: 'Please choose an image to upload.' });
  }
  const image_path = await images.upload(image.buffer, 'ads');

  const { data, error } = await supabase
    .from('ads')
    .insert({ image_path, is_active: true })
    .select('id, image_path, is_active, created_at')
    .single();
  if (error) {
    await images.remove(image_path);
    throw httpError(502, 'Could not save the ad.');
  }

  res.status(201).json({ ad: serializeAd(data) });
});

// PATCH /api/admin/ads/:id — activate/deactivate.
router.patch('/ads/:id', async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Ad not found.');

  const isActive = validate.toBool(req.body && req.body.is_active);
  if (isActive === undefined) {
    return res.status(400).json({ error: 'Invalid change.', errors: { is_active: 'Must be true or false.' } });
  }

  const { data, error } = await supabase
    .from('ads')
    .update({ is_active: isActive })
    .eq('id', req.params.id)
    .select('id, image_path, is_active, created_at')
    .maybeSingle();
  if (error) throw httpError(502, 'Could not update the ad.');
  if (!data) throw httpError(404, 'Ad not found.');

  res.json({ ad: serializeAd(data) });
});

// DELETE /api/admin/ads/:id
router.delete('/ads/:id', async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Ad not found.');

  const { data, error } = await supabase
    .from('ads')
    .delete()
    .eq('id', req.params.id)
    .select('id, image_path')
    .maybeSingle();
  if (error) throw httpError(502, 'Could not delete the ad.');
  if (!data) throw httpError(404, 'Ad not found.');

  await images.remove(data.image_path);
  res.json({ success: true });
});

module.exports = router;
