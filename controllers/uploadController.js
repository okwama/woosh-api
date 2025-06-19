const multer = require('multer');
const path = require('path');
const { uploadFile } = require('../lib/uploadService');
require('dotenv').config();

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    console.log('Received file:', {
      fieldname: file.fieldname,
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });
    
    const allowedTypes = ['.jpg', '.jpeg', '.png', '.pdf'];
    const ext = path.extname(file.originalname).toLowerCase();

    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`Invalid file type: ${ext}. Only JPG, JPEG, PNG, and PDF files are allowed.`));
    }
  }
}).fields([
  { name: 'image', maxCount: 1 },
  { name: 'attachment', maxCount: 1 }
]);

// Upload image endpoint
exports.uploadImage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      console.error('Multer error:', err);
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' });
      }
      return res.status(400).json({ error: `Upload error: ${err.message}` });
    } else if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ error: err.message });
    }

    // Check if we have any files
    if (!req.files || (Object.keys(req.files).length === 0 && !req.file)) {
      console.error('No files received. Request details:', {
        body: req.body,
        files: req.files,
        headers: req.headers
      });
      return res.status(400).json({ error: 'No files uploaded. Send files with field name "image" and/or "attachment".' });
    }

    try {
      const results = {};
      
      // Process image if present
      if (req.files.image) {
        const imageFile = req.files.image[0];
        const imageResult = await uploadFile(imageFile, {
          folder: 'whoosh',
          type: 'image',
          generateThumbnail: true
        });
        results.image = imageResult;
      }

      // Process attachment if present
      if (req.files.attachment) {
        const attachmentFile = req.files.attachment[0];
        const attachmentResult = await uploadFile(attachmentFile, {
          folder: 'whoosh',
          type: 'document',
          generateThumbnail: false
        });
        results.attachment = attachmentResult;
      }

      console.log('Files uploaded successfully:', results);

      res.json({ 
        success: true,
        ...results
      });
    } catch (error) {
      console.error('Error uploading to cloud storage:', error);
      res.status(500).json({ 
        error: 'Failed to upload to cloud storage',
        details: error.message
      });
    }
  });
};
