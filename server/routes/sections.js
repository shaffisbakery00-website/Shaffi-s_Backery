'use strict';

const router = require('express').Router();
const { supabase } = require('../db');
const validate = require('../validate');
const { httpError } = require('../httpError');

async function nameTaken(name, exceptId) {
  let query = supabase.from('sections').select('id').ilike('name', name);
  const { data, error } = await query;
  if (error) return false;
  return data.some((row) => row.id !== exceptId);
}

// GET /api/admin/sections — with dish counts.
router.get('/', async (req, res) => {
  const { data, error } = await supabase
    .from('sections')
    .select('id, name, display_order, created_at, updated_at, dishes(count)')
    .order('display_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw httpError(502, 'Could not load sections.');

  res.json(
    data.map((s) => ({
      id: s.id,
      name: s.name,
      display_order: s.display_order,
      created_at: s.created_at,
      updated_at: s.updated_at,
      dish_count: Array.isArray(s.dishes) && s.dishes[0] ? Number(s.dishes[0].count) : 0,
    }))
  );
});

// POST /api/admin/sections — create at the end of the order.
router.post('/', async (req, res) => {
  const parsed = validate.sectionInput(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', errors: parsed.errors });
  }
  if (await nameTaken(parsed.value.name)) {
    return res.status(400).json({ error: 'A section with that name already exists.', errors: { name: 'Name already used.' } });
  }

  const { data: last } = await supabase
    .from('sections')
    .select('display_order')
    .order('display_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const display_order = last ? Number(last.display_order) + 1 : 1;

  const { data, error } = await supabase
    .from('sections')
    .insert({ name: parsed.value.name, display_order })
    .select('id, name, display_order, created_at, updated_at')
    .single();
  if (error) throw httpError(502, 'Could not create the section.');

  res.status(201).json({ section: { ...data, dish_count: 0 } });
});

// PUT /api/admin/sections/:id — rename.
router.put('/:id', async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Section not found.');

  const parsed = validate.sectionInput(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ error: 'Please fix the highlighted fields.', errors: parsed.errors });
  }
  if (await nameTaken(parsed.value.name, req.params.id)) {
    return res.status(400).json({ error: 'A section with that name already exists.', errors: { name: 'Name already used.' } });
  }

  const { data, error } = await supabase
    .from('sections')
    .update({ name: parsed.value.name, updated_at: new Date().toISOString() })
    .eq('id', req.params.id)
    .select('id, name, display_order, created_at, updated_at')
    .maybeSingle();
  if (error) throw httpError(502, 'Could not rename the section.');
  if (!data) throw httpError(404, 'Section not found.');

  res.json({ section: data });
});

// POST /api/admin/sections/:id/move — reorder up/down.
router.post('/:id/move', async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Section not found.');

  const parsed = validate.directionInput(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ error: 'Invalid direction.', errors: parsed.errors });
  }

  const { error } = await supabase.rpc('fn_move_section', {
    p_id: req.params.id,
    p_direction: parsed.value.direction,
  });
  if (error) throw httpError(404, 'Section not found.');

  res.json({ success: true });
});

// POST /api/admin/sections/reassign — move all dishes, then delete the source section.
router.post('/reassign', async (req, res) => {
  const parsed = validate.reassignInput(req.body || {});
  if (!parsed.ok) {
    return res.status(400).json({ error: 'Invalid request.', errors: parsed.errors });
  }

  const { data, error } = await supabase.rpc('fn_reassign_and_delete_section', {
    p_from: parsed.value.from_section_id,
    p_to: parsed.value.to_section_id,
  });
  if (error) throw httpError(400, 'Could not move the dishes. Please check the sections and try again.');

  res.json({ success: true, moved: data });
});

// DELETE /api/admin/sections/:id — only when empty.
router.delete('/:id', async (req, res) => {
  if (!validate.isUuid(req.params.id)) throw httpError(404, 'Section not found.');

  const { data: section, error: fetchError } = await supabase
    .from('sections')
    .select('id, name, dishes(count)')
    .eq('id', req.params.id)
    .maybeSingle();
  if (fetchError) throw httpError(502, 'Could not delete the section.');
  if (!section) throw httpError(404, 'Section not found.');

  const dishCount = Array.isArray(section.dishes) && section.dishes[0] ? Number(section.dishes[0].count) : 0;
  if (dishCount > 0) {
    return res.status(409).json({
      error: `This section contains ${dishCount} dish${dishCount === 1 ? '' : 'es'}. Move them to another section before deleting it.`,
      code: 'SECTION_NOT_EMPTY',
      dish_count: dishCount,
    });
  }

  const { error } = await supabase.from('sections').delete().eq('id', req.params.id);
  if (error) throw httpError(502, 'Could not delete the section.');
  res.json({ success: true });
});

module.exports = router;
