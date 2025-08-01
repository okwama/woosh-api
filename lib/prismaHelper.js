const getPrisma = require('./prisma');

// Helper function to get Prisma client with connection management
const getPrismaClient = async () => {
  return await getPrisma();
};

// Helper function for common database operations with retry logic
const withPrisma = async (operation, context = '') => {
  const prisma = await getPrismaClient();
  
  try {
    return await operation(prisma);
  } catch (error) {
    console.error(`Database operation failed for ${context}:`, error.message);
    throw error;
  }
};

// Helper for transactions
const withTransaction = async (operation, context = '') => {
  const prisma = await getPrismaClient();
  
  return await prisma.$transaction(async (tx) => {
    return await operation(tx);
  }, {
    maxWait: 10000, // 10 seconds max wait
    timeout: 30000, // 30 seconds timeout
  });
};

module.exports = {
  getPrismaClient,
  withPrisma,
  withTransaction,
}; 