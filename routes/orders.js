const express = require('express');
const router = express.Router();
const { createOrder, getOrders, updateOrder, deleteOrder } = require('../controllers/orderController');
const auth = require('../middleware/auth');

// Protect all routes
router.use(auth);

// Explicitly define routes with proper error handling
router.post('/', createOrder);
router.get('/', getOrders);
router.put('/:id', updateOrder);
router.delete('/:id', (req, res, next) => {
  console.log(`Processing DELETE request for order ${req.params.id}`);
  deleteOrder(req, res).catch(next);
});

module.exports = router;
