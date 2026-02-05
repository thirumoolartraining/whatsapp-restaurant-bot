/**
 * Throttle Policy for Broadcast and Transactional Pacing Enforcement
 * Phase 4.4: Step 3a - Broadcast Pacing Enforcement (Soft Activation)
 * Phase 4.4: Step 3b - Transactional Pacing Enforcement (Soft Activation)
 * 
 * Determines throttling behavior for broadcast and transactional jobs.
 * Both job types support soft activation for safe deployment.
 */

const Logger = require('../../logger');
const logger = new Logger('throttlePolicy');

/**
 * Determines if a job should be throttled based on policy rules.
 * Supports both SEND_WHATSAPP_BROADCAST and SEND_WHATSAPP_MESSAGE jobs.
 * 
 * @param {Object} input - Input parameters
 * @param {string} input.jobName - Name of the job
 * @param {number} input.attemptNumber - Current attempt number (1-based)
 * @param {string} input.correlationId - Correlation identifier for tracking
 * @returns {Object} Throttle decision object
 */
function shouldThrottle({ jobName, attemptNumber, correlationId }) {
  // Only throttle supported job types
  if (jobName !== 'SEND_WHATSAPP_BROADCAST' && jobName !== 'SEND_WHATSAPP_MESSAGE') {
    return {
      shouldThrottle: false,
      reason: 'unsupported_job_type'
    };
  }

  // For now, return false (soft activation) for both job types
  // This can be activated later by changing this condition
  const shouldThrottle = false;
  
  if (jobName === 'SEND_WHATSAPP_BROADCAST') {
    return {
      shouldThrottle,
      reason: shouldThrottle ? 'broadcast_pacing_active' : 'broadcast_pacing_inactive'
    };
  } else {
    // SEND_WHATSAPP_MESSAGE
    return {
      shouldThrottle,
      reason: shouldThrottle ? 'transactional_pacing_active' : 'transactional_pacing_inactive'
    };
  }
}

/**
 * Calculates throttle delay for broadcast and transactional jobs.
 * Applies to both SEND_WHATSAPP_BROADCAST and SEND_WHATSAPP_MESSAGE jobs.
 * 
 * @param {Object} input - Input parameters
 * @param {string} input.jobName - Name of the job
 * @param {number} input.attemptNumber - Current attempt number (1-based)
 * @returns {number} Delay in milliseconds
 */
function getThrottleDelayMs({ jobName, attemptNumber }) {
  // Only apply delay to supported job types
  if (jobName !== 'SEND_WHATSAPP_BROADCAST' && jobName !== 'SEND_WHATSAPP_MESSAGE') {
    return 0;
  }

  // Base delays for different job types
  let baseDelayMs;
  if (jobName === 'SEND_WHATSAPP_BROADCAST') {
    baseDelayMs = 1000; // 1 second base delay for broadcast
  } else {
    // SEND_WHATSAPP_MESSAGE
    baseDelayMs = 500; // 0.5 second base delay for transactional
  }
  
  // For now, return 0 (soft activation) for both job types
  // This can be activated later by returning actual delay
  return 0;
}

/**
 * Determines if burst guardrail should be applied for high-volume broadcast spikes
 * Applies ONLY to SEND_WHATSAPP_BROADCAST jobs
 * 
 * @param {Object} input - Input parameters
 * @param {string} input.jobName - Name of the job
 * @param {number} input.batchSize - Size of the batch
 * @param {number} input.timeWindowMs - Time window in milliseconds
 * @returns {boolean} True if burst guardrail should be applied
 */
function shouldApplyBurstGuardrail({ jobName, batchSize, timeWindowMs }) {
  const BURST_THRESHOLD = 100;
  const BURST_WINDOW_MS = 60000;

  if (jobName !== 'SEND_WHATSAPP_BROADCAST') return false;

  return batchSize > BURST_THRESHOLD && timeWindowMs < BURST_WINDOW_MS;
}

/**
 * Calculates burst delay proportional to burst magnitude
 * 
 * @param {Object} input - Input parameters
 * @param {number} input.batchSize - Size of the batch
 * @returns {number} Delay in milliseconds
 */
function getBurstDelayMs({ batchSize }) {
  if (batchSize > 500) return 5000;
  if (batchSize > 250) return 3000;
  if (batchSize > 100) return 1000;
  return 0;
}

module.exports = {
  shouldThrottle,
  getThrottleDelayMs,
  shouldApplyBurstGuardrail,
  getBurstDelayMs
};
