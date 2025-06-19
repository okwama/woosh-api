const sharp = require('sharp');
const { uploadToCloudinary } = require('./cloudinary');
const NodeCache = require('node-cache');
const { PromisePool } = require('@supercharge/promise-pool');

// Cache for recently uploaded files (30 minutes TTL)
const uploadCache = new NodeCache({ stdTTL: 1800 });

// Compression settings for different image types
const compressionSettings = {
  jpeg: { quality: 80 },
  png: { compressionLevel: 8 },
  webp: { quality: 80 }
};

// Maximum dimensions for different types of images
const maxDimensions = {
  profile: { width: 500, height: 500 },
  product: { width: 1200, height: 1200 },
  document: { width: 2400, height: 2400 },
  thumbnail: { width: 200, height: 200 }
};

/**
 * Optimize image buffer based on type and size
 */
async function optimizeImage(buffer, mimetype, type = 'document') {
  if (!mimetype.startsWith('image/')) {
    return buffer;
  }

  try {
    const dimensions = maxDimensions[type] || maxDimensions.document;
    let optimizer = sharp(buffer)
      .resize(dimensions.width, dimensions.height, {
        fit: 'inside',
        withoutEnlargement: true
      });

    // Apply format-specific optimizations
    if (mimetype === 'image/jpeg') {
      optimizer = optimizer.jpeg(compressionSettings.jpeg);
    } else if (mimetype === 'image/png') {
      optimizer = optimizer.png(compressionSettings.png);
    } else if (mimetype === 'image/webp') {
      optimizer = optimizer.webp(compressionSettings.webp);
    }

    const optimized = await optimizer.toBuffer();
    console.log(`Image optimized: ${buffer.length} -> ${optimized.length} bytes`);
    return optimized;
  } catch (error) {
    console.error('Image optimization error:', error);
    return buffer;
  }
}

/**
 * Upload multiple files in parallel with optimization
 */
async function uploadFiles(files, options = {}) {
  const results = {
    successful: [],
    failed: []
  };

  const { results: uploadResults } = await PromisePool
    .for(files)
    .withConcurrency(3) // Process 3 files at a time
    .process(async (file) => {
      try {
        const result = await uploadFile(file, options);
        results.successful.push(result);
      } catch (error) {
        results.failed.push({
          file: file.originalname,
          error: error.message
        });
      }
    });

  return results;
}

/**
 * Upload a single file with optimization and caching
 */
async function uploadFile(file, options = {}) {
  const {
    folder = 'whoosh',
    type = 'document',
    useCache = true,
    generateThumbnail = false
  } = options;

  // Check cache first
  const cacheKey = `${file.buffer.toString('base64').slice(0, 100)}-${folder}-${type}`;
  if (useCache) {
    const cached = uploadCache.get(cacheKey);
    if (cached) {
      console.log('Using cached upload result');
      return cached;
    }
  }

  // Optimize the main image
  const optimizedBuffer = await optimizeImage(file.buffer, file.mimetype, type);
  
  // Upload main image
  const mainUpload = uploadToCloudinary(optimizedBuffer, {
    folder,
    resource_type: 'auto',
    mimetype: file.mimetype,
    public_id: `${Date.now()}-${type}`
  });

  // Generate and upload thumbnail if requested
  const thumbnailUpload = generateThumbnail
    ? optimizeImage(file.buffer, file.mimetype, 'thumbnail')
        .then(thumbBuffer => 
          uploadToCloudinary(thumbBuffer, {
            folder: `${folder}/thumbnails`,
            resource_type: 'image',
            mimetype: file.mimetype,
            public_id: `${Date.now()}-${type}-thumb`
          })
        )
    : Promise.resolve(null);

  // Wait for all uploads to complete
  const [main, thumbnail] = await Promise.all([mainUpload, thumbnailUpload]);
  
  const result = {
    main,
    thumbnail: thumbnail || undefined
  };

  // Cache the result
  if (useCache) {
    uploadCache.set(cacheKey, result);
  }

  return result;
}

module.exports = {
  uploadFile,
  uploadFiles,
  optimizeImage
}; 