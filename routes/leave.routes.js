const express = require('express');
const router = express.Router();
const { auth } = require('../middleware/auth');
const { isAdmin } = require('../middleware/isAdmin');
const leaveController = require('../controllers/leave.controller');

// Submit leave application
router.post('/', auth, leaveController.submitLeave);

// Get user's leave applications
router.get('/my-leaves', auth, leaveController.getUserLeaves);

// Get all leave applications (admin only)
router.get('/all', auth, isAdmin, leaveController.getAllLeaves);

// Update leave status (admin only)
router.patch('/:id/status', auth, isAdmin, leaveController.updateLeaveStatus);

module.exports = router; 