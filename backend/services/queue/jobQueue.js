/**
 * Job Queue Facade
 * Phase 4.2: Async Infrastructure - Step 3 (Worker Infrastructure Introduction)
 * 
 * Provides a singleton queue interface that can switch between
 * in-process and BullMQ implementations based on Redis availability.
 */

const InProcessQueue = require('./inProcessQueue');
const BullMQQueue = require('./bullmqQueue');
const { initialize: initializeRedis, isRedisConnected } = require('./redisClient');
const { JOB_TYPES } = require('./jobTypes');
const { handler: sendWhatsAppMessageHandler } = require('./jobs/sendWhatsAppMessageJob');
const Logger = require('../logger');
const { assertScopeAllowed } = require('../../security/scopeRegistry');

const logger = new Logger('jobQueue');

// Initialize Redis client
const redisInitialized = initializeRedis();

// Track fallback activation state
let fallbackActivated = false;

// Create queue instance based on explicit policy
let queueInstance;
let adapterType;

// Check if Redis is configured and connection is available
const redisConfigured = process.env.REDIS_HOST && process.env.REDIS_PORT;
const redisConnected = redisConfigured ? isRedisConnected() : false;
const fallbackAllowed = process.env.QUEUE_FALLBACK_ALLOWED === 'true';

if (redisConfigured) {
  if (redisConnected) {
    // Redis configured and connected - use BullMQ
    queueInstance = new BullMQQueue();
    adapterType = 'bullmq';
    logger.info('queue_adapter_selected', {
      level: 'info',
      component: 'jobQueue',
      event: 'queue_adapter_selected',
      timestamp: new Date().toISOString(),
      context: { adapter: 'bullmq', reason: 'redis_available' }
    });
  } else {
    // Redis configured but not connected
    if (fallbackAllowed) {
      // Fallback explicitly allowed
      queueInstance = new InProcessQueue();
      adapterType = 'inprocess';
      fallbackActivated = true;
      
      // Emit fallback activation event (once per process boot)
      logger.warn('queue_fallback_activated', {
        level: 'warn',
        component: 'jobQueue',
        event: 'queue_fallback_activated',
        timestamp: new Date().toISOString(),
        context: { 
          executionMode: 'inprocess',
          reason: 'REDIS_UNAVAILABLE_FALLBACK_ALLOWED',
          redisConfigured: true,
          redisConnected: false
        }
      });
    } else {
      // Fallback not allowed - FAIL CLOSED
      throw new Error('Queue initialization failed: Redis unavailable and fallback not allowed. Set QUEUE_FALLBACK_ALLOWED=true to enable fallback.');
    }
  }
} else {
  // Redis not configured
  if (fallbackAllowed) {
    queueInstance = new InProcessQueue();
    adapterType = 'inprocess';
    fallbackActivated = true;
    
    logger.warn('queue_fallback_activated', {
      level: 'warn',
      component: 'jobQueue',
      event: 'queue_fallback_activated',
      timestamp: new Date().toISOString(),
      context: { 
        executionMode: 'inprocess',
        reason: 'REDIS_NOT_CONFIGURED_FALLBACK_ALLOWED',
        redisConfigured: false,
        redisConnected: false
      }
    });
  } else {
    throw new Error('Queue initialization failed: Redis not configured and fallback not allowed. Set QUEUE_FALLBACK_ALLOWED=true to enable fallback.');
  }
}

// Register job handlers
queueInstance.process(JOB_TYPES.SEND_WHATSAPP_MESSAGE, sendWhatsAppMessageHandler);

/**
 * Queue interface - delegates to current implementation
 */
const JobQueue = {
  /**
   * Enqueue a job
   * @param {string} jobName - Name of the job
   * @param {Object} payload - Job payload including correlationId
   * @param {Object} context - Execution context including correlationId
   * @returns {Promise} Queue operation promise
   */
  enqueue: (jobName, payload, context) => {
    const correlationId = context?.correlationId || 'unknown';
    
    // Enforce scope for job enqueueing
    assertScopeAllowed({
      actionName: 'QUEUE_JOB_ENQUEUE',
      actor: 'system',
      correlationId,
      context: { jobName, adapterType }
    });
    
    // Emit audit event for fallback jobs
    if (fallbackActivated && adapterType === 'inprocess') {
      logger.warn('queue_fallback_job', {
        level: 'warn',
        component: 'jobQueue',
        event: 'queue_fallback_job',
        timestamp: new Date().toISOString(),
        context: { 
          correlationId,
          jobName,
          executionMode: 'inprocess'
        }
      });
    }
    
    return queueInstance.enqueue(jobName, payload, context);
  },

  /**
   * Register a handler for a job type
   * @param {string} jobName - Name of the job
   * @param {Function} handlerFn - Handler function
   */
  process: (jobName, handlerFn) => {
    queueInstance.process(jobName, handlerFn);
  },

  /**
   * Check if async processing is enabled
   * @returns {boolean} Async enabled status
   */
  isAsyncEnabled: () => {
    return queueInstance.isAsyncEnabled();
  },

  /**
   * Get the current adapter type
   * @returns {string} 'bullmq' or 'inprocess'
   */
  getAdapterType: () => {
    return adapterType;
  },

  /**
   * Get access to job types constants
   */
  JOB_TYPES
};

module.exports = JobQueue;
