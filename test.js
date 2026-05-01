/**
 * EmailFlow AI - Isolation Test Server
 * This file contains ZERO dependencies besides Express.
 * Use this to verify that Render can correctly open a port.
 */
console.log('🔥 [TEST] STARTED FILE');

const express = require('express');
const app = express();

const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('TEST SERVER IS WORKING 🚀');
});

app.listen(PORT, '0.0.0.0', () => {
  console.log('✅ [TEST] LISTENING ON PORT:', PORT);
});
