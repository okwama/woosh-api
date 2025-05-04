const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { uploadImage } = require('../controllers/uploadController');
const { auth } = require('../middleware/auth');
const { anyUser } = require('../middleware/roleAuth');
const ImageKit = require('imagekit');
const multer = require('multer');
const path = require('path');
// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${ext}. Only JPG, JPEG, PNG, and PDF files are allowed.`));
    }
  }
}).single('attachment');

// Image upload route - protected
router.post('/upload-image', auth, anyUser, uploadImage);

// Test ImageKit connectivity - GET endpoint
router.get('/test-imagekit', async (req, res) => {
  try {
    // Get authentication parameters
    const authParams = imagekit.getAuthenticationParameters();
    console.log('ImageKit auth parameters:', authParams);
    
    // Test connection by listing a file
    const files = await imagekit.listFiles({
      limit: 1
    });
    
    res.json({ 
      success: true, 
      message: 'ImageKit connection successful', 
      authParams,
      files: files.map(file => ({
        id: file.fileId,
        name: file.name,
        url: file.url
      }))
    });
  } catch (error) {
    console.error('ImageKit connection test error:', error);
    res.status(500).json({ 
      success: false, 
      error: 'ImageKit connection failed', 
      details: error.message 
    });
  }
});

// Test ImageKit file upload - POST endpoint for testing
router.post('/test-imagekit', (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ error: err.message });
    }

    console.log('Request body:', req.body);
    
    // Check if file is present
    if (!req.file) {
      console.error('No file received in the request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('File received:', req.file.originalname, req.file.mimetype, req.file.size);

    try {
      // Upload file to ImageKit
      const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;
      const result = await imagekit.upload({
        file: req.file.buffer,
        fileName: uniqueFilename,
        folder: 'whoosh/test-uploads'
      });

      console.log('Test upload successful:', result.url);

      // Return success response
      return res.json({
        success: true,
        message: 'Test upload successful',
        fileUrl: result.url,
        fileId: result.fileId,
        fileName: result.name,
        requestData: {
          leaveType: req.body.leaveType,
          startDate: req.body.startDate,
          endDate: req.body.endDate,
          reason: req.body.reason
        }
      });
    } catch (error) {
      console.error('Test upload error:', error);
      return res.status(500).json({
        success: false,
        error: 'Upload failed',
        details: error.message
      });
    }
  });
});

module.exports = router; 