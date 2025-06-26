const { PrismaClient } = require('@prisma/client');

let prisma;

// Check if Prisma has already been initialized in the global context
if (!global.prisma) {
  global.prisma = new PrismaClient({
    log: ['error', 'warn'],  // Reduced logging for performance
    datasources: {
      db: {
        url: process.env.DATABASE_URL,
      },
    },
    // Optimized connection pool configuration for Prisma 5.0.0+
    __internal: {
      engine: {
        connectionLimit: 50, // Increased from 20 to handle more concurrent requests
        pool: {
          min: 5,           // Increased minimum connections
          max: 50,          // Increased maximum connections
          acquireTimeoutMillis: 60000, // 60 seconds (increased from 30)
          createTimeoutMillis: 60000,  // 60 seconds
          destroyTimeoutMillis: 10000, // 10 seconds
          idleTimeoutMillis: 60000,    // 60 seconds (increased from 30)
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 100, // Faster retry
        },
      },
    },
  });

  // Log errors for monitoring
  global.prisma.$on('error', (e) => {
    console.error('Prisma Error:', e.message);
  });

  // Log query performance for debugging
  global.prisma.$on('query', (e) => {
    if (e.duration > 2000) { // Log queries taking more than 2 seconds
      console.warn(`Slow query (${e.duration}ms):`, e.query.substring(0, 100) + '...');
    }
  });

  // Test connection on startup
  (async () => {
    try {
      await global.prisma.$connect();
      console.log('✅ Prisma client connected successfully');
      
      // Test a simple query
      await global.prisma.$queryRaw`SELECT 1`;
      console.log('✅ Database connection test passed');
    } catch (error) {
      console.error('❌ Prisma connection test failed:', error.message);
    }
  })();

  // Gracefully handle client disconnection on process exit
  process.on('SIGTERM', async () => {
    console.log('SIGTERM received: closing Prisma client...');
    await global.prisma.$disconnect();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    console.log('SIGINT received: closing Prisma client...');
    await global.prisma.$disconnect();
    process.exit(0);
  });
}

// Reuse the existing Prisma client
prisma = global.prisma;

module.exports = prisma;
