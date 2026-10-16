'use strict';

const { createApp } = require('../server/app');
const { supabase } = require('../server/db');
const config = require('../server/config');

async function startServer() {
  const server = createApp().listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { server, base };
}

function randomIp() {
  const n = () => Math.floor(Math.random() * 255);
  return `10.${n()}.${n()}.${n()}`;
}

async function login(base, ip = randomIp()) {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
    body: JSON.stringify({ password: config.ADMIN_PASSWORD }),
  });
  const setCookie = res.headers.get('set-cookie') || '';
  return { status: res.status, cookie: setCookie.split(';')[0], ip };
}

async function request(base, path, options = {}) {
  const { method = 'GET', body, cookie, ip, headers = {}, raw = false } = options;
  const finalHeaders = { ...headers };
  if (body !== undefined && !raw) finalHeaders['Content-Type'] = 'application/json';
  if (cookie) finalHeaders.cookie = cookie;
  if (ip) finalHeaders['X-Forwarded-For'] = ip;

  const res = await fetch(base + path, {
    method,
    headers: finalHeaders,
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });

  const text = await res.text();
  let data = text;
  try {
    data = text ? JSON.parse(text) : null;
  } catch (_) {
    /* keep raw text */
  }
  return { status: res.status, data, headers: res.headers };
}

async function createSection(name = `Test Section ${Date.now()}`) {
  const { data, error } = await supabase
    .from('sections')
    .insert({ name, display_order: 999 })
    .select('id, name')
    .single();
  if (error) throw error;
  return data;
}

async function cleanupSection(id) {
  if (!id) return;
  await supabase.from('sections').delete().eq('id', id);
}

// A valid 1x1 PNG.
const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

// A minimal valid JPEG (SOI + APP0 + EOI).
const JPEG_TINY = Buffer.from(
  '/9j/4AAQSkZJRgABAQEAYABgAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q==',
  'base64'
);

function multipart(fields, file) {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) {
    if (value !== undefined && value !== null) fd.append(key, String(value));
  }
  if (file) fd.append('image', new Blob([file.buffer], { type: file.type }), file.name || 'image.bin');
  return fd;
}

async function publicUrlReachable(url) {
  const res = await fetch(url);
  return res.status;
}

module.exports = {
  startServer,
  login,
  request,
  randomIp,
  createSection,
  cleanupSection,
  supabase,
  config,
  PNG_1x1,
  JPEG_TINY,
  multipart,
  publicUrlReachable,
};
