/**
 * In-Process Queue Implementation
 * Phase 4.2: Async Infrastructure - Step 1 Foundation
 * 
 * Provides immediate execution queue implementation that preserves
 * synchronous behavior while creating the seam for future async.
 */

const Logger = require('../logger');

class InProcessQueue {
  constructor() {
    this.logger = new Logger('inProcessQueue');
    this.handlers = new Map();
  }

  /**
   * Enqueue a job for immediate execution
   * @param {string} jobName - Name of the job
   * @param {Object} payload - Job payload including correlationId
   * @param {Object} context - Execution context including correlationId
   * @returns {Promise} Resolved promise (still synchronous behavior)
   */
  async enqueue(jobName, payload, context) {
    const { correlationId } = context;
    
    this.logger.info('queue_enqueue', {
      jobName,
      correlationId,
      payloadKeys: Object.keys(payload),
      contextKeys: Object.keys(context)
    });

    try {
      // Execute immediately in the same tick for synchronous behavior
      const handler = this.handlers.get(jobName);
      if (!handler) {
        throw new Error(`No handler registered for job: ${jobName}`);
      }

      this.logger.info('queue_execute', {
        jobName,
        correlationId
      });

      // Execute handler immediately
      await handler(payload, context);
      
      return Promise.resolve();
    } catch (error) {
      this.logger.error('queue_error', {
        jobName,
        correlationId,
        errorMessage: error.message,
        errorCategory: 'job_execution'
      });
      throw error;
    }
  }

  /**
   * Register a handler for a job type
   * @param {string} jobName - Name of the job
   * @param {Function} handlerFn - Handler function
   */
  process(jobName, handlerFn) {
    this.handlers.set(jobName, handlerFn);
    this.logger.info('Handler registered', {
      jobName
    });
  }

  /**
   * Check if async processing is enabled
   * @returns {boolean} Always false for in-process queue
   */
  isAsyncEnabled() {
    return false;
  }
}

module.exports = InProcessQueue;
