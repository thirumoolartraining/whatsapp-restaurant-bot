/**
 * Redis Client
 * Phase 4.2: Async Infrastructure - Step 3 (Worker Infrastructure Introduction)
 * 
 * Creates Redis connection using environment variables if present.
 * Fails gracefully if Redis not configured.
 */

const Logger = require('../logger');

let redisClient = null;
let isConnected = false;

const logger = new Logger('redisClient');

/**
 * Initialize Redis connection if environment variables are present
 */
function initialize() {
  // Check if Redis environment variables are configured
  if (!process.env.REDIS_HOST || !process.env.REDIS_PORT) {
    logger.info('Redis not configured - running without Redis');
    return false;
  }

  try {
    // Import Redis only if configured
    const Redis = require('redis');
    
    const redisConfig = {
      host: process.env.REDIS_HOST,
      port: parseInt(process.env.REDIS_PORT),
      password: process.env.REDIS_PASSWORD || undefined,
      db: parseInt(process.env.REDIS_DB || '0'),
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    };

    redisClient = Redis.createClient(redisConfig);

    redisClient.on('connect', () => {
      logger.info('Redis connecting', {
        host: redisConfig.host,
        port: redisConfig.port,
        db: redisConfig.db
      });
    });

    redisClient.on('ready', () => {
      isConnected = true;
      logger.info('Redis connected successfully');
    });

    redisClient.on('error', (error) => {
      isConnected = false;
      logger.error('Redis connection error', {
        error: error.message,
        host: redisConfig.host,
        port: redisConfig.port
      });
    });

    redisClient.on('end', () => {
      isConnected = false;
      logger.warn('Redis connection ended');
    });

    // Attempt to connect
    redisClient.connect().catch((error) => {
      logger.error('Failed to connect to Redis', {
        error: error.message
      });
    });

    return true;
  } catch (error) {
    logger.error('Failed to initialize Redis client', {
      error: error.message
    });
    return false;
  }
}

/**
 * Get Redis client instance
 * @returns {Object|null} Redis client or null if not available
 */
function getClient() {
  return redisClient;
}

/**
 * Check if Redis is connected
 * @returns {boolean} Connection status
 */
function isRedisConnected() {
  return isConnected && redisClient && redisClient.status === 'ready';
}

/**
 * Close Redis connection if open
 */
async function close() {
  if (redisClient && isConnected) {
    try {
      await redisClient.quit();
      logger.info('Redis connection closed');
    } catch (error) {
      logger.error('Error closing Redis connection', {
        error: error.message
      });
    }
  }
}

module.exports = {
  initialize,
  getClient,
  isRedisConnected,
  close
};
