'use strict';

const { createApp } = require('../server/app');

// One Express app serves the public menu, the admin dashboard and every API
// route. On Vercel this module is the single serverless entry point; the
// runtime calls the exported app as a Node request listener.
const app = createApp();

module.exports = app;
