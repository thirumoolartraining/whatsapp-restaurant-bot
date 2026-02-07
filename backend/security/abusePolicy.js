/**
 * Abuse Policy
 * Phase 6.3: ABUSE CONSTRAINTS ENGINE
 * 
 * Single source of truth for abuse limits and constraints.
 * Denial-by-default: all actions must be explicitly allowed.
 */

const Logger = require('../services/logger');
const logger = new Logger('abusePolicy');

// Default abuse limits (configurable via environment)
const DEFAULT_ABUSE_LIMITS = {
  // Rate limits per phone number
  inbound_per_phone_per_minute: parseInt(process.env.ABUSE_INBOUND_PER_PHONE_PER_MINUTE) || 30,
  outbound_per_phone_per_minute: parseInt(process.env.ABUSE_OUTBOUND_PER_PHONE_PER_MINUTE) || 30,
  
  // Per-correlation limits (hard caps)
  interventions_per_correlation: parseInt(process.env.ABUSE_INTERVENTIONS_PER_CORRELATION) || 2,
  message_replays_per_correlation: parseInt(process.env.ABUSE_MESSAGE_REPLAYS_PER_CORRELATION) || 1,
  state_repairs_per_correlation: parseInt(process.env.ABUSE_STATE_REPAIRS_PER_CORRELATION) || 1,
  retry_overrides_per_correlation: parseInt(process.env.ABUSE_RETRY_OVERRIDES_PER_CORRELATION) || 1,
  
  // Lockout thresholds
  inbound_violations_for_lockout: parseInt(process.env.ABUSE_INBOUND_VIOLATIONS_FOR_LOCKOUT) || 3,
  lockout_duration_minutes: parseInt(process.env.ABUSE_LOCKOUT_DURATION_MINUTES) || 10
};

// High-risk actions that must fail closed when counters unavailable
const HIGH_RISK_ACTIONS = new Set([
  'ADMIN_INTERVENTION_EXECUTE',
  'MESSAGE_REPLAY',
  'STATE_REPAIR',
  'RETRY_OVERRIDE'
]);

/**
 * Get current abuse limits
 * @returns {Object} Current abuse limits configuration
 */
function getAbuseLimits() {
  return { ...DEFAULT_ABUSE_LIMITS };
}

/**
 * Validate abuse limits configuration
 * @param {Object} limits - Limits to validate
 * @returns {boolean} Whether limits are valid
 * @throws {Error} If limits are invalid
 */
function validateAbuseLimits(limits = {}) {
  const errors = [];
  
  // Validate each limit is a positive integer
  Object.entries(limits).forEach(([key, value]) => {
    if (!Number.isInteger(value) || value < 0) {
      errors.push(`Invalid limit for ${key}: must be non-negative integer, got ${value}`);
    }
  });
  
  // Validate specific constraints
  if (limits.interventions_per_correlation && limits.interventions_per_correlation < 1) {
    errors.push('interventions_per_correlation must be at least 1');
  }
  
  if (limits.message_replays_per_correlation && limits.message_replays_per_correlation < 1) {
    errors.push('message_replays_per_correlation must be at least 1');
  }
  
  if (limits.state_repairs_per_correlation && limits.state_repairs_per_correlation < 1) {
    errors.push('state_repairs_per_correlation must be at least 1');
  }
  
  if (limits.retry_overrides_per_correlation && limits.retry_overrides_per_correlation < 1) {
    errors.push('retry_overrides_per_correlation must be at least 1');
  }
  
  if (limits.inbound_violations_for_lockout && limits.inbound_violations_for_lockout < 1) {
    errors.push('inbound_violations_for_lockout must be at least 1');
  }
  
  if (limits.lockout_duration_minutes && limits.lockout_duration_minutes < 1) {
    errors.push('lockout_duration_minutes must be at least 1');
  }
  
  if (errors.length > 0) {
    const error = new Error(`Invalid abuse limits: ${errors.join(', ')}`);
    error.code = 'INVALID_ABUSE_LIMITS';
    error.errors = errors;
    throw error;
  }
  
  logger.info('Abuse limits validated', { limits });
  return true;
}

/**
 * Check if an action is high-risk (must fail closed)
 * @param {string} action - Action name to check
 * @returns {boolean} Whether the action is high-risk
 */
function isHighRiskAction(action) {
  return HIGH_RISK_ACTIONS.has(action);
}

/**
 * Get list of high-risk actions
 * @returns {string[]} Array of high-risk action names
 */
function getHighRiskActions() {
  return Array.from(HIGH_RISK_ACTIONS);
}

module.exports = {
  getAbuseLimits,
  validateAbuseLimits,
  isHighRiskAction,
  getHighRiskActions
};
