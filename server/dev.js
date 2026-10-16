'use strict';

const { createApp } = require('./app');
const { PORT } = require('./config');

createApp().listen(PORT, () => {
  console.log(`Shaffi's Bakery listening on http://localhost:${PORT}`);
});
