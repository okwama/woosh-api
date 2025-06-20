const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function cleanupTokens() {
  try {
    console.log('🧹 Starting token cleanup...');
    
    const now = new Date();
    
    // Delete expired tokens (both access and refresh)
    const expiredResult = await prisma.token.deleteMany({
      where: {
        expiresAt: {
          lt: now
        }
      }
    });
    
    console.log(`✅ Deleted ${expiredResult.count} expired tokens`);
    
    // Delete blacklisted tokens older than 7 days
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    const blacklistedResult = await prisma.token.deleteMany({
      where: {
        blacklisted: true,
        createdAt: {
          lt: sevenDaysAgo
        }
      }
    });
    
    console.log(`✅ Deleted ${blacklistedResult.count} old blacklisted tokens`);
    
    // Get current token statistics
    const stats = await prisma.token.groupBy({
      by: ['tokenType', 'blacklisted'],
      _count: {
        id: true
      }
    });
    
    console.log('\n📊 Current token statistics:');
    stats.forEach(stat => {
      const type = stat.tokenType || 'unknown';
      const status = stat.blacklisted ? 'blacklisted' : 'active';
      console.log(`  ${type} tokens (${status}): ${stat._count.id}`);
    });
    
    console.log('\n✨ Token cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during token cleanup:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run cleanup if called directly
if (require.main === module) {
  cleanupTokens();
}

module.exports = cleanupTokens; 