const express = require('express');
const router = express.Router();
const { updateProductReturn } = require('../controllers/productReturnController');
const { createProductReturn } = require('../controllers/productReturnController');
router.put('/:id', updateProductReturn);
router.post('/', createProductReturn);

module.exports = router;
