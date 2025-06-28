const { tokenService } = require('../lib/tokenService');

async function cleanupTokens() {
  try {
    console.log('🧹 Starting optimized token cleanup...');
    
    // Use the optimized token service for cleanup
    const deletedCount = await tokenService.cleanupExpiredTokens(100);
    
    console.log(`✅ Deleted ${deletedCount} expired tokens using batch operations`);
    
    // Get current token statistics
    const stats = await tokenService.getTokenStats();
    
    console.log('\n📊 Current token statistics:');
    Object.entries(stats).forEach(([key, count]) => {
      console.log(`  ${key}: ${count}`);
    });
    
    // Clear token cache to free memory
    tokenService.clearCache();
    console.log('🧹 Token cache cleared');
    
    console.log('\n✨ Optimized token cleanup completed successfully!');
    
  } catch (error) {
    console.error('❌ Error during token cleanup:', error);
  }
}

// Run cleanup if called directly
if (require.main === module) {
  cleanupTokens();
}

module.exports = cleanupTokens; 