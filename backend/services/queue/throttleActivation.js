/**
 * Throttle Activation Controls
 * Phase 4.4: Step 4 - Environment-driven Activation Controls
 * 
 * Pure functions for environment-driven activation of throttling features.
 * All functions treat missing environment variables as FALSE (disabled).
 * Only exact string "true" enables a feature.
 */

/**
 * Determines if broadcast throttling is enabled via environment
 * @returns {boolean} True if broadcast throttling is enabled
 */
function isBroadcastThrottleEnabled() {
  return process.env.THROTTLE_BROADCAST_ENABLED === 'true';
}

/**
 * Determines if transactional throttling is enabled via environment
 * @returns {boolean} True if transactional throttling is enabled
 */
function isTransactionalThrottleEnabled() {
  return process.env.THROTTLE_TRANSACTIONAL_ENABLED === 'true';
}

/**
 * Determines if burst guardrails are enabled via environment
 * @returns {boolean} True if burst guardrails are enabled
 */
function isBurstGuardrailEnabled() {
  return process.env.THROTTLE_BURST_ENABLED === 'true';
}

module.exports = {
  isBroadcastThrottleEnabled,
  isTransactionalThrottleEnabled,
  isBurstGuardrailEnabled
};
