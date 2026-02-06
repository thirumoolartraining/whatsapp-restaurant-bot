/**
 * Phase 5.4: Throttle & Retry Visibility Engine - View Models
 * 
 * This file defines read-only view models for throttle and retry decisions.
 * These are pure data structures that do not change runtime behavior.
 */

/**
 * Throttle Decision View Model
 * 
 * Read-only representation of throttle evaluation and decision.
 * No free-text, no assumptions, no derived fairness judgments.
 */
class ThrottleDecisionView {
  constructor({
    evaluated,
    policyType,
    decision,
    delayMs,
    reason,
    eventRef
  }) {
    this.evaluated = evaluated;
    this.policyType = policyType;
    this.decision = decision;
    this.delayMs = delayMs;
    this.reason = reason;
    this.eventRef = eventRef;
  }

  /**
   * Validate throttle decision view structure
   */
  validate() {
    if (typeof this.evaluated !== 'boolean') {
      throw new Error('Invalid evaluated: must be boolean');
    }

    if (this.evaluated) {
      if (!this.policyType || !Object.values(POLICY_TYPES).includes(this.policyType)) {
        throw new Error(`Invalid policyType: ${this.policyType}. Must be one of: ${Object.values(POLICY_TYPES).join(', ')}`);
      }

      if (!this.decision || !Object.values(THROTTLE_DECISIONS).includes(this.decision)) {
        throw new Error(`Invalid decision: ${this.decision}. Must be one of: ${Object.values(THROTTLE_DECISIONS).join(', ')}`);
      }

      if (this.decision === THROTTLE_DECISIONS.DELAY && (typeof this.delayMs !== 'number' || this.delayMs < 0)) {
        throw new Error('Invalid delayMs: must be non-negative number when decision is delay');
      }
    }

    return true;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    const result = {
      evaluated: this.evaluated
    };

    if (this.evaluated) {
      result.policyType = this.policyType;
      result.decision = this.decision;
      if (this.delayMs !== null) result.delayMs = this.delayMs;
      if (this.reason) result.reason = this.reason;
      if (this.eventRef) result.eventRef = this.eventRef;
    }

    return result;
  }
}

/**
 * Retry Decision View Model
 * 
 * Read-only representation of retry attempts and terminal state.
 * No arithmetic guessing, attempts must match events.
 */
class RetryDecisionView {
  constructor({
    attempts,
    maxAttempts,
    retryScheduled,
    retryDelays,
    exhausted,
    deadlettered,
    terminalEventRef
  }) {
    this.attempts = attempts;
    this.maxAttempts = maxAttempts;
    this.retryScheduled = retryScheduled;
    this.retryDelays = retryDelays;
    this.exhausted = exhausted;
    this.deadlettered = deadlettered;
    this.terminalEventRef = terminalEventRef;
  }

  /**
   * Validate retry decision view structure
   */
  validate() {
    if (typeof this.attempts !== 'number' || this.attempts < 0) {
      throw new Error('Invalid attempts: must be non-negative number');
    }

    if (this.maxAttempts !== null && (typeof this.maxAttempts !== 'number' || this.maxAttempts < 0)) {
      throw new Error('Invalid maxAttempts: must be null or non-negative number');
    }

    if (typeof this.retryScheduled !== 'boolean') {
      throw new Error('Invalid retryScheduled: must be boolean');
    }

    if (this.retryDelays && !Array.isArray(this.retryDelays)) {
      throw new Error('Invalid retryDelays: must be array or null');
    }

    if (this.retryDelays) {
      this.retryDelays.forEach((delay, index) => {
        if (typeof delay !== 'number' || delay < 0) {
          throw new Error(`Invalid retry delay at index ${index}: must be non-negative number`);
        }
      });
    }

    if (typeof this.exhausted !== 'boolean') {
      throw new Error('Invalid exhausted: must be boolean');
    }

    if (typeof this.deadlettered !== 'boolean') {
      throw new Error('Invalid deadlettered: must be boolean');
    }

    // Deadletter implies terminal exhaustion
    if (this.deadlettered && !this.exhausted) {
      throw new Error('Invalid state: deadlettered implies exhausted must be true');
    }

    return true;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    const result = {
      attempts: this.attempts,
      retryScheduled: this.retryScheduled,
      exhausted: this.exhausted,
      deadlettered: this.deadlettered
    };

    if (this.maxAttempts !== null) result.maxAttempts = this.maxAttempts;
    if (this.retryDelays && this.retryDelays.length > 0) result.retryDelays = this.retryDelays;
    if (this.terminalEventRef) result.terminalEventRef = this.terminalEventRef;

    return result;
  }
}

/**
 * Throttle Policy Types Enumeration
 */
const POLICY_TYPES = {
  BROADCAST: 'broadcast',
  TRANSACTIONAL: 'transactional',
  BURST: 'burst',
  UNKNOWN: 'unknown'
};

/**
 * Throttle Decision Types Enumeration
 */
const THROTTLE_DECISIONS = {
  ALLOW: 'allow',
  DELAY: 'delay',
  SUPPRESS: 'suppress',
  SKIPPED: 'skipped'
};

/**
 * Retry Event Types Enumeration
 */
const RETRY_EVENT_TYPES = {
  RETRY_SCHEDULED: 'retry_scheduled',
  RETRY_ATTEMPT_STARTED: 'retry_attempt_started',
  RETRY_ATTEMPT_FAILED: 'retry_attempt_failed',
  RETRY_EXHAUSTED: 'retry_exhausted',
  JOB_DEADLETTERED: 'job_deadlettered'
};

module.exports = {
  // Enums
  POLICY_TYPES,
  THROTTLE_DECISIONS,
  RETRY_EVENT_TYPES,
  
  // Classes
  ThrottleDecisionView,
  RetryDecisionView
};
