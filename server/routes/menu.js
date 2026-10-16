'use strict';

const router = require('express').Router();
const { supabase } = require('../db');
const { serializeDish } = require('../util');

// GET /api/menu — public, read-only. Only sections that contain dishes.
router.get('/', async (req, res) => {
  const [sectionsResult, dishesResult] = await Promise.all([
    supabase
      .from('sections')
      .select('id, name, display_order')
      .order('display_order', { ascending: true })
      .order('created_at', { ascending: true }),
    supabase
      .from('dishes')
      .select(
        'id, section_id, name, description, price, diet, image_path, is_popular, is_available, created_at, updated_at'
      )
      .order('created_at', { ascending: true }),
  ]);

  if (sectionsResult.error || dishesResult.error) {
    return res.status(503).json({ error: 'Menu is temporarily unavailable. Please try again.' });
  }

  const bySection = new Map();
  for (const row of dishesResult.data) {
    if (!bySection.has(row.section_id)) bySection.set(row.section_id, []);
    bySection.get(row.section_id).push(serializeDish(row));
  }

  const sections = sectionsResult.data
    .map((section) => ({
      id: section.id,
      name: section.name,
      display_order: section.display_order,
      dishes: bySection.get(section.id) || [],
    }))
    .filter((section) => section.dishes.length > 0);

  res.json({ sections, generated_at: new Date().toISOString() });
});

module.exports = router;
