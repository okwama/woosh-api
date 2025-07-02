const Redis = require('ioredis');
const tls = require('tls');

class RedisService {
  constructor(config = {}) {
    // Default configuration values
    this.redisUrl =
      config.redisUrl ||
      process.env.REDIS_URL ||
      'redis://default:Y9kMERTRRuchYLN1GGbZneBmMgScqXDX@redis-10907.c341.af-south-1-1.ec2.redns.redis-cloud.com:10907';
    this.maxRetries = config.maxRetries || 5;
    this.retryDelay = config.retryDelay || 2000;
    this.defaultTtl = config.defaultTtl || 3600;

    this.client = null;
    this.isReady = false;
    this.connectAttempts = 0;

    // Add connection status console
    console.log('📦 Redis Configuration:');
    console.log(`🔌 Redis URL: ${this.maskRedisUrl(this.redisUrl)}`);
    console.log(`🔄 Max Retries: ${this.maxRetries}`);
    console.log(`⏱️ Retry Delay: ${this.retryDelay}ms`);
    console.log(`⏳ Default TTL: ${this.defaultTtl}s`);

    this.init();
  }

  // Helper method to mask sensitive information in Redis URL
  maskRedisUrl(url) {
    try {
      const parsedUrl = new URL(url);
      if (parsedUrl.password) {
        parsedUrl.password = '****';
      }
      return parsedUrl.toString();
    } catch (error) {
      return 'Invalid URL format';
    }
  }

  /**
   * Initializes the Redis client connection.
   * This method sets up the connection, event listeners, and retry mechanisms.
   */
  init() {
    try {
      const url = new URL(this.redisUrl);

      // Simplified TLS options
      const tlsOptions =
        url.protocol === 'rediss:'
          ? {
              rejectUnauthorized: false,
              servername: url.hostname,
              minVersion: 'TLSv1.2',
              maxVersion: 'TLSv1.3',
            }
          : undefined;

      this.client = new Redis({
        port: url.port || 6379,
        host: url.hostname,
        username: url.username || undefined,
        password: url.password || undefined,
        db: url.pathname ? parseInt(url.pathname.split('/')[1]) || 0 : 0,
        tls: tlsOptions,
        retryStrategy: (times) => {
          const delay = Math.min(times * 100, 5000);
          console.log(`🔄 Redis client retry attempt ${times} with delay ${delay}ms`);
          if (times > this.maxRetries) {
            console.error(`❌ Redis client retry limit (${this.maxRetries}) exceeded. Giving up.`);
            return null;
          }
          return delay;
        },
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        connectTimeout: 20000,
        commandTimeout: 10000,
        keepAlive: 30000,
        noDelay: true,
      });

      // Enhanced event listeners with more detailed logging
      this.client.on('connect', () => {
        console.log('✅ Redis client connected');
        console.log(`📍 Connected to: ${this.maskRedisUrl(this.redisUrl)}`);
        console.log(`📊 Database: ${url.pathname ? parseInt(url.pathname.split('/')[1]) || 0 : 0}`);
      });

      this.client.on('ready', () => {
        console.log('✅ Redis client ready to accept commands');
        this.isReady = true;
        this.connectAttempts = 0;

        // Add Redis info
        this.client
          .info()
          .then((info) => {
            const infoLines = info.split('\n');
            const version = infoLines
              .find((line) => line.startsWith('redis_version'))
              ?.split(':')[1]
              ?.trim();
            const memory = infoLines
              .find((line) => line.startsWith('used_memory_human'))
              ?.split(':')[1]
              ?.trim();
            const clients = infoLines
              .find((line) => line.startsWith('connected_clients'))
              ?.split(':')[1]
              ?.trim();

            console.log('📊 Redis Status:');
            console.log(`📌 Version: ${version || 'Unknown'}`);
            console.log(`💾 Memory Usage: ${memory || 'Unknown'}`);
            console.log(`👥 Connected Clients: ${clients || 'Unknown'}`);
          })
          .catch((err) => {
            console.warn('⚠️ Could not fetch Redis info:', err.message);
          });
      });

      this.client.on('error', (err) => {
        console.error('❌ Redis client error:', err.message);
        console.error(`📍 Failed connecting to: ${this.maskRedisUrl(this.redisUrl)}`);
        this.isReady = false;
      });

      this.client.on('reconnecting', () => {
        console.log('🔄 Redis client reconnecting...');
        console.log(`📍 Attempting: ${this.maskRedisUrl(this.redisUrl)}`);
        this.isReady = false;
      });

      this.client.on('end', () => {
        console.log('❌ Redis client connection ended');
        console.log(`📍 Disconnected from: ${this.maskRedisUrl(this.redisUrl)}`);
        this.isReady = false;
      });
    } catch (error) {
      console.error('❌ RedisService initialization failed:', error.message);
      console.error('📍 Check your Redis configuration and ensure the server is running');
    }
  }

  /**
   * Checks if the Redis client is currently ready to accept commands.
   * @returns {boolean} True if the client is ready, false otherwise.
   */
  isClientReady() {
    // ioredis's client.status can also be used, e.g., 'ready', 'connect', 'reconnecting', 'wait', 'end', 'disconnect'
    return this.isReady && this.client.status === 'ready';
  }

  /**
   * Retrieves a value from Redis by key.
   * @param {string} key - The key to retrieve.
   * @returns {Promise<any|null>} The parsed value or null if not found/error.
   */
  async get(key) {
    if (!this.isClientReady()) {
      console.warn(`⚠️ Redis client not ready. Cannot get key: ${key}`);
      return null;
    }
    try {
      const value = await this.client.get(key);
      return value ? JSON.parse(value) : null;
    } catch (error) {
      console.error(`❌ Redis get error for key "${key}":`, error.message);
      // Consider re-throwing specific errors if calling functions need to handle them.
      return null;
    }
  }

  /**
   * Sets a value in Redis with an optional TTL.
   * @param {string} key - The key to set.
   * @param {any} value - The value to store (will be JSON.stringified).
   * @param {number} [ttlSeconds] - Time-to-live in seconds. Defaults to class defaultTtl.
   * @returns {Promise<boolean>} True if successful, false otherwise.
   */
  async set(key, value, ttlSeconds = this.defaultTtl) {
    if (!this.isClientReady()) {
      console.warn(`⚠️ Redis client not ready. Cannot set key: ${key}`);
      return false;
    }
    try {
      await this.client.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`❌ Redis set error for key "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Deletes a key from Redis.
   * @param {string} key - The key to delete.
   * @returns {Promise<boolean>} True if successful, false otherwise.
   */
  async del(key) {
    if (!this.isClientReady()) {
      console.warn(`⚠️ Redis client not ready. Cannot delete key: ${key}`);
      return false;
    }
    try {
      const result = await this.client.del(key);
      return result > 0; // Returns number of keys deleted
    } catch (error) {
      console.error(`❌ Redis delete error for key "${key}":`, error.message);
      return false;
    }
  }

  /**
   * Invalidates (deletes) all keys matching a given pattern.
   * Use with caution in production environments, as KEYS command can be blocking.
   * @param {string} pattern - The glob-style pattern (e.g., 'user:*', 'product:123:*').
   * @returns {Promise<boolean>} True if successful, false otherwise.
   */
  async invalidatePattern(pattern) {
    if (!this.isClientReady()) {
      console.warn(`⚠️ Redis client not ready. Cannot invalidate pattern: ${pattern}`);
      return false;
    }
    try {
      const keys = await this.client.keys(pattern); // Note: KEYS can be slow on large datasets
      if (keys.length > 0) {
        await this.client.del(...keys);
        console.log(`🧹 Invalidated ${keys.length} keys matching pattern "${pattern}".`);
      } else {
        console.log(`ℹ️ No keys found matching pattern "${pattern}" to invalidate.`);
      }
      return true;
    } catch (error) {
      console.error(`❌ Redis pattern invalidation error for pattern "${pattern}":`, error.message);
      return false;
    }
  }

  /**
   * A cache wrapper function that tries to retrieve data from cache first.
   * If not found, it calls a provided fetch function, stores the result, and then returns it.
   * @param {string} key - The cache key.
   * @param {number} ttlSeconds - Time-to-live for the cached data.
   * @param {Function} fetchFunction - An async function that fetches the actual data if not in cache.
   * @returns {Promise<any>} The data from cache or fetched from the source.
   */
  async cacheWrapper(key, ttlSeconds, fetchFunction) {
    try {
      const cached = await this.get(key);
      if (cached !== null) {
        // Check for explicit null to allow caching of '0' or 'false'
        console.log(`✅ Cache HIT for key: ${key}`);
        return cached;
      }

      console.log(`💨 Cache MISS for key: ${key}. Fetching data...`);
      const data = await fetchFunction();
      if (data !== undefined && data !== null) {
        // Only cache if data is valid
        await this.set(key, data, ttlSeconds);
        console.log(`📝 Data cached for key: ${key}`);
      } else {
        console.warn(`⚠️ Data fetched for key ${key} was null/undefined, not caching.`);
      }
      return data;
    } catch (error) {
      console.error(`❌ Cache wrapper error for key "${key}":`, error.message);
      // If caching fails, return data from fetchFunction to ensure app functionality
      // but log the error to alert for Redis issues.
      return await fetchFunction(); // Always try to get the data if caching fails
    }
  }

  /**
   * Retrieves multiple values from Redis by keys in a single command.
   * @param {string[]} keys - An array of keys to retrieve.
   * @returns {Promise<Array<any|null>>} An array of parsed values or nulls.
   */
  async mget(keys) {
    if (!this.isClientReady()) {
      console.warn('⚠️ Redis client not ready. Cannot perform mget.');
      return keys.map(() => null); // Return an array of nulls matching key count
    }
    try {
      const values = await this.client.mget(keys);
      return values.map((value) => (value ? JSON.parse(value) : null));
    } catch (error) {
      console.error('❌ Redis mget error:', error.message);
      return keys.map(() => null);
    }
  }

  /**
   * Sets multiple key-value pairs in Redis with an optional TTL.
   * @param {Object.<string, any>} keyValuePairs - An object where keys are Redis keys and values are data.
   * @param {number} [ttlSeconds] - Time-to-live in seconds. Defaults to class defaultTtl.
   * @returns {Promise<boolean>} True if successful, false otherwise.
   */
  async mset(keyValuePairs, ttlSeconds = this.defaultTtl) {
    if (!this.isClientReady()) {
      console.warn('⚠️ Redis client not ready. Cannot perform mset.');
      return false;
    }
    try {
      const pipeline = this.client.pipeline();
      for (const [key, value] of Object.entries(keyValuePairs)) {
        pipeline.setex(key, ttlSeconds, JSON.stringify(value));
      }
      await pipeline.exec();
      return true;
    } catch (error) {
      console.error('❌ Redis mset error:', error.message);
      return false;
    }
  }

  /**
   * Performs a health check by pinging the Redis server.
   * @returns {Promise<boolean>} True if PONG is received, false otherwise.
   */
  async healthCheck() {
    if (!this.client) {
      // Client might not even be initialized
      console.warn('⚠️ Redis client not initialized for health check.');
      return false;
    }
    try {
      const pingResult = await this.client.ping();
      return pingResult === 'PONG';
    } catch (error) {
      console.error('❌ Redis health check failed:', error.message);
      return false;
    }
  }

  /**
   * Flushes all keys from the currently selected Redis database.
   * Use with extreme caution as this deletes ALL data.
   * @returns {Promise<boolean>} True if successful, false otherwise.
   */
  async flushAll() {
    if (!this.isClientReady()) {
      console.warn('⚠️ Redis client not ready. Cannot flushAll.');
      return false;
    }

    // Prevent accidental execution in production
    if (process.env.NODE_ENV === 'production') {
      console.error('❌ flushAll is disabled in production environment');
      return false;
    }

    try {
      await this.client.flushall();
      console.log('🧹 Redis database flushed successfully (non-production environment).');
      return true;
    } catch (error) {
      console.error('❌ Redis flushAll error:', error.message);
      return false;
    }
  }

  /**
   * Closes the Redis connection gracefully.
   * @returns {Promise<void>}
   */
  async disconnect() {
    if (this.client && this.client.status !== 'end') {
      try {
        await this.client.quit();
        console.log('🔌 Redis client disconnected gracefully.');
      } catch (error) {
        console.error('❌ Error disconnecting Redis client:', error.message);
      }
    }
  }
}

// Create a singleton instance and export it
const redisService = new RedisService();

// Journey Plan Cache Functions
const JOURNEY_PLAN_CACHE_TTL = 60 * 60; // 1 hour

const cacheJourneyPlans = async (salesRepId, date, data) => {
  try {
    const key = `journey_plans:${salesRepId}:${date}`;
    // Ensure data is properly stringified and handle BigInt/Date objects
    const safeData = JSON.stringify(data, (_, value) =>
      typeof value === 'bigint' ? value.toString() :
      value instanceof Date ? value.toISOString() :
      value
    );
    
    await redisService.set(key, safeData);
    await redisService.expire(key, JOURNEY_PLAN_CACHE_TTL);
    console.log(`Successfully cached journey plans for ${salesRepId} on ${date}`);
  } catch (error) {
    console.error('Redis cache error:', error.message);
    // Don't throw - treat cache errors as non-fatal
  }
};

const getCachedJourneyPlans = async (salesRepId, date) => {
  try {
    const key = `journey_plans:${salesRepId}:${date}`;
    const data = await redisService.get(key);
    if (!data) return null;
    
    // Parse the data and restore Date objects
    return JSON.parse(data, (_, value) => {
      if (typeof value === 'string') {
        const date = new Date(value);
        if (!isNaN(date.getTime()) && value.includes('T')) {
          return date;
        }
      }
      return value;
    });
  } catch (error) {
    console.error('Redis get error:', error.message);
    return null; // Return null on error to fallback to DB
  }
};

const invalidateJourneyPlanCache = async (salesRepId, date) => {
  try {
    const key = `journey_plans:${salesRepId}:${date}`;
    await redisService.del(key);
    console.log(`Invalidated cache for ${salesRepId} on ${date}`);
  } catch (error) {
    console.error('Redis invalidate error:', error.message);
    // Don't throw - treat cache errors as non-fatal
  }
};

module.exports = {
  redisService,
  cacheJourneyPlans,
  getCachedJourneyPlans,
  invalidateJourneyPlanCache,
};
