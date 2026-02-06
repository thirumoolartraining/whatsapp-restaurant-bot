/**
 * Send WhatsApp Message Worker
 * Phase 4.2: Async Infrastructure - Step 3 (Worker Infrastructure Introduction)
 * Phase 4.4: Step 3a - Broadcast Pacing Enforcement (Soft Activation)
 * 
 * Worker for processing SEND_WHATSAPP_MESSAGE and SEND_WHATSAPP_BROADCAST jobs.
 * Executes same handler as inProcessQueue while preserving correlationId.
 * Applies broadcast throttling for SEND_WHATSAPP_BROADCAST jobs only.
 */

const { Worker } = require('bullmq');
const { getClient } = require('../redisClient');
const { handler: sendWhatsAppMessageHandler } = require('../jobs/sendWhatsAppMessageJob');
const { shouldRetry, getBackoffMs, classifyRetryReason } = require('../retryPolicy');
const { shouldThrottle, getThrottleDelayMs, shouldApplyBurstGuardrail, getBurstDelayMs } = require('../throttlePolicy');
const { isBroadcastThrottleEnabled, isTransactionalThrottleEnabled, isBurstGuardrailEnabled } = require('../throttleActivation');
const Logger = require('../../logger');
const rateLimiter = require('../rateLimiter');

const logger = new Logger('sendWhatsAppWorker');

/**
 * SLA delay ceilings for different message types
 */
const SLA_DELAY_CEILINGS = {
  OTP: 2000,        // 2 seconds
  PAYMENT: 5000,    // 5 seconds
  ORDER_CONFIRMATION: 10000,  // 10 seconds
  DELIVERY_UPDATE: 15000       // 15 seconds
};

/**
 * Determines if a job is a transactional message
 * @param {Object} job - BullMQ job object
 * @returns {boolean} True if transactional message
 */
function isTransactionalMessage(job) {
  return job.name === 'SEND_WHATSAPP_MESSAGE';
}

/**
 * Extracts message type from payload for SLA ceiling determination
 * @param {Object} payload - Job payload
 * @returns {string|null} Message type or null if not identifiable
 */
function getMessageType(payload) {
  const { methodName } = payload;
  
  // Map method names to message types based on business logic
  if (methodName === 'sendSimpleTemplate') {
    // Check if template name indicates OTP (common pattern)
    const templateName = payload.args?.[0]?.templateName || '';
    if (templateName.toLowerCase().includes('otp')) {
      return 'OTP';
    }
  }
  
  if (methodName === 'sendOrder') {
    return 'ORDER_CONFIRMATION';
  }
  
  // Payment-related methods
  if (methodName.includes('payment') || methodName.includes('Payment')) {
    return 'PAYMENT';
  }
  
  // Delivery-related methods
  if (methodName.includes('delivery') || methodName.includes('Delivery')) {
    return 'DELIVERY_UPDATE';
  }
  
  return null;
}

/**
 * Gets SLA delay ceiling for message type
 * @param {string} messageType - Message type
 * @returns {number} Maximum delay in milliseconds
 */
function getSlaMaxDelay(messageType) {
  return SLA_DELAY_CEILINGS[messageType] || 10000; // Default to 10 seconds
}

/**
 * Sleep utility for pacing delays
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise} Promise that resolves after specified delay
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Create and start the send WhatsApp worker
 * @returns {Worker|null} Worker instance or null if Redis not available
 */
function createWorker() {
  if (!getClient()) {
    logger.warn('Redis not available - worker not started');
    return null;
  }

  const worker = new Worker(
    ['SEND_WHATSAPP_MESSAGE', 'SEND_WHATSAPP_BROADCAST'],
    async (job) => {
      const { payload, context } = job.data;
      const { correlationId } = context;
      const jobName = job.name;
      const attemptNumber = job.attemptsMade + 1;

      logger.info('worker_entry', {
        level: 'info',
        component: 'sendWhatsAppWorker',
        event: 'worker_entry',
        timestamp: new Date().toISOString(),
        context: { correlationId, jobId: job.id, jobName, attemptNumber }
      });

      logger.info('Processing WhatsApp job', {
        jobId: job.id,
        jobName,
        methodName: payload.methodName,
        outboundMessageId: payload.outboundMessageId,
        correlationId,
        attemptNumber,
        maxAttempts: job.opts.attempts || 1
      });

      // Apply burst guardrails for SEND_WHATSAPP_BROADCAST jobs only
      if (jobName === 'SEND_WHATSAPP_BROADCAST') {
        if (isBurstGuardrailEnabled()) {
          try {
            const batchSize = job.data?.batchSize || 1;
            const timeWindowMs = job.data?.timeWindowMs || 0;
            
            const burstGuardActive = shouldApplyBurstGuardrail({
              jobName,
              batchSize,
              timeWindowMs
            });
            
            if (burstGuardActive) {
              const delayMs = getBurstDelayMs({ batchSize });
              
              logger.info('broadcast_burst_throttled', {
                correlationId,
                jobId: job.id,
                jobName,
                batchSize,
                timeWindowMs,
                delayMs,
                throttleReason: 'burst_guardrail'
              });
              
              // Apply burst delay locally
              await sleep(delayMs);
            }
          } catch (burstError) {
            // Log burst guardrail error but continue execution
            logger.error('broadcast_burst_guardrail_error', {
              correlationId,
              jobId: job.id,
              jobName,
              errorMessage: burstError.message
            });
          }
        } else {
          // Log burst guardrail skipped due to activation disabled
          logger.info('burst_guardrail_skipped', {
            correlationId,
            jobId: job.id,
            jobName,
            reason: 'activation_disabled'
          });
        }
      }

      // Apply broadcast throttling for SEND_WHATSAPP_BROADCAST jobs only
      if (jobName === 'SEND_WHATSAPP_BROADCAST') {
        if (isBroadcastThrottleEnabled()) {
          try {
            const decision = shouldThrottle({
              jobName,
              attemptNumber,
              correlationId
            });

            if (decision.shouldThrottle) {
              const throttleDelayMs = getThrottleDelayMs({
                jobName,
                attemptNumber
              });

              logger.info('broadcast_throttled', {
                correlationId,
                jobId: job.id,
                jobName,
                attemptNumber,
                throttleDelayMs,
                reason: decision.reason
              });

              // Apply pacing delay
              await sleep(throttleDelayMs);
            }
          } catch (throttleError) {
            // Log throttle error but continue execution
            logger.error('broadcast_throttle_error', {
              correlationId,
              jobId: job.id,
              jobName,
              attemptNumber,
              errorMessage: throttleError.message
            });
          }
        } else {
          // Log broadcast throttling skipped due to activation disabled
          logger.info('broadcast_throttle_skipped', {
            correlationId,
            jobId: job.id,
            jobName,
            reason: 'activation_disabled'
          });
        }
      }

      // Apply transactional throttling for SEND_WHATSAPP_MESSAGE jobs only
      if (isTransactionalMessage(job)) {
        if (isTransactionalThrottleEnabled()) {
          try {
            const decision = shouldThrottle({
              jobName,
              attemptNumber,
              correlationId
            });

            if (decision.shouldThrottle) {
              const messageType = getMessageType(payload);
              const slaMaxDelayMs = getSlaMaxDelay(messageType);
              let throttleDelayMs = getThrottleDelayMs({
                jobName,
                attemptNumber
              });
              
              // Clamp delay to SLA ceiling
              const clamped = throttleDelayMs > slaMaxDelayMs;
              if (clamped) {
                throttleDelayMs = slaMaxDelayMs;
              }

              logger.info('transactional_throttled', {
                correlationId,
                jobId: job.id,
                jobName,
                messageType,
                throttleDelayMs,
                slaMaxDelayMs,
                clamped
              });

              // Apply pacing delay
              await sleep(throttleDelayMs);
            }
          } catch (throttleError) {
            // Log throttle error but continue execution (fail open)
            logger.error('throttle_error', {
              correlationId,
              jobId: job.id,
              jobName,
              attemptNumber,
              errorMessage: throttleError.message
            });
          }
        } else {
          // Log transactional throttling skipped due to activation disabled
          logger.info('transactional_throttle_skipped', {
            correlationId,
            jobId: job.id,
            jobName,
            reason: 'activation_disabled'
          });
        }
      }

      // Rate gate evaluation (observe-only) for all jobs
      let shouldThrottleRate = false;
      let delayMs = 0;
      let burstLimit = null;
      
      try {
        const tenantId = context.tenantId || null;
        
        shouldThrottleRate = rateLimiter.shouldThrottle({ jobName, tenantId, correlationId });
        delayMs = rateLimiter.getThrottleDelay({ jobName, tenantId });
        burstLimit = rateLimiter.getBurstLimit({ jobName, tenantId });
        
        // Emit structured rate gate evaluation log
        logger.info('rate_gate_evaluated', {
          correlationId,
          jobId: job.id,
          jobName,
          tenantId,
          shouldThrottle: shouldThrottleRate,
          delayMs,
          burstLimit,
          mode: 'observe_only'
        });
      } catch (rateError) {
        // Log rate gate error but continue execution
        logger.error('rate_gate_error', {
          correlationId,
          jobId: job.id,
          jobName,
          errorMessage: rateError.message
        });
      }

      try {
        // Execute the same handler as inProcessQueue
        const result = await sendWhatsAppMessageHandler(payload, context);

        logger.info('WhatsApp job completed successfully', {
          jobId: job.id,
          jobName,
          methodName: payload.methodName,
          outboundMessageId: payload.outboundMessageId,
          correlationId,
          attemptNumber,
          maxAttempts: job.opts.attempts || 1
        });

        logger.info('worker_exit', {
          level: 'info',
          component: 'sendWhatsAppWorker',
          event: 'worker_exit',
          timestamp: new Date().toISOString(),
          context: { correlationId, jobId: job.id, jobName, outcome: 'success', reason: 'job_completed' }
        });

        return result;
      } catch (error) {
        // Extract retry decision information
        const attemptNumber = job.attemptsMade + 1; // BullMQ provides attemptsMade, convert to 1-based
        const maxAttempts = job.opts.attempts || 1; // Read from job opts, default to 1
        
        // Extract error information for retry classification
        const errorCategory = error.errorCategory || null;
        const httpStatus = error.httpStatus || null;
        const errorCode = error.errorCode || null;
        
        // Make retry decision using policy
        const retryDecision = shouldRetry({
          errorCategory,
          httpStatus,
          errorCode,
          attemptNumber,
          maxAttempts
        });
        
        // Calculate next backoff for logging only
        const nextAttemptNumber = attemptNumber + 1;
        const nextBackoffMs = getBackoffMs(nextAttemptNumber);
        
        // Classify retry reason
        const reason = classifyRetryReason({
          errorCategory,
          shouldRetry: retryDecision,
          attemptNumber,
          maxAttempts
        });
        
        // Log structured retry decision event
        logger.info('retry_decision', {
          correlationId,
          jobId: job.id,
          jobName: job.name,
          attemptNumber,
          maxAttempts,
          errorCategory,
          httpStatus,
          errorCode,
          shouldRetry: retryDecision,
          reason,
          nextBackoffMs
        });

        // Enforce conditional retry logic
        if (errorCategory === 'policy') {
          // Force attempts to 1 for policy failures
          logger.warn('Policy failure - forcing no retry', {
            correlationId,
            jobId: job.id,
            errorCategory,
            errorMessage: error.message
          });
          
          // Update job options to prevent retry
          job.opts.attempts = attemptNumber; // Set current attempt as max
        }

        // Log retry scheduling if applicable
        if (retryDecision && nextAttemptNumber <= maxAttempts) {
          logger.info('job_retry_scheduled', {
            correlationId,
            jobId: job.id,
            jobName: job.name,
            attemptNumber: nextAttemptNumber,
            maxAttempts,
            nextBackoffMs,
            errorCategory
          });
        }

        // Check if this is the final failure (no more retries)
        const isFinalFailure = !retryDecision || nextAttemptNumber > maxAttempts;
        
        if (isFinalFailure) {
          // Emit structured deadletter log event
          logger.info('job_deadlettered', {
            correlationId,
            jobId: job.id,
            jobName: job.name,
            attemptNumber,
            maxAttempts,
            errorCategory,
            httpStatus,
            errorCode,
            reason,
            final: true
          });
        }

        logger.error('WhatsApp job failed', {
          jobId: job.id,
          jobName,
          methodName: payload.methodName,
          outboundMessageId: payload.outboundMessageId,
          errorMessage: error.message,
          correlationId,
          attemptNumber,
          maxAttempts,
          errorCategory,
          willRetry: retryDecision && nextAttemptNumber <= maxAttempts
        });
        
        logger.info('worker_exit', {
          level: 'info',
          component: 'sendWhatsAppWorker',
          event: 'worker_exit',
          timestamp: new Date().toISOString(),
          context: { 
            correlationId, 
            jobId: job.id, 
            jobName, 
            outcome: retryDecision && nextAttemptNumber <= maxAttempts ? 'retried' : 'failed', 
            reason: isFinalFailure ? 'final_failure' : 'retry_scheduled' 
          }
        });
        
        throw error;
      }
    },
    {
      connection: getClient(),
      concurrency: 1, // Process jobs one at a time
      settings: {
        stalledInterval: 30 * 1000, // 30 seconds
        maxStalledCount: 1
      }
    }
  );

  // Log worker events
  worker.on('ready', () => {
    logger.info('Send WhatsApp worker ready');
  });

  worker.on('active', (job) => {
    const { payload, context } = job.data;
    logger.info('Job active', {
      jobId: job.id,
      methodName: payload.methodName,
      outboundMessageId: payload.outboundMessageId,
      correlationId: context.correlationId
    });
  });

  worker.on('completed', (job) => {
    const { payload, context } = job.data;
    logger.info('Job completed', {
      jobId: job.id,
      methodName: payload.methodName,
      outboundMessageId: payload.outboundMessageId,
      correlationId: context.correlationId
    });
  });

  worker.on('failed', (job, error) => {
    const { payload, context } = job?.data || {};
    logger.error('Job failed', {
      jobId: job?.id,
      methodName: payload?.methodName,
      outboundMessageId: payload?.outboundMessageId,
      errorMessage: error.message,
      correlationId: context?.correlationId
    });
  });

  worker.on('error', (error) => {
    logger.error('Worker error', {
      errorMessage: error.message
    });
  });

  worker.on('stalled', (job) => {
    const { payload, context } = job?.data || {};
    logger.warn('Job stalled', {
      jobId: job?.id,
      methodName: payload?.methodName,
      outboundMessageId: payload?.outboundMessageId,
      correlationId: context?.correlationId
    });
  });

  return worker;
}

module.exports = {
  createWorker
};
