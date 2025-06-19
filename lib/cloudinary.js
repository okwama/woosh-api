const cloudinary = require('cloudinary').v2;

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

// Helper function to upload buffer to Cloudinary
async function uploadToCloudinary(buffer, options = {}) {
  try {
    // Convert buffer to base64
    const base64Data = buffer.toString('base64');
    const dataURI = `data:${options.mimetype || 'image/jpeg'};base64,${base64Data}`;

    // Default options
    const defaultOptions = {
      folder: 'whoosh',
      resource_type: 'auto', // auto-detect whether it's an image, video, or raw file
      use_filename: true,
      unique_filename: true
    };

    // Merge options
    const uploadOptions = { ...defaultOptions, ...options };

    // Upload to Cloudinary
    const result = await cloudinary.uploader.upload(dataURI, uploadOptions);

    return {
      url: result.secure_url,
      fileId: result.public_id,
      name: result.original_filename,
      format: result.format,
      size: result.bytes,
      resource_type: result.resource_type
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw error;
  }
}

// Helper function to delete file from Cloudinary
async function deleteFromCloudinary(publicId, resourceType = 'image') {
  try {
    const result = await cloudinary.uploader.destroy(publicId, { resource_type: resourceType });
    return result;
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw error;
  }
}

module.exports = {
  cloudinary,
  uploadToCloudinary,
  deleteFromCloudinary
}; 