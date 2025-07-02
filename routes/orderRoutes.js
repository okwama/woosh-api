const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const {  createOrder, getOrders, updateOrder, getUserSalesSummary } = require('../controllers/orderController');

const router = express.Router();

router.use(authenticateToken);

router.post('/', createOrder);
router.get('/', getOrders);
router.put('/:id', updateOrder);
router.get('/sales-summary', getUserSalesSummary);

module.exports = router;