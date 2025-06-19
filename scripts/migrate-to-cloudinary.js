require('dotenv').config();
const ImageKit = require('imagekit');
const { cloudinary, uploadToCloudinary } = require('../lib/cloudinary');
const prisma = require('../lib/prisma');
const axios = require('axios');
const path = require('path');
const ProgressBar = require('progress');
const { PromisePool } = require('@supercharge/promise-pool');

// Configure ImageKit
const imagekit = new ImageKit({
  publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
  urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT
});

// Helper function to download file from URL
async function downloadFile(url) {
  try {
    const response = await axios.get(url, { responseType: 'arraybuffer' });
    return Buffer.from(response.data, 'binary');
  } catch (error) {
    console.error(`Error downloading file from ${url}:`, error.message);
    throw error;
  }
}

// Helper function to get mime type from URL
function getMimeType(url) {
  const ext = path.extname(url).toLowerCase();
  switch (ext) {
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.png':
      return 'image/png';
    case '.pdf':
      return 'application/pdf';
    default:
      return 'application/octet-stream';
  }
}

// Helper function to determine resource type
function getResourceType(mimeType) {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType === 'application/pdf') return 'raw';
  return 'auto';
}

// Helper function to update database references
async function updateDatabaseReferences(oldUrl, newUrl) {
  try {
    // Update profile photos
    await prisma.salesRep.updateMany({
      where: { photoUrl: oldUrl },
      data: { photoUrl: newUrl }
    });

    // Update product images
    await prisma.product.updateMany({
      where: { image: oldUrl },
      data: { image: newUrl }
    });

    // Update leave documents
    await prisma.leaveApplication.updateMany({
      where: { attachmentUrl: oldUrl },
      data: { attachmentUrl: newUrl }
    });

    // Update order attachments
    await prisma.order.updateMany({
      where: { imageUrl: oldUrl },
      data: { imageUrl: newUrl }
    });

  } catch (error) {
    console.error('Error updating database references:', error);
    throw error;
  }
}

// Main migration function
async function migrateFiles() {
  try {
    console.log('Starting migration from ImageKit to Cloudinary...');

    // Get all files from ImageKit
    const files = await imagekit.listFiles({
      limit: 1000 // Adjust based on your needs
    });

    console.log(`Found ${files.length} files to migrate.`);

    // Create progress bar
    const bar = new ProgressBar('Migrating [:bar] :current/:total :percent :etas', {
      total: files.length,
      width: 40,
      complete: '=',
      incomplete: ' '
    });

    // Track migration results
    const results = {
      success: 0,
      failed: 0,
      errors: []
    };

    // Process files in parallel with rate limiting
    const { results: migrationResults } = await PromisePool
      .for(files)
      .withConcurrency(5)
      .process(async (file) => {
        try {
          // Download file from ImageKit
          const buffer = await downloadFile(file.url);
          const mimeType = getMimeType(file.name);
          
          // Upload to Cloudinary
          const result = await uploadToCloudinary(buffer, {
            folder: file.filePath || 'whoosh/migrated',
            resource_type: getResourceType(mimeType),
            mimetype: mimeType,
            public_id: path.parse(file.name).name
          });

          // Update database references if needed
          await updateDatabaseReferences(file.url, result.url);

          results.success++;
        } catch (error) {
          results.failed++;
          results.errors.push({
            file: file.name,
            error: error.message
          });
        }

        bar.tick();
      });

    // Print final results
    console.log('\nMigration completed!');
    console.log(`Successfully migrated: ${results.success} files`);
    console.log(`Failed to migrate: ${results.failed} files`);
    
    if (results.errors.length > 0) {
      console.log('\nErrors encountered:');
      results.errors.forEach(({ file, error }) => {
        console.log(`- ${file}: ${error}`);
      });
    }

  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

// Run migration
if (require.main === module) {
  migrateFiles()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Migration failed:', error);
      process.exit(1);
    });
} 