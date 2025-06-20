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
    // Connection pool configuration
    __internal: {
      engine: {
        connectionLimit: 20, // Increased from default 9
        pool: {
          min: 2,
          max: 20,
          acquireTimeoutMillis: 30000, // 30 seconds
          createTimeoutMillis: 30000,
          destroyTimeoutMillis: 5000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 200,
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
    if (e.duration > 1000) { // Log queries taking more than 1 second
      console.warn(`Slow query (${e.duration}ms):`, e.query);
    }
  });

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
