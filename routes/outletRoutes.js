const express = require('express');
const { getOutlets, createOutlet, updateOutlet, getOutletProducts, getOutletLocation, addClientPayment, getClientPayments } = require('../controllers/outletController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticateToken); // Add authentication middleware to all outlet routes

// ✅ Fix: Remove the extra "/outlets"
router
  .route('/')
  .get(getOutlets) // GET /api/outlets
  .post(createOutlet); // POST /api/outlets

router
  .route('/:id')
  .get(getOutletLocation) // GET /api/outlets/:id
  .put(updateOutlet); // PUT /api/outlets/:id

router
  .route('/:id/products')
  .get(getOutletProducts); // GET /api/outlets/:id/products

router
  .route('/:id/payments')
  .post(addClientPayment) // POST /api/outlets/:id/payments
  .get(getClientPayments); // GET /api/outlets/:id/payments

module.exports = router;
