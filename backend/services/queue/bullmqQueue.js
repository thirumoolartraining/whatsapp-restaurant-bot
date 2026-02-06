/**
 * BullMQ Queue Adapter
 * Phase 4.2: Async Infrastructure - Step 3 (Worker Infrastructure Introduction)
 * 
 * Implements async queue using BullMQ + Redis.
 * Provides same interface as InProcessQueue but with async execution.
 */

const { Queue, Worker } = require('bullmq');
const { isRedisConnected, getClient } = require('./redisClient');
const Logger = require('../logger');

const logger = new Logger('bullmqQueue');

class BullMQQueue {
  constructor() {
    this.logger = new Logger('bullmqQueue');
    this.queues = new Map();
    this.workers = new Map();
    this.handlers = new Map();
    this.redisAvailable = false;
    this.initialize();
  }

  /**
   * Initialize BullMQ with Redis connection
   */
  initialize() {
    if (!isRedisConnected()) {
      this.logger.warn('BullMQ not available - Redis not connected');
      return;
    }

    try {
      const redisConnection = getClient();
      
      this.redisAvailable = true;
      this.logger.info('BullMQ initialized with Redis');
    } catch (error) {
      this.logger.error('Failed to initialize BullMQ', {
        error: error.message
      });
      this.redisAvailable = false;
    }
  }

  /**
   * Calculate backoff delay for retry attempts
   * @param {number} attemptNumber - The attempt number for which to calculate backoff
   * @returns {number} Backoff delay in milliseconds
   */
  calculateBackoff(attemptNumber) {
    switch (attemptNumber) {
      case 2:
        return 10000;  // 10 seconds
      case 3:
        return 60000;  // 1 minute
      default:
        return 0;      // No backoff for other attempts
    }
  }

  /**
   * Get or create a queue for a specific job type
   * @param {string} jobName - Name of the job
   * @returns {Queue|null} BullMQ queue instance
   */
  getQueue(jobName) {
    if (!this.redisAvailable) {
      return null;
    }

    if (!this.queues.has(jobName)) {
      const queue = new Queue(jobName, {
        connection: getClient(),
        defaultJobOptions: {
          removeOnComplete: 100,
          removeOnFail: 50
          // Retry options set per-job in enqueue method
        }
      });

      // Log queue events
      queue.on('waiting', (job) => {
        this.logger.info('Job waiting in queue', {
          jobId: job.id,
          jobName: job.name,
          correlationId: job.data?.context?.correlationId
        });
      });

      queue.on('active', (job) => {
        this.logger.info('Job active', {
          jobId: job.id,
          jobName: job.name,
          correlationId: job.data?.context?.correlationId
        });
      });

      queue.on('completed', (job) => {
        this.logger.info('Job completed', {
          jobId: job.id,
          jobName: job.name,
          correlationId: job.data?.context?.correlationId
        });
      });

      queue.on('failed', (job, error) => {
        this.logger.error('Job failed', {
          jobId: job?.id,
          jobName: job?.name,
          correlationId: job?.data?.context?.correlationId,
          errorMessage: error.message
        });
      });

      queue.on('progress', (job, progress) => {
        this.logger.info('Job progress', {
          jobId: job.id,
          jobName: job.name,
          correlationId: job.data?.context?.correlationId,
          progress
        });
      });

      // Listen for retry events
      queue.on('waiting-children', (job) => {
        // This event can be used to detect retries
        if (job.attemptsMade > 0) {
          const nextAttemptNumber = job.attemptsMade + 1;
          const backoffMs = this.calculateBackoff(nextAttemptNumber);
          
          this.logger.info('job_retry_scheduled', {
            correlationId: job.data?.context?.correlationId,
            jobId: job.id,
            jobName: job.name,
            attemptNumber: nextAttemptNumber,
            maxAttempts: job.opts.attempts || 1,
            nextBackoffMs: backoffMs,
            errorCategory: 'detected_on_retry'
          });
        }
      });

      this.queues.set(jobName, queue);
    }

    return this.queues.get(jobName);
  }

  /**
   * Enqueue a job for async execution
   * @param {string} jobName - Name of the job
   * @param {Object} payload - Job payload including correlationId
   * @param {Object} context - Execution context including correlationId
   * @returns {Promise} Queue operation promise
   */
  async enqueue(jobName, payload, context) {
    const { correlationId } = context;

    logger.info('queue_enqueue_entry', {
      level: 'info',
      component: 'bullmqQueue',
      event: 'queue_enqueue_entry',
      timestamp: new Date().toISOString(),
      context: { correlationId, jobName }
    });

    logger.info('queue_enqueue', {
      jobName,
      correlationId,
      payloadKeys: Object.keys(payload),
      contextKeys: Object.keys(context),
      queueType: 'bullmq'
    });

    if (!this.redisAvailable) {
      throw new Error('BullMQ not available - Redis not connected');
    }

    const queue = this.getQueue(jobName);
    if (!queue) {
      throw new Error(`Failed to create queue for job: ${jobName}`);
    }

    try {
      // Configure retry options based on job type
      let jobOptions = {
        removeOnComplete: 100,
        removeOnFail: 50
      };

      if (jobName === 'SEND_WHATSAPP_MESSAGE') {
        // Apply retry configuration for WhatsApp jobs with exponential backoff
        jobOptions = {
          ...jobOptions,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 10000 // 10 seconds base delay
          }
        };
      }

      const job = await queue.add(
        jobName,
        {
          payload,
          context
        },
        jobOptions
      );

      this.logger.info('Job enqueued successfully', {
        jobId: job.id,
        jobName,
        correlationId
      });
      
      logger.info('queue_enqueue_exit', {
        level: 'info',
        component: 'bullmqQueue',
        event: 'queue_enqueue_exit',
        timestamp: new Date().toISOString(),
        context: { correlationId, jobId: job.id, jobName, outcome: 'success', reason: 'job_enqueued' }
      });

      return job;
    } catch (error) {
      this.logger.error('Failed to enqueue job', {
        jobName,
        correlationId,
        errorMessage: error.message,
        errorCategory: 'queue_enqueue'
      });
      
      logger.info('queue_enqueue_exit', {
        level: 'info',
        component: 'bullmqQueue',
        event: 'queue_enqueue_exit',
        timestamp: new Date().toISOString(),
        context: { correlationId, jobName, outcome: 'failed', reason: 'enqueue_failed' }
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

    if (!this.redisAvailable) {
      this.logger.warn('Cannot register worker - Redis not connected', {
        jobName
      });
      return;
    }

    // Create worker if not exists
    if (!this.workers.has(jobName)) {
      const worker = new Worker(
        jobName,
        async (job) => {
          const { payload, context } = job.data;
          const { correlationId } = context;

          logger.info('queue_worker_entry', {
            level: 'info',
            component: 'bullmqQueue',
            event: 'queue_worker_entry',
            timestamp: new Date().toISOString(),
            context: { correlationId, jobId: job.id, jobName }
          });

          this.logger.info('Processing job', {
            jobId: job.id,
            jobName,
            correlationId
          });

          try {
            const handler = this.handlers.get(jobName);
            if (!handler) {
              throw new Error(`No handler registered for job: ${jobName}`);
            }

            await handler(payload, context);
            
            this.logger.info('Job processed successfully', {
              jobId: job.id,
              jobName,
              correlationId
            });
            
            logger.info('queue_worker_exit', {
              level: 'info',
              component: 'bullmqQueue',
              event: 'queue_worker_exit',
              timestamp: new Date().toISOString(),
              context: { correlationId, jobId: job.id, jobName, outcome: 'success', reason: 'job_completed' }
            });
          } catch (error) {
            this.logger.error('Job processing failed', {
              jobId: job.id,
              jobName,
              correlationId,
              errorMessage: error.message,
              errorCategory: 'job_execution'
            });
            
            logger.info('queue_worker_exit', {
              level: 'info',
              component: 'bullmqQueue',
              event: 'queue_worker_exit',
              timestamp: new Date().toISOString(),
              context: { correlationId, jobId: job.id, jobName, outcome: 'failed', reason: 'execution_error' }
            });
            
            throw error;
          }
        },
        {
          connection: getClient(),
          concurrency: 1 // Process jobs one at a time
        }
      );

      // Log worker events
      worker.on('ready', () => {
        this.logger.info('Worker ready', {
          jobName
        });
      });

      worker.on('error', (error) => {
        this.logger.error('Worker error', {
          jobName,
          errorMessage: error.message
        });
      });

      this.workers.set(jobName, worker);
    }

    this.logger.info('Handler registered', {
      jobName,
      queueType: 'bullmq'
    });
  }

  /**
   * Check if async processing is enabled
   * @returns {boolean} Async enabled status
   */
  isAsyncEnabled() {
    return this.redisAvailable;
  }

  /**
   * Get failed jobs from a specific queue
   * @param {string} jobName - Name of the job/queue
   * @param {number} limit - Maximum number of jobs to return
   * @returns {Promise<Array>} Array of failed job objects
   */
  async getFailedJobs(jobName, limit = 50) {
    if (!this.redisAvailable) {
      throw new Error('BullMQ not available - Redis not connected');
    }

    const queue = this.getQueue(jobName);
    if (!queue) {
      return [];
    }

    try {
      const failedJobs = await queue.getJobs(['failed'], 0, limit - 1, true);
      return failedJobs;
    } catch (error) {
      this.logger.error('Failed to get failed jobs', {
        jobName,
        limit,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Close all queues and workers
   */
  async close() {
    const closePromises = [];

    // Close workers first
    for (const [jobName, worker] of this.workers) {
      closePromises.push(
        worker.close().catch((error) => {
          this.logger.error('Error closing worker', {
            jobName,
            error: error.message
          });
        })
      );
    }

    // Close queues
    for (const [jobName, queue] of this.queues) {
      closePromises.push(
        queue.close().catch((error) => {
          this.logger.error('Error closing queue', {
            jobName,
            error: error.message
          });
        })
      );
    }

    try {
      await Promise.all(closePromises);
      this.logger.info('BullMQ queues and workers closed');
    } catch (error) {
      this.logger.error('Error closing BullMQ resources', {
        error: error.message
      });
    }
  }
}

module.exports = BullMQQueue;
