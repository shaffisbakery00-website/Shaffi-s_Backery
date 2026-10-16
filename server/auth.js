'use strict';

const crypto = require('crypto');
const config = require('./config');
const { supabase } = require('./db');

const hashToken = (token) =>
  crypto.createHmac('sha256', config.SESSION_SECRET).update(token).digest('hex');

function safeEqual(a, b) {
  const da = crypto.createHash('sha256').update(String(a)).digest();
  const db = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(da, db);
}

exports.verifyPassword = (password) => safeEqual(password, config.ADMIN_PASSWORD);

exports.createSession = async (res) => {
  const token = crypto.randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + config.SESSION_DAYS * 864e5);
  const { error } = await supabase
    .from('sessions')
    .insert({ token_hash: hashToken(token), expires_at: expires.toISOString() });
  if (error) throw error;

  res.cookie(config.SESSION_COOKIE, token, {
    httpOnly: true,
    secure: config.IS_PRODUCTION,
    sameSite: 'lax',
    path: '/',
    expires,
  });
};

exports.getSession = async (req) => {
  const token = req.cookies ? req.cookies[config.SESSION_COOKIE] : null;
  if (!token) return null;

  const { data, error } = await supabase
    .from('sessions')
    .select('id, expires_at')
    .eq('token_hash', hashToken(token))
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();
  if (error || !data) return null;

  // Sliding renewal of last_seen_at (best effort).
  supabase
    .from('sessions')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('id', data.id)
    .then(() => {}, () => {});

  return data;
};

exports.destroySession = async (req, res) => {
  const token = req.cookies ? req.cookies[config.SESSION_COOKIE] : null;
  if (token) {
    await supabase.from('sessions').delete().eq('token_hash', hashToken(token));
  }
  res.clearCookie(config.SESSION_COOKIE, { path: '/' });
};
