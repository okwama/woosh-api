const { PrismaClient } = require('@prisma/client');

// Connection pool configuration for MySQL
const getConnectionConfig = () => {
  const baseUrl = process.env.DATABASE_URL;

  // If DATABASE_URL already has connection pool parameters, use it as is
  if (baseUrl.includes('connection_limit') || baseUrl.includes('pool_timeout')) {
    return baseUrl;
  }

  // Add connection pool parameters to DATABASE_URL with increased timeouts
  const separator = baseUrl.includes('?') ? '&' : '?';
  return `${baseUrl}${separator}connection_limit=20&pool_timeout=60&acquire_timeout=120000&timeout=120000&socket_timeout=120000`;
};

// Singleton pattern for Prisma client
let prisma = null;
let isConnecting = false;
let connectionPromise = null;

const createPrismaClient = () => {
  return new PrismaClient({
    log: ['error', 'warn'], // Reduced logging for performance
    datasources: {
      db: {
        url: getConnectionConfig(),
      },
    },
  });
};

const ensureConnection = async () => {
  // If already connected, return the client
  if (prisma && !isConnecting) {
    return prisma;
  }

  // If connection is in progress, wait for it
  if (isConnecting && connectionPromise) {
    return await connectionPromise;
  }

  // Start connection process
  isConnecting = true;
  connectionPromise = (async () => {
    try {
      // Create new client if not exists
      if (!prisma) {
        prisma = createPrismaClient();

        // Log errors for monitoring
        prisma.$on('error', (e) => {
          console.error('Prisma Error:', e.message);
        });

        // Log query performance for debugging
        prisma.$on('query', (e) => {
          if (e.duration > 2000) {
            // Log queries taking more than 2 seconds
            console.warn(`Slow query (${e.duration}ms):`, e.query.substring(0, 100) + '...');
          }
        });
      }

      // Connect to database
      await prisma.$connect();
      console.log('✅ Prisma client connected successfully');

      // Test a simple query
      await prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection test passed');

      isConnecting = false;
      return prisma;
    } catch (error) {
      isConnecting = false;
      console.error('❌ Prisma connection test failed:', error.message);
      throw error;
    }
  })();

  return await connectionPromise;
};

// Gracefully handle client disconnection on process exit
process.on('SIGTERM', async () => {
  console.log('SIGTERM received: closing Prisma client...');
  if (prisma) {
    await prisma.$disconnect();
  }
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received: closing Prisma client...');
  if (prisma) {
    await prisma.$disconnect();
  }
  process.exit(0);
});

// Export a function that ensures connection before use
module.exports = async () => {
  return await ensureConnection();
};

// Also export the raw client for backward compatibility (but with connection check)
module.exports.raw = async () => {
  const client = await ensureConnection();
  return client;
};
