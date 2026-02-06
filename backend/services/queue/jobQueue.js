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

const logger = new Logger('jobQueue');

// Initialize Redis client
const redisInitialized = initializeRedis();

// Create queue instance based on Redis configuration (not connection status)
let queueInstance;
let adapterType;

// Check if Redis is configured (not necessarily connected)
if (process.env.REDIS_HOST && process.env.REDIS_PORT) {
  queueInstance = new BullMQQueue();
  adapterType = 'bullmq';
  logger.info('queue_adapter_selected', {
    level: 'info',
    component: 'jobQueue',
    event: 'queue_adapter_selected',
    timestamp: new Date().toISOString(),
    context: { adapter: 'bullmq', reason: 'redis_configured' }
  });
} else {
  queueInstance = new InProcessQueue();
  adapterType = 'inprocess';
  logger.info('queue_adapter_selected', {
    level: 'info',
    component: 'jobQueue',
    event: 'queue_adapter_selected',
    timestamp: new Date().toISOString(),
    context: { adapter: 'inprocess', reason: 'redis_not_configured' }
  });
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
