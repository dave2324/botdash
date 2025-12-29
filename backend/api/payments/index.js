const express = require('express');
const router = express.Router();

// Import sub-routers
const chapaRouter = require('./chapa');

// Mount chapa router at root level to handle all payment endpoints
// This includes /premium/*, /deposits/*, and webhook endpoints
router.use('/', chapaRouter);

module.exports = router;
