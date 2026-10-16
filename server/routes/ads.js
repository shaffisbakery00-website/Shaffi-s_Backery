'use strict';

const router = require('express').Router();
const { supabase } = require('../db');
const { serializeAd } = require('../util');

// GET /api/ads — public, active ads newest first.
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('ads')
    .select('id, image_path, is_active, created_at')
    .eq('is_active', true)
    .order('created_at', { ascending: false });
  if (error) return res.status(503).json({ error: 'Offers are temporarily unavailable.' });
  res.json(data.map(serializeAd));
});

module.exports = router;
