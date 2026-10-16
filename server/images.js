'use strict';

const crypto = require('crypto');
const multer = require('multer');
const config = require('./config');
const { httpError } = require('./httpError');
const { supabase, BUCKET } = require('./db');

const MAX_BYTES = 3 * 1024 * 1024;

const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', avif: 'avif' };
const MIME = { jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', avif: 'image/avif' };

/** Identify an image by its magic bytes (never trust the client-supplied type). */
function sniff(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (buf.subarray(0, 8).equals(png)) return 'png';
  if (buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WEBP') {
    return 'webp';
  }
  if (buf.subarray(4, 8).toString('ascii') === 'ftyp') {
    const brand = buf.subarray(8, 12).toString('ascii');
    if (brand === 'avif' || brand === 'avis') return 'avif';
  }
  return null;
}

/** Upload a validated image buffer and return its storage object path. */
async function upload(buffer, folder) {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw httpError(400, 'Please choose an image file.');
  }
  if (buffer.length > MAX_BYTES) {
    throw httpError(400, 'Image must be smaller than 3 MB.');
  }
  const kind = sniff(buffer);
  if (!kind) {
    throw httpError(400, 'Unsupported image type. Use JPEG, PNG, WebP, or AVIF.');
  }
  const objectPath = `${folder}/${crypto.randomUUID()}_${Date.now()}.${EXT[kind]}`;
  const { error } = await supabase.storage.from(BUCKET).upload(objectPath, buffer, {
    contentType: MIME[kind],
    upsert: false,
    cacheControl: '31536000',
  });
  if (error) throw httpError(502, 'Could not store the image. Please try again.');
  return objectPath;
}

async function remove(objectPath) {
  if (!objectPath) return;
  try {
    await supabase.storage.from(BUCKET).remove([objectPath]);
  } catch (_) {
    /* best effort cleanup */
  }
}

function publicUrl(objectPath) {
  if (!objectPath) return null;
  return `${config.SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${objectPath}`;
}

const uploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
}).single('image');

/** Normalise the multipart result into { buffer }. */
function fromRequest(req) {
  return {
    buffer: req.file ? req.file.buffer : null,
  };
}

/** Parse multipart bodies only when present, so JSON requests still work. */
function parseIfMultipart(req, res, next) {
  if (req.is('multipart/form-data')) return uploadMiddleware(req, res, next);
  return next();
}

module.exports = {
  MAX_BYTES,
  sniff,
  upload,
  remove,
  publicUrl,
  uploadMiddleware,
  fromRequest,
  parseIfMultipart,
};
