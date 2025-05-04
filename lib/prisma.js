const { PrismaClient } = require('@prisma/client');

let prisma;

if (!global.prisma) {
  global.prisma = new PrismaClient({
    log: ['error', 'warn'],
  });

  global.prisma.$on('query', (e) => {
    console.log('Query: ' + e.query);
    console.log('Duration: ' + e.duration + 'ms');
  });

  global.prisma.$on('error', (e) => {
    console.error('Prisma Error:', e);
  });
}

prisma = global.prisma;

module.exports = prisma; 