'use strict';

const required = ['ADMIN_PASSWORD', 'SESSION_SECRET', 'SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
for (const key of required) {
  if (!process.env[key]) throw new Error(`Missing required environment variable: ${key}`);
}

module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD,
  SESSION_SECRET: process.env.SESSION_SECRET,
  SUPABASE_URL: process.env.SUPABASE_URL.replace(/\/$/, ''),
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
  IS_PRODUCTION: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
  SESSION_COOKIE: 'sb_admin',
  SESSION_DAYS: 7,
  BUCKET: 'menu-images',
};
