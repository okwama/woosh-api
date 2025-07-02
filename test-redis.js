const { redisService } = require('./lib/redisService');

async function testRedisConnection() {
  console.log('🔄 Testing Redis connection...');

  try {
    // Wait for connection to be ready
    console.log('⏳ Waiting for Redis connection to be ready...');
    let attempts = 0;
    const maxAttempts = 30; // Wait up to 3 seconds

    while (!redisService.isClientReady() && attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      attempts++;
    }

    if (!redisService.isClientReady()) {
      throw new Error('Redis connection timeout - failed to connect');
    }

    console.log('✅ Redis connection is ready!');

    // Test 1: Health Check
    const isHealthy = await redisService.healthCheck();
    console.log('✅ Health Check:', isHealthy ? 'Passed' : 'Failed');

    if (!isHealthy) {
      throw new Error('Health check failed - Redis is not responding correctly');
    }

    // Test 2: Set & Get
    console.log('\n🔄 Testing Set & Get operations...');
    const testKey = 'test:connection';
    const testValue = { message: 'Hello Redis!', timestamp: new Date().toISOString() };

    const setResult = await redisService.set(testKey, testValue, 60); // 60 seconds TTL
    console.log('✅ Set operation result:', setResult);

    const retrieved = await redisService.get(testKey);
    console.log('✅ Get operation result:', retrieved);

    if (!retrieved) {
      throw new Error('Get operation failed - no value retrieved');
    }

    const valuesMatch = JSON.stringify(testValue) === JSON.stringify(retrieved);
    console.log('✅ Values Match:', valuesMatch);

    if (!valuesMatch) {
      throw new Error('Values do not match after Set/Get operations');
    }

    // Test 3: Delete
    console.log('\n🔄 Testing Delete operation...');
    await redisService.del(testKey);
    const afterDelete = await redisService.get(testKey);
    const deleteSuccess = afterDelete === null;
    console.log('✅ Delete operation:', deleteSuccess ? 'Successfully Deleted' : 'Delete Failed');

    if (!deleteSuccess) {
      throw new Error('Delete operation failed - value still exists');
    }

    // Test 4: Batch Operations
    console.log('\n🔄 Testing Batch Operations...');
    const batchData = {
      'test:batch1': { id: 1, name: 'Test 1' },
      'test:batch2': { id: 2, name: 'Test 2' },
    };

    const batchSetResult = await redisService.mset(batchData, 60);
    console.log('✅ Batch Set Result:', batchSetResult);

    const batchKeys = Object.keys(batchData);
    const batchResults = await redisService.mget(batchKeys);
    console.log('✅ Batch Get Results:', batchResults);

    if (!batchResults || batchResults.length !== batchKeys.length) {
      throw new Error('Batch operations failed - incorrect number of results');
    }

    // Cleanup
    console.log('\n🧹 Cleaning up test data...');
    for (const key of batchKeys) {
      await redisService.del(key);
    }

    console.log('\n✨ All tests completed successfully!');
  } catch (error) {
    console.error('\n❌ Redis Test Error:', error.message);
    console.error('Error details:', error);
  } finally {
    await redisService.disconnect();
    console.log('\n👋 Test complete');
  }
}

// Run the test
testRedisConnection();
