'use strict';

const router = require('express').Router();
const { supabase } = require('../db');
const images = require('../images');
const validate = require('../validate');
const { httpError } = require('./../httpError');
const { serializeDish } = require('../util');

const SELECT =
  'id, section_id, name, description, price, diet, badge, image_path, is_available, created_at, updated_at, section:sections(name)';

function withSectionName(row) {
  const dish = serializeDish(row);
  dish.section_name = row.section ? row.section.name : null;
  return dish;
}

async function ensureSectionExists(sectionId) {
  const { data } = await supabase.from('sections').select('id').eq('id', sectionId).maybeSingle();
  return Boolean(data);
}

// GET /api/admin/dishes — list with optional filters.
router.get('/', async (req, res) => {
  let query = supabase.from('dishes').select(SELECT).order('updated_at', { ascending: false });

  const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
  if (q) query = query.ilike('name', `%${q.replace(/[%_]/g, '')}%`);
  if (validate.isUuid(req.query.section_id)) query = query.eq('section_id', req.query.section_id);
  const availability = validate.toBool(req.query.availability);
  if (availability !== undefined) query = query.eq('is_available', availability);
  const popular = validate.toBool(req.query.popular);
  if (popular !== undefined) query = query.eq('is_popular', popular);

  const { data, error } = await query;
  if (error) throw httpError(502, 'Could not load dishes.');
  res.json(data.map(withSectionName));
});

// POST /api/admin/dishes — create (JSON or multipart with image).
router.post('/', images.parseIfMultipart, async (req, res) => {
  const parsed = validate.dishInput(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', errors: parsed.errors });
  }
  if (!(await ensureSectionExists(parsed.value.section_id))) {
    return res.status(400).json({ error: 'Section not found.', errors: { section_id: 'Section not found.' } });
  }

  const insert = { ...parsed.value };
  const isAvailable = validate.toBool(req.body && req.body.is_available);
  if (isAvailable !== undefined) insert.is_available = isAvailable;

  const image = images.fromRequest(req);
  if (image.buffer) insert.image_path = await images.upload(image.buffer, 'dishes');

  const { data, error } = await supabase.from('dishes').insert(insert).select(SELECT).single();
  if (error) throw httpError(502, 'Could not save the dish. Please try again.');
  res.status(201).json({ dish: withSectionName(data) });
});

// PUT /api/admin/dishes/:id — full update, optional image replace/remove.
router.put('/:id', images.parseIfMultipart, async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Dish not found.');

  const parsed = validate.dishInput(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', errors: parsed.errors });
  }
  if (!(await ensureSectionExists(parsed.value.section_id))) {
    return res.status(400).json({ error: 'Section not found.', errors: { section_id: 'Section not found.' } });
  }

  const { data: existing, error: fetchError } = await supabase
    .from('dishes')
    .select('id, image_path')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchError) throw httpError(502, 'Could not save the dish. Please try again.');
  if (!existing) throw httpError(404, 'Dish not found.');

  const update = { ...parsed.value, updated_at: new Date().toISOString() };
  const isAvailable = validate.toBool(req.body && req.body.is_available);
  if (isAvailable !== undefined) update.is_available = isAvailable;

  const image = images.fromRequest(req);
  let removeOld = null;
  if (image.buffer) {
    update.image_path = await images.upload(image.buffer, 'dishes');
    removeOld = existing.image_path;
  }

  const { data, error } = await supabase
    .from('dishes')
    .update(update)
    .eq('id', req.params.id)
    .select(SELECT)
    .single();
  if (error) throw httpError(502, 'Could not save the dish. Please try again.');

  if (removeOld) await images.remove(removeOld);
  res.json({ dish: withSectionName(data) });
});

// PATCH /api/admin/dishes/:id — quick toggles (is_available / badge).
router.patch('/:id', async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Dish not found.');

  const parsed = validate.toggleInput(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ error: 'Invalid change.', errors: parsed.errors });
  }

  const { data, error } = await supabase
    .from('dishes')
    .update({ ...parsed.value, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select(SELECT)
    .maybeSingle();
  if (error) throw httpError(502, 'Could not update the dish.');
  if (!data) throw httpError(404, 'Dish not found.');

  res.json({ dish: withSectionName(data) });
});

// DELETE /api/admin/dishes/:id
router.delete('/:id', async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Dish not found.');

  const { data: existing } = await supabase
    .from('dishes')
    .select('id, image_path')
    .eq('id', req.params.id)
    .maybeSingle();
  if (!existing) throw httpError(404, 'Dish not found.');

  const { error } = await supabase.from('dishes').delete().eq('id', req.params.id);
  if (error) throw httpError(502, 'Could not delete the dish.');

  await images.remove(existing.image_path);
  res.json({ success: true });
});

module.exports = router;
