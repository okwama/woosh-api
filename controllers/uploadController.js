const multer = require('multer');
const path = require('path');
const ImageKit = require('imagekit');
const sharp = require('sharp');
require('dotenv').config(); // Ensure environment variables are loaded

// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Debug ImageKit configuration
console.log('ImageKit Configuration:');
console.log('URL Endpoint:', process.env.IMAGEKIT_URL_ENDPOINT);
console.log('Public Key:', process.env.IMAGEKIT_PUBLIC_KEY ? 'Set (starts with: ' + process.env.IMAGEKIT_PUBLIC_KEY.substring(0, 15) + '...)' : 'Not set');
console.log('Private Key:', process.env.IMAGEKIT_PRIVATE_KEY ? 'Set (starts with: ' + process.env.IMAGEKIT_PRIVATE_KEY.substring(0, 15) + '...)' : 'Not set');

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

// Helper function to compress image
const compressImage = async (buffer, mimetype) => {
  // Skip compression for PDFs
  if (mimetype === 'application/pdf') {
    return buffer;
  }

  try {
    const compressed = await sharp(buffer)
      .resize(1200, 1200, { // Max dimensions
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({ quality: 80 }) // Compress to JPEG with 80% quality
      .toBuffer();
    
    console.log('Image compressed successfully');
    return compressed;
  } catch (error) {
    console.error('Compression error:', error);
    return buffer; // Return original buffer if compression fails
  }
};

// Helper function to upload buffer to ImageKit
const uploadToImageKit = async (fileBuffer, fileName, folder) => {
  try {
    console.log('Uploading file to ImageKit:', fileName);
    
    // Upload to ImageKit - using the simple approach that works
    const result = await imagekit.upload({
      file: fileBuffer,
      fileName,
      folder
    });
    
    return result;
  } catch (error) {
    console.error('ImageKit upload error:', error);
    throw error;
  }
};

// Upload image endpoint
exports.uploadImage = async (req, res) => {
  upload(req, res, async (err) => {
    if (err) {
      console.error('Upload error:', err);
      return res.status(400).json({ error: err.message });
    }

    if (!req.file) {
      console.error('No file received in the request');
      return res.status(400).json({ error: 'No file uploaded' });
    }

    console.log('Processing file upload:', req.file.originalname, req.file.mimetype, req.file.size);

    try {
      // Compress image before upload
      const compressedBuffer = await compressImage(req.file.buffer, req.file.mimetype);
      const folder = 'whoosh';
      const uniqueFilename = `${Date.now()}-${Math.round(Math.random() * 1E9)}${path.extname(req.file.originalname)}`;

      const result = await uploadToImageKit(compressedBuffer, uniqueFilename, folder);
      console.log('File uploaded successfully to ImageKit:', result.url);

      res.json({ 
        success: true,
        imageUrl: result.url,
        fileId: result.fileId,
        name: result.name
      });
    } catch (error) {
      console.error('Error uploading to ImageKit:', error);
      res.status(500).json({ 
        error: 'Failed to upload image to cloud storage',
        details: error.message
      });
    }
  });
};
