'use strict';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

function trimmed(value) {
  return typeof value === 'string' ? value.trim() : value;
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

function dishInput(body = {}) {
  const errors = {};

  const name = trimmed(body.name);
  if (typeof name !== 'string' || name.length < 1 || name.length > 80) {
    errors.name = 'Name is required (1–80 characters).';
  }

  let description = trimmed(body.description);
  if (description === undefined || description === null || description === '') {
    description = null;
  } else if (typeof description !== 'string' || description.length > 600) {
    errors.description = 'Description must be 600 characters or fewer.';
  }

  const rawPrice = trimmed(body.price);
  const price = typeof rawPrice === 'string' ? Number(rawPrice) : rawPrice;
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
    errors.price = 'Enter a valid price of 0 or more.';
  } else if (Math.round(price * 100) !== Number((price * 100).toFixed(4))) {
    errors.price = 'Price can have at most 2 decimal places.';
  }

  const section_id = trimmed(body.section_id);
  if (!isUuid(section_id)) {
    errors.section_id = 'Choose a section.';
  }

  let diet = 'veg';
  if (body.diet !== undefined && body.diet !== null && body.diet !== '') {
    diet = trimmed(body.diet);
    if (diet !== 'veg' && diet !== 'non_veg' && diet !== 'none') {
      errors.diet = 'Choose veg, non-veg or none.';
    }
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return {
    ok: true,
    value: {
      name: name.trim(),
      description: description === null ? null : description.trim(),
      price: Math.round(price * 100) / 100,
      section_id,
      diet,
    },
  };
}

function toggleInput(body = {}) {
  const errors = {};
  const value = {};
  for (const key of Object.keys(body)) {
    if (key !== 'is_available' && key !== 'is_popular') {
      errors[key] = 'Unknown field.';
    }
  }
  if ('is_available' in body) {
    const v = toBool(body.is_available);
    if (v === undefined) errors.is_available = 'Must be true or false.';
    else value.is_available = v;
  }
  if ('is_popular' in body) {
    const v = toBool(body.is_popular);
    if (v === undefined) errors.is_popular = 'Must be true or false.';
    else value.is_popular = v;
  }
  if (!Object.keys(value).length && !Object.keys(errors).length) {
    errors.body = 'Provide is_available or is_popular.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value };
}

function sectionInput(body = {}) {
  const errors = {};
  const name = trimmed(body.name);
  if (typeof name !== 'string' || name.length < 1 || name.length > 80) {
    errors.name = 'Section name is required (1–80 characters).';
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { name: name.trim() } };
}

function reviewInput(body = {}) {
  const errors = {};

  const author_name = trimmed(body.author_name);
  if (typeof author_name !== 'string' || author_name.length < 2 || author_name.length > 40) {
    errors.author_name = 'Please enter a name (2–40 characters).';
  }

  const content = trimmed(body.content);
  if (typeof content !== 'string' || content.length < 5 || content.length > 500) {
    errors.content = 'Please write a review between 5 and 500 characters.';
  }

  const rating = typeof body.rating === 'string' ? Number(body.rating) : body.rating;
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    errors.rating = 'Please choose a star rating from 1 to 5.';
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { author_name: author_name.trim(), content: content.trim(), rating } };
}

function directionInput(body = {}) {
  const direction = trimmed(body.direction);
  if (direction !== 'up' && direction !== 'down') {
    return { ok: false, errors: { direction: "Direction must be 'up' or 'down'." } };
  }
  return { ok: true, value: { direction } };
}

function reassignInput(body = {}) {
  const errors = {};
  const from = trimmed(body.from_section_id);
  const to = trimmed(body.to_section_id);
  if (!isUuid(from)) errors.from_section_id = 'Invalid source section.';
  if (!isUuid(to)) errors.to_section_id = 'Choose a section to move the dishes to.';
  if (!errors.from_section_id && !errors.to_section_id && from === to) {
    errors.to_section_id = 'Choose a different section.';
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { from_section_id: from, to_section_id: to } };
}

module.exports = {
  isUuid,
  toBool,
  dishInput,
  toggleInput,
  sectionInput,
  reviewInput,
  directionInput,
  reassignInput,
};
