const express = require('express');
const router = express.Router();
const { updateOrderBalances, getClientOrderBalances } = require('../controllers/orderBalanceController');

// Update order balances
router.post('/update', updateOrderBalances);

// Get client's order balances
router.get('/client/:clientId', getClientOrderBalances);

module.exports = router; 