const express = require('express');
const { getOffice, createOffice, updateOffice } = require('../controllers/officeController');
const { authenticateToken } = require('../middleware/authMiddleware');

const router = express.Router();

router.use(authenticateToken); // Add authentication middleware to all outlet routes

// ✅ Fix: Remove the extra "/outlets"
router
  .route('/')
  .get(getOffice) // GET /api/offices
  .post(createOffice); // POST /api/offices

router
  .route('/:id')
  .put(updateOffice); // PUT /api/offices/:id


module.exports = router;
