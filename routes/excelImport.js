const express = require('express');
const router = express.Router();
const multer = require('multer');
const excelImportController = require('../controllers/excelImportController');

// Configure multer for memory storage
const upload = multer({
    storage: multer.memoryStorage(),
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || 
            file.mimetype === 'application/vnd.ms-excel') {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only Excel files are allowed.'), false);
        }
    },
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
});

// Import route
router.post('/import', upload.single('file'), excelImportController.importExcel);

// Delete all clients route
router.delete('/clients', excelImportController.deleteAllClients);

module.exports = router; 