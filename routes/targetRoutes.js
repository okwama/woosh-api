const express = require('express');
const router = express.Router();
const targetController = require('../controllers/targetController');

// Get all targets
router.get('/', targetController.getAllTargets);

// Get a target by ID
router.get('/:id', targetController.getTargetById);

// Create a new target
router.post('/', targetController.createTarget);

// Update a target
router.put('/:id', targetController.updateTarget);

// Delete a target
router.delete('/:id', targetController.deleteTarget);

module.exports = router;
