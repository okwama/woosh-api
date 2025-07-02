const fs = require('fs');
const path = require('path');

// Directory to scan for files
const controllersDir = path.join(__dirname, '../controllers');
const routesDir = path.join(__dirname, '../routes');
const middlewareDir = path.join(__dirname, '../middleware');

// Function to update a file
function updateFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Check if file contains PrismaClient import
    if (content.includes('const { PrismaClient } = require(\'@prisma/client\');')) {
      console.log(`Updating file: ${filePath}`);
      
      // Replace PrismaClient import and initialization
      content = content.replace(
        /const { PrismaClient } = require\(['"]@prisma\/client['"]\);\s*const prisma = new PrismaClient\(\);/g,
        'const { getPrismaClient } = require(\'../lib/prisma\');\nconst prisma = getPrismaClient();'
      );
      
      // Write updated content back to file
      fs.writeFileSync(filePath, content, 'utf8');
      console.log(`Updated file: ${filePath}`);
    }
  } catch (error) {
    console.error(`Error processing file ${filePath}:`, error);
  }
}

// Function to recursively scan directories
function scanDirectory(directory) {
  const files = fs.readdirSync(directory);
  
  files.forEach(file => {
    const filePath = path.join(directory, file);
    const stat = fs.statSync(filePath);
    
    if (stat.isDirectory()) {
      scanDirectory(filePath);
    } else if (file.endsWith('.js')) {
      updateFile(filePath);
    }
  });
}

// Scan directories
console.log('Scanning controllers directory...');
scanDirectory(controllersDir);

console.log('Scanning routes directory...');
scanDirectory(routesDir);

console.log('Scanning middleware directory...');
scanDirectory(middlewareDir);

console.log('Done!'); 