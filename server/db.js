'use strict';

const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

// Server-side only. The service-role key must never reach the browser.
const supabase = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

module.exports = { supabase, BUCKET: config.BUCKET };
