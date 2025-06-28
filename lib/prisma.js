const { PrismaClient } = require('@prisma/client');

let prisma;

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

// Check if Prisma has already been initialized in the global context
if (!global.prisma) {
  global.prisma = new PrismaClient({
    log: ['error', 'warn'],  // Reduced logging for performance
    datasources: {
      db: {
        url: getConnectionConfig(),
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
