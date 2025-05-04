const { PrismaClient } = require('@prisma/client');

// Create a singleton instance of PrismaClient
let prisma;

// Function to get the Prisma client instance
function getPrismaClient() {
  if (!prisma) {
    prisma = new PrismaClient({
      log: ['error', 'warn'],
    });
    
    // Handle connection errors
    prisma.$on('query', (e) => {
      console.log('Query: ' + e.query);
      console.log('Duration: ' + e.duration + 'ms');
    });
    
    // Handle connection errors
    prisma.$on('error', (e) => {
      console.error('Prisma Error:', e);
    });
  }
  return prisma;
}

// Function to disconnect from the database
async function disconnect() {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

// Handle process termination
process.on('beforeExit', async () => {
  await disconnect();
});

module.exports = {
  getPrismaClient,
  disconnect
}; 