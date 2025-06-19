const express = require('express');
const { authenticateToken } = require('../middleware/authMiddleware');
const { createJourneyPlan, updateJourneyPlan, getJourneyPlans, deleteJourneyPlan } = require('../controllers/journeyPlanController');

const router = express.Router();

// Protect all routes with authentication middleware
router.use(authenticateToken);

// Create a journey plan
router.post('/', createJourneyPlan);

// Update a journey plan
router.put('/:journeyId', updateJourneyPlan);

// Get all journey plans for the authenticated user
router.get('/', getJourneyPlans);

// Delete a journey plan with status 0
router.delete('/:journeyId', deleteJourneyPlan);

module.exports = router;