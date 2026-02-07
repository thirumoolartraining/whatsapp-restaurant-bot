/**
 * Abuse Guard
 * Phase 6.3: ABUSE CONSTRAINTS ENGINE
 * 
 * Central enforcement point for abuse constraints.
 * All abuse decisions must emit audit events.
 * Denies-by-default with fail-closed for high-risk actions.
 */

const Logger = require('../services/logger');
const { getAbuseLimits, isHighRiskAction } = require('./abusePolicy');
const { incrWindow, incrFixed, isStoreAvailable } = require('./abuseStore');

const logger = new Logger('abuseGuard');

// Abuse rule definitions
const ABUSE_RULES = {
  inbound_per_phone_per_minute: {
    type: 'windowed',
    windowMs: 60 * 1000, // 1 minute
    limitKey: 'inbound_per_phone_per_minute',
    highRisk: false
  },
  outbound_per_phone_per_minute: {
    type: 'windowed',
    windowMs: 60 * 1000, // 1 minute
    limitKey: 'outbound_per_phone_per_minute',
    highRisk: false
  },
  interventions_per_correlation: {
    type: 'fixed',
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    limitKey: 'interventions_per_correlation',
    highRisk: true
  },
  message_replays_per_correlation: {
    type: 'fixed',
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    limitKey: 'message_replays_per_correlation',
    highRisk: true
  },
  state_repairs_per_correlation: {
    type: 'fixed',
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    limitKey: 'state_repairs_per_correlation',
    highRisk: true
  },
  retry_overrides_per_correlation: {
    type: 'fixed',
    ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 days
    limitKey: 'retry_overrides_per_correlation',
    highRisk: true
  }
};

/**
 * Assert that an action is allowed under abuse constraints
 * @param {Object} params - Abuse assertion parameters
 * @param {string} params.rule - Abuse rule to check
 * @param {string} params.key - Unique key for counting (phone, correlationId, etc.)
 * @param {string} [params.correlationId] - Correlation ID for tracking
 * @param {string} [params.actor] - Actor performing the action
 * @param {Object} [params.context] - Additional context for audit
 * @throws {Error} If action is not allowed
 */
async function assertAbuseAllowed({ rule, key, correlationId, actor, context = {} }) {
  // Validate rule exists
  if (!ABUSE_RULES[rule]) {
    const error = new Error(`Unknown abuse rule: ${rule}`);
    error.code = 'UNKNOWN_ABUSE_RULE';
    emitAbuseAudit({
      eventType: 'abuse_denied',
      rule,
      key,
      correlationId,
      actor,
      reason: 'UNKNOWN_RULE',
      context
    });
    throw error;
  }
  
  const ruleConfig = ABUSE_RULES[rule];
  const limits = getAbuseLimits();
  const limit = limits[ruleConfig.limitKey];
  
  if (!limit || limit < 0) {
    const error = new Error(`Invalid limit for rule ${rule}: ${limit}`);
    error.code = 'INVALID_ABUSE_LIMIT';
    emitAbuseAudit({
      eventType: 'abuse_denied',
      rule,
      key,
      correlationId,
      actor,
      limit,
      reason: 'INVALID_LIMIT',
      context
    });
    throw error;
  }
  
  try {
    let result;
    
    // Increment counter based on rule type
    if (ruleConfig.type === 'windowed') {
      result = await incrWindow(key, ruleConfig.windowMs, limit);
    } else if (ruleConfig.type === 'fixed') {
      result = await incrFixed(key, ruleConfig.ttlMs, limit);
    } else {
      const error = new Error(`Unknown rule type: ${ruleConfig.type}`);
      error.code = 'UNKNOWN_RULE_TYPE';
      emitAbuseAudit({
        eventType: 'abuse_denied',
        rule,
        key,
        correlationId,
        actor,
        reason: 'UNKNOWN_RULE_TYPE',
        context
      });
      throw error;
    }
    
    // Check if action is allowed
    if (!result.allowed) {
      const error = new Error(`Abuse limit exceeded for ${rule}`);
      error.code = 'ABUSE_LIMIT_EXCEEDED';
      error.rule = rule;
      error.key = key;
      error.limit = limit;
      error.remaining = result.remaining;
      
      if (result.resetAt) {
        error.resetAt = result.resetAt;
      }
      
      emitAbuseAudit({
        eventType: 'abuse_denied',
        rule,
        key,
        correlationId,
        actor,
        limit,
        remaining: result.remaining,
        resetAt: result.resetAt,
        reason: 'LIMIT_EXCEEDED',
        context
      });
      
      // Check if this is an inbound violation that should trigger lockout
      if (rule === 'inbound_per_phone_per_minute') {
        await checkAndApplyLockout(key, correlationId, actor);
      }
      
      throw error;
    }
    
    // Emit audit event for allowed action (recommended for interventions)
    if (ruleConfig.highRisk || rule.includes('intervention')) {
      emitAbuseAudit({
        eventType: 'abuse_allowed',
        rule,
        key,
        correlationId,
        actor,
        limit,
        remaining: result.remaining,
        resetAt: result.resetAt,
        reason: 'ALLOWED',
        context
      });
    }
    
    return result;
    
  } catch (error) {
    // Handle store unavailability for high-risk actions
    if (error.message === 'COUNTER_UNAVAILABLE_FAIL_CLOSED' && ruleConfig.highRisk) {
      const failClosedError = new Error(`Abuse check failed closed for high-risk action ${rule}`);
      failClosedError.code = 'ABUSE_FAIL_CLOSED';
      failClosedError.rule = rule;
      failClosedError.key = key;
      failClosedError.originalError = error.message;
      
      emitAbuseAudit({
        eventType: 'abuse_denied',
        rule,
        key,
        correlationId,
        actor,
        reason: 'COUNTER_UNAVAILABLE_FAIL_CLOSED',
        context: {
          ...context,
          originalError: error.message
        }
      });
      
      throw failClosedError;
    }
    
    // Re-throw other errors
    throw error;
  }
}

/**
 * Check if a phone is currently locked out
 * @param {string} phone - Phone number to check
 * @returns {Promise<boolean>} Whether phone is locked
 */
async function isPhoneLocked(phone) {
  try {
    const lockKey = `abuse_lock:${phone}`;
    const lockValue = await get(lockKey);
    return lockValue !== null;
  } catch (error) {
    logger.warn('Failed to check phone lock status', { phone, error: error.message });
    // If we can't check lock status, assume not locked for availability
    return false;
  }
}

/**
 * Lock a phone number for abuse violations
 * @param {string} phone - Phone number to lock
 * @param {number} durationMinutes - Lock duration in minutes
 * @param {string} [correlationId] - Correlation ID for tracking
 * @param {string} [actor] - Actor performing the lock
 * @returns {Promise<Object>} Lock result
 */
async function lockPhone(phone, durationMinutes, correlationId = null, actor = 'system') {
  try {
    const limits = getAbuseLimits();
    const ttlMs = durationMinutes * 60 * 1000;
    const lockKey = `abuse_lock:${phone}`;
    
    const result = await incrFixed(lockKey, ttlMs, 1);
    
    emitAbuseAudit({
      eventType: 'abuse_locked',
      rule: 'phone_lockout',
      key: phone,
      correlationId,
      actor,
      limit: 1,
      remaining: result.remaining,
      reason: 'VIOLATION_THRESHOLD_EXCEEDED',
      context: {
        durationMinutes,
        ttlMs
      }
    });
    
    logger.info('Phone locked for abuse violations', { phone, durationMinutes, correlationId });
    
    return result;
  } catch (error) {
    logger.error('Failed to lock phone', { phone, durationMinutes, error: error.message });
    throw error;
  }
}

/**
 * Get abuse counter value for monitoring
 * @param {string} rule - Abuse rule
 * @param {string} key - Counter key
 * @returns {Promise<number|null>} Counter value or null
 */
async function getAbuseCounter(rule, key) {
  try {
    const ruleConfig = ABUSE_RULES[rule];
    if (!ruleConfig) {
      return null;
    }
    
    if (ruleConfig.type === 'windowed') {
      const now = Date.now();
      const windowStart = now - (now % ruleConfig.windowMs);
      const windowKey = `${key}:${windowStart}`;
      return await get(windowKey);
    } else {
      return await get(key);
    }
  } catch (error) {
    logger.warn('Failed to get abuse counter', { rule, key, error: error.message });
    return null;
  }
}

/**
 * Check if phone should be locked due to repeated violations and apply lockout
 * @param {string} phone - Phone number to check
 * @param {string} correlationId - Correlation ID for tracking
 * @param {string} actor - Actor performing the action
 */
async function checkAndApplyLockout(phone, correlationId, actor) {
  try {
    const limits = getAbuseLimits();
    const violationThreshold = limits.inbound_violations_for_lockout;
    const lockoutDuration = limits.lockout_duration_minutes;
    
    // Track violations in a separate counter for lockout decisions
    const violationKey = `abuse_violations:${phone}`;
    const violationResult = await incrFixed(violationKey, 10 * 60 * 1000, violationThreshold); // 10-minute window
    
    // If this violation reaches the threshold, apply lockout
    if (!violationResult.allowed && violationResult.remaining === 0) {
      await lockPhone(phone, lockoutDuration, correlationId, actor);
    }
  } catch (error) {
    logger.warn('Failed to check/apply lockout', { phone, error: error.message });
    // Don't fail the abuse check if lockout logic fails
  }
}

/**
 * Emit audit events for abuse assertions
 * @param {Object} auditData - Audit event data
 */
function emitAbuseAudit({ eventType, rule, key, correlationId, actor, limit, remaining, resetAt, reason, context }) {
  const auditEvent = {
    level: eventType === 'abuse_denied' || eventType === 'abuse_locked' ? 'warn' : 'info',
    component: 'abuseGuard',
    event: eventType,
    timestamp: new Date().toISOString(),
    context: {
      rule,
      key,
      correlationId,
      actor,
      limit,
      remaining,
      resetAt,
      reason,
      ...context
    }
  };
  
  if (eventType === 'abuse_denied' || eventType === 'abuse_locked') {
    logger.warn(eventType, auditEvent);
  } else {
    logger.info(eventType, auditEvent);
  }
}

// Import get function from abuseStore
const { get } = require('./abuseStore');

module.exports = {
  assertAbuseAllowed,
  isPhoneLocked,
  lockPhone,
  getAbuseCounter
};
