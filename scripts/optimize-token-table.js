const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function optimizeTokenTable() {
  try {
    console.log('🔧 Starting token table optimization...');

    // 1. Add composite indexes for better query performance (excluding token field to avoid key length issues)
    console.log('📊 Adding composite indexes...');
    
    // Index for user token queries
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_user_tokens 
      ON \`Token\` (\`salesRepId\`, \`tokenType\`, \`blacklisted\`)
    `;

    // Index for cleanup queries
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_expired_tokens 
      ON \`Token\` (\`expiresAt\`, \`blacklisted\`)
    `;

    // Index for lastUsedAt updates
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_last_used 
      ON \`Token\` (\`id\`, \`lastUsedAt\`)
    `;

    // Index for token validation (without the token field)
    await prisma.$executeRaw`
      CREATE INDEX IF NOT EXISTS idx_token_validation 
      ON \`Token\` (\`salesRepId\`, \`tokenType\`, \`blacklisted\`, \`expiresAt\`)
    `;

    console.log('✅ Composite indexes created successfully');

    // 2. Analyze table statistics
    console.log('📈 Analyzing table statistics...');
    await prisma.$executeRaw`ANALYZE TABLE \`Token\``;
    console.log('✅ Table statistics updated');

    // 3. Clean up any orphaned or invalid tokens
    console.log('🧹 Cleaning up invalid tokens...');
    
    // Remove tokens with past expiration dates
    const expiredResult = await prisma.token.deleteMany({
      where: {
        expiresAt: {
          lt: new Date()
        }
      }
    });
    console.log(`✅ Removed ${expiredResult.count} expired tokens`);

    // 4. Get current token statistics
    console.log('📊 Current token statistics:');
    
    const stats = await prisma.token.groupBy({
      by: ['tokenType', 'blacklisted'],
      _count: {
        id: true
      }
    });

    stats.forEach(stat => {
      const type = stat.tokenType || 'null';
      const status = stat.blacklisted ? 'blacklisted' : 'active';
      console.log(`  ${type} tokens (${status}): ${stat._count.id}`);
    });

    // 5. Check for potential issues
    console.log('🔍 Checking for potential issues...');
    
    const duplicateTokens = await prisma.token.groupBy({
      by: ['token'],
      _count: {
        id: true
      },
      having: {
        id: {
          _count: {
            gt: 1
          }
        }
      }
    });

    if (duplicateTokens.length > 0) {
      console.warn(`⚠️  Found ${duplicateTokens.length} duplicate tokens`);
      
      // Remove duplicates (keep the most recent one)
      for (const duplicate of duplicateTokens) {
        const tokens = await prisma.token.findMany({
          where: {
            token: duplicate.token
          },
          orderBy: {
            createdAt: 'desc'
          }
        });

        // Keep the first (most recent) one, delete the rest
        if (tokens.length > 1) {
          const toDelete = tokens.slice(1);
          await prisma.token.deleteMany({
            where: {
              id: {
                in: toDelete.map(t => t.id)
              }
            }
          });
          console.log(`✅ Removed ${toDelete.length} duplicate tokens for token: ${duplicate.token.substring(0, 20)}...`);
        }
      }
    } else {
      console.log('✅ No duplicate tokens found');
    }

    console.log('✨ Token table optimization completed successfully!');
    console.log('💡 Recommendations:');
    console.log('  - Monitor lock wait timeouts in MySQL logs');
    console.log('  - Consider increasing innodb_lock_wait_timeout if needed');
    console.log('  - Use the enhanced token service for all token operations');
    console.log('  - The enhanced token service now includes:');
    console.log('    * Lock timeout retry logic with exponential backoff');
    console.log('    * Reduced transaction timeouts');
    console.log('    * Smaller batch sizes for cleanup operations');
    console.log('    * Better error handling and logging');

  } catch (error) {
    console.error('❌ Error optimizing token table:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Run the optimization
optimizeTokenTable(); 