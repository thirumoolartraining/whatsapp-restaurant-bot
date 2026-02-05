const { logger } = require('../../config/logger');

/**
 * Determines if a job should be throttled based on rate limiting rules.
 * Step 1: Always returns false (no throttling active yet).
 * 
 * @param {Object} input - Input parameters
 * @param {string} input.jobName - Name of the job
 * @param {string|null} input.tenantId - Tenant identifier (nullable)
 * @param {string} input.correlationId - Correlation identifier for tracking
 * @returns {boolean} Always returns false in Step 1
 */
function shouldThrottle({ jobName, tenantId, correlationId }) {
  const throttle = false;
  const delayMs = 0;
  const burstLimit = getBurstLimitValue(jobName, tenantId);

  logger.info('rate_throttle_decision', {
    correlationId,
    jobName,
    tenantId,
    throttle,
    delayMs,
    burstLimit
  });

  return throttle;
}

/**
 * Calculates throttle delay for a job based on rate limiting rules.
 * Step 1: Always returns 0 (no delay enforcement yet).
 * 
 * @param {Object} input - Input parameters
 * @param {string} input.jobName - Name of the job
 * @param {string|null} input.tenantId - Tenant identifier (nullable)
 * @returns {number} Always returns 0 in Step 1
 */
function getThrottleDelay({ jobName, tenantId }) {
  const delayMs = 0;
  const burstLimit = getBurstLimitValue(jobName, tenantId);

  logger.info('rate_delay_calculated', {
    correlationId: null, // Not available in this function signature
    jobName,
    tenantId,
    throttle: false,
    delayMs,
    burstLimit
  });

  return delayMs;
}

/**
 * Retrieves burst limit for a job type.
 * Step 1: Returns static scaffold values for logging visibility only.
 * 
 * @param {Object} input - Input parameters
 * @param {string} input.jobName - Name of the job
 * @param {string|null} input.tenantId - Tenant identifier (nullable)
 * @returns {number} Static burst limit based on job type
 */
function getBurstLimit({ jobName, tenantId }) {
  const burstLimit = getBurstLimitValue(jobName, tenantId);

  logger.info('rate_burst_limit_read', {
    correlationId: null, // Not available in this function signature
    jobName,
    tenantId,
    throttle: false,
    delayMs: 0,
    burstLimit
  });

  return burstLimit;
}

/**
 * Helper function to get burst limit value based on job type.
 * 
 * @param {string} jobName - Name of the job
 * @param {string|null} tenantId - Tenant identifier (nullable)
 * @returns {number} Burst limit value
 */
function getBurstLimitValue(jobName, tenantId) {
  switch (jobName) {
    case 'SEND_WHATSAPP_MESSAGE':
      return 100;
    case 'SEND_WHATSAPP_BROADCAST':
      return 50;
    default:
      return 100;
  }
}

module.exports = {
  shouldThrottle,
  getThrottleDelay,
  getBurstLimit
};
