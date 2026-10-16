'use strict';

const images = require('./images');
const { httpError } = require('./httpError');

function serializeDish(row) {
  return {
    id: row.id,
    section_id: row.section_id,
    name: row.name,
    description: row.description,
    price: Number(row.price),
    diet: row.diet,
    image_url: images.publicUrl(row.image_path),
    is_popular: row.is_popular,
    is_available: row.is_available,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function serializeAd(row) {
  return {
    id: row.id,
    image_url: images.publicUrl(row.image_path),
    is_active: row.is_active,
    created_at: row.created_at,
  };
}

module.exports = { httpError, serializeDish, serializeAd };
