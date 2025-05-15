const { PrismaClient } = require('@prisma/client');

let prisma;

// Check if Prisma has already been initialized in the global context
if (!global.prisma) {
  global.prisma = new PrismaClient({
    log: ['error', 'warn'],  // Reduced logging for performance
  });

  // Log errors for monitoring
  global.prisma.$on('error', (e) => {
    console.error('Prisma Error:', e.message);
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
