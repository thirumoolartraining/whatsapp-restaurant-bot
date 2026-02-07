/**
 * Abuse Store
 * Phase 6.3: ABUSE CONSTRAINTS ENGINE
 * 
 * Provides atomic counter operations for abuse detection.
 * Uses Redis if available, falls back to MongoDB with TTL.
 * Fails closed for high-risk operations when store unavailable.
 */

const Logger = require('../services/logger');
const { getAbuseLimits, isHighRiskAction } = require('./abusePolicy');
const { getClient: getRedisClient, isRedisConnected } = require('../services/queue/redisClient');

const logger = new Logger('abuseStore');

// Cache for store availability status
let storeAvailable = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_CHECK_INTERVAL_MS = 30000; // 30 seconds

/**
 * Check if abuse store is available
 * @returns {boolean} Whether store is operational
 */
async function isStoreAvailable() {
  const now = Date.now();
  
  // Cache availability check to avoid repeated checks
  if (storeAvailable !== null && (now - lastAvailabilityCheck) < AVAILABILITY_CHECK_INTERVAL_MS) {
    return storeAvailable;
  }
  
  try {
    // Try Redis first
    if (isRedisConnected()) {
      const redis = getRedisClient();
      if (redis && redis.status === 'ready') {
        // Test Redis with a simple ping
        await redis.ping();
        storeAvailable = true;
        lastAvailabilityCheck = now;
        return true;
      }
    }
    
    // Fallback to MongoDB availability check
    const mongoose = require('mongoose');
    if (mongoose.connection.readyState === 1) { // connected
      storeAvailable = true;
      lastAvailabilityCheck = now;
      return true;
    }
    
    storeAvailable = false;
    lastAvailabilityCheck = now;
    return false;
  } catch (error) {
    logger.warn('Store availability check failed', { error: error.message });
    storeAvailable = false;
    lastAvailabilityCheck = now;
    return false;
  }
}

/**
 * Increment windowed counter (for per-minute rate limits)
 * @param {string} key - Counter key
 * @param {number} windowMs - Window size in milliseconds
 * @param {number} limit - Maximum allowed count
 * @returns {Promise<Object>} { allowed, remaining, resetAt }
 */
async function incrWindow(key, windowMs, limit) {
  const available = await isStoreAvailable();
  
  if (!available) {
    logger.error('Store unavailable for windowed counter', { key, windowMs, limit });
    throw new Error('COUNTER_UNAVAILABLE_FAIL_CLOSED');
  }
  
  try {
    // Try Redis first
    if (isRedisConnected()) {
      return await incrWindowRedis(key, windowMs, limit);
    }
    
    // Fallback to MongoDB
    return await incrWindowMongo(key, windowMs, limit);
  } catch (error) {
    logger.error('Windowed counter increment failed', { key, error: error.message });
    throw error;
  }
}

/**
 * Increment fixed counter with TTL (for per-correlation limits)
 * @param {string} key - Counter key
 * @param {number} ttlMs - Time to live in milliseconds
 * @param {number} limit - Maximum allowed count
 * @returns {Promise<Object>} { allowed, remaining }
 */
async function incrFixed(key, ttlMs, limit) {
  const available = await isStoreAvailable();
  
  // For high-risk operations, fail closed if store unavailable
  if (!available) {
    logger.error('Store unavailable for fixed counter', { key, ttlMs, limit });
    throw new Error('COUNTER_UNAVAILABLE_FAIL_CLOSED');
  }
  
  try {
    // Try Redis first
    if (isRedisConnected()) {
      return await incrFixedRedis(key, ttlMs, limit);
    }
    
    // Fallback to MongoDB
    return await incrFixedMongo(key, ttlMs, limit);
  } catch (error) {
    logger.error('Fixed counter increment failed', { key, error: error.message });
    throw error;
  }
}

/**
 * Get counter value
 * @param {string} key - Counter key
 * @returns {Promise<number|null>} Counter value or null if not found
 */
async function get(key) {
  const available = await isStoreAvailable();
  
  if (!available) {
    return null;
  }
  
  try {
    // Try Redis first
    if (isRedisConnected()) {
      const redis = getRedisClient();
      const value = await redis.get(key);
      return value ? parseInt(value, 10) : null;
    }
    
    // Fallback to MongoDB
    return await getMongo(key);
  } catch (error) {
    logger.error('Counter get failed', { key, error: error.message });
    return null;
  }
}

// Redis implementations
async function incrWindowRedis(key, windowMs, limit) {
  const redis = getRedisClient();
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const windowKey = `${key}:${windowStart}`;
  
  const pipeline = redis.multi();
  pipeline.incr(windowKey);
  pipeline.expire(windowKey, Math.ceil(windowMs / 1000) + 1); // +1 second buffer
  
  const results = await pipeline.exec();
  const count = results[0][1];
  
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const resetAt = windowStart + windowMs;
  
  return { allowed, remaining, resetAt };
}

async function incrFixedRedis(key, ttlMs, limit) {
  const redis = getRedisClient();
  
  const pipeline = redis.multi();
  pipeline.incr(key);
  pipeline.expire(key, Math.ceil(ttlMs / 1000));
  
  const results = await pipeline.exec();
  const count = results[0][1];
  
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  
  return { allowed, remaining };
}

// MongoDB fallback implementations
async function incrWindowMongo(key, windowMs, limit) {
  const mongoose = require('mongoose');
  const now = Date.now();
  const windowStart = now - (now % windowMs);
  const windowKey = `${key}:${windowStart}`;
  
  // Use atomic findAndModify for MongoDB
  const AbuseCounter = mongoose.model('AbuseCounter', new mongoose.Schema({
    _id: String,
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, default: Date.now, expires: 0 }
  }));
  
  const result = await AbuseCounter.findOneAndUpdate(
    { _id: windowKey },
    { 
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(windowStart + windowMs + 1000) }
    },
    { upsert: true, new: true }
  );
  
  const count = result.count;
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  const resetAt = windowStart + windowMs;
  
  return { allowed, remaining, resetAt };
}

async function incrFixedMongo(key, ttlMs, limit) {
  const mongoose = require('mongoose');
  
  const AbuseCounter = mongoose.model('AbuseCounter', new mongoose.Schema({
    _id: String,
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, default: Date.now, expires: 0 }
  }));
  
  const result = await AbuseCounter.findOneAndUpdate(
    { _id: key },
    { 
      $inc: { count: 1 },
      $setOnInsert: { expiresAt: new Date(Date.now() + ttlMs) }
    },
    { upsert: true, new: true }
  );
  
  const count = result.count;
  const allowed = count <= limit;
  const remaining = Math.max(0, limit - count);
  
  return { allowed, remaining };
}

async function getMongo(key) {
  const mongoose = require('mongoose');
  
  const AbuseCounter = mongoose.model('AbuseCounter', new mongoose.Schema({
    _id: String,
    count: { type: Number, default: 0 },
    expiresAt: { type: Date, default: Date.now, expires: 0 }
  }));
  
  const doc = await AbuseCounter.findById(key);
  return doc ? doc.count : null;
}

module.exports = {
  incrWindow,
  incrFixed,
  get,
  isStoreAvailable
};
