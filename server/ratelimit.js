'use strict';

const { supabase } = require('./db');

function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket && req.socket.remoteAddress ? req.socket.remoteAddress : 'unknown';
}

/**
 * Fixed-window limiter backed by Postgres so it works across serverless
 * instances. Records the attempt and rejects with 429 when over the limit.
 */
function rateLimit({ action, limit, windowMs }) {
  return async (req, res, next) => {
    const ip = clientIp(req);
    req.clientIp = ip;
    try {
      const { data, error } = await supabase.rpc('fn_record_rate_event', {
        p_action: action,
        p_ip: ip,
        p_limit: limit,
        p_window_ms: windowMs,
      });
      if (error) return next(error);
      if (data === false) {
        return res
          .status(429)
          .json({ error: 'Too many attempts. Please try again later.' });
      }
      return next();
    } catch (err) {
      return next(err);
    }
  };
}

async function resetRateLimit(action, ip) {
  try {
    await supabase.from('rate_events').delete().eq('action', action).eq('ip', ip);
  } catch (_) {
    /* best effort */
  }
}

module.exports = { rateLimit, resetRateLimit, clientIp };
