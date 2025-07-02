const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/authMiddleware');
const { uploadImage } = require('../controllers/uploadController');
const { auth } = require('../middleware/authMiddleware');
const { anyUser } = require('../middleware/roleAuth');
const ImageKit = require('imagekit');
const path = require('path');

// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

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
router.post('/test-imagekit', auth, anyUser, uploadImage);

module.exports = router; 