const express = require('express');
const router = express.Router();
const taskController = require('../controllers/taskController');
const { authenticateToken } = require('../middleware/authMiddleware');

// Apply authentication middleware to all routes
router.use(authenticateToken);

// Get all tasks for a sales rep
router.get('/salesrep/:salesRepId', taskController.getTasks);

// Get task history for a sales rep
router.get('/salesrep/:salesRepId/history', taskController.getTaskHistory);

// Create a new task
router.post('/', taskController.createTask);

// Complete a task
router.post('/:taskId/complete', taskController.completeTask);

// Update task status
router.patch('/:taskId/status', taskController.updateTaskStatus);

// Delete a task
router.delete('/:taskId', taskController.deleteTask);

module.exports = router; 