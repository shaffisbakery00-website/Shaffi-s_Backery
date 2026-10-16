'use strict';

const serverless = require('serverless-http');
const { createApp } = require('../server/app');

// One Express app serves the public menu, the admin dashboard and every API
// route. On Vercel this module is the single serverless entry point.
const handler = serverless(createApp());

module.exports = handler;
