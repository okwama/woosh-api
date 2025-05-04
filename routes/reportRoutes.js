const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const reportController = require('../controllers/reportController');

router.use(authenticateToken);

router.post('/', reportController.createReport);
router.get('/', reportController.getAllReports);
router.get('/:id', reportController.getReportById);
router.put('/:id', reportController.updateReport);
router.delete('/:id', reportController.deleteReport);

module.exports = router;
