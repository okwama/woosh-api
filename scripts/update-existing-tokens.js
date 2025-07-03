const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function updateExistingTokens() {
  try {
    console.log('🔄 Starting token type update...');

    // Update tokens that don't have tokenType set using a raw SQL query
    // This is necessary because Prisma's query engine prevents filtering by `null` on a required field
    const result =
      await prisma.$executeRaw`UPDATE \`Token\` SET \`tokenType\` = 'access' WHERE \`tokenType\` IS NULL`;

    console.log(`✅ Updated ${result} tokens to have tokenType: 'access'`);

    // Get current token statistics
    const stats = await prisma.token.groupBy({
      by: ['tokenType'],
      _count: {
        id: true,
      },
    });

    console.log('\n📊 Current token statistics:');
    stats.forEach((stat) => {
      const type = stat.tokenType || 'null';
      console.log(`  ${type} tokens: ${stat._count.id}`);
    });

    console.log('\n✨ Token update completed successfully!');
    console.log('💡 Note: All existing tokens are now marked as "access" tokens.');
    console.log('💡 Users will need to log in again to get new refresh tokens.');
  } catch (error) {
    console.error('❌ Error updating tokens:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run update if called directly
if (require.main === module) {
  updateExistingTokens();
}

module.exports = updateExistingTokens;
