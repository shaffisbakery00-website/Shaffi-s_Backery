'use strict';

const auth = require('../auth');

/**
 * Protects every admin endpoint. Requires a valid, unexpired server-side
 * session and, for mutations, a same-origin request (CSRF defense-in-depth
 * on top of SameSite=Lax cookies).
 */
module.exports = async function requireAdmin(req, res, next) {
  try {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const origin = req.headers.origin;
      if (origin) {
        let originHost;
        try {
          originHost = new URL(origin).host;
        } catch (_) {
          return res.status(403).json({ error: 'Invalid request origin' });
        }
        if (originHost !== req.headers.host) {
          return res.status(403).json({ error: 'Invalid request origin' });
        }
      }
    }

    const session = await auth.getSession(req);
    if (!session) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    req.session = session;
    return next();
  } catch (err) {
    return next(err);
  }
};
