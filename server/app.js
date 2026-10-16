'use strict';

const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');

function createApp() {
  const app = express();

  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader(
      'Content-Security-Policy',
      [
        "default-src 'self'",
        "script-src 'self'",
        "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
        "font-src https://fonts.gstatic.com data:",
        "img-src 'self' data: blob: https://*.supabase.co",
        "connect-src 'self'",
        "frame-ancestors 'none'",
        "base-uri 'self'",
        "form-action 'self'",
      ].join('; ')
    );
    next();
  });

  app.use(express.json({ limit: '1mb' }));
  app.use(cookieParser());

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/health/db', async (req, res) => {
    const { error } = await require('./db').supabase
      .from('sections')
      .select('id', { count: 'exact', head: true });
    if (error) return res.status(503).json({ ok: false });
    res.json({ ok: true });
  });

  app.use('/api', require('./routes/api'));

  app.use(
    express.static(path.join(__dirname, '..', 'public'), {
      extensions: ['html'],
      maxAge: 0,
      setHeaders(res, filePath) {
        if (/\.(css|js)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'no-cache');
        } else if (/\.(svg|png|jpe?g|webp|avif|ico)$/i.test(filePath)) {
          res.setHeader('Cache-Control', 'public, max-age=86400');
        }
      },
    })
  );

  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));

  app.use((req, res) => {
    if (req.path.startsWith('/admin')) {
      return res.sendFile(path.join(__dirname, '..', 'public', 'admin', 'index.html'));
    }
    res.status(404).sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  app.use((err, req, res, next) => {
    if (err && err.status && err.status < 500) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err && (err.name === 'MulterError' || err.type === 'entity.too.large')) {
      const message =
        err.code === 'LIMIT_FILE_SIZE' ? 'Image must be smaller than 3 MB.' : 'Request too large.';
      return res.status(400).json({ error: message });
    }
    console.error('Unhandled error:', err.message);
    if (!res.headersSent) res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}

module.exports = { createApp };
