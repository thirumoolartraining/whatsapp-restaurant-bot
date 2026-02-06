/**
 * Phase 5.3: Failure Narrative Engine - Failure Narrative Types
 * 
 * This file defines the failure narrative structure and related types.
 * It is a read-only formalization layer that does not change runtime behavior.
 */

/**
 * Finality Enumeration
 * 
 * Represents the finality state of a failure.
 * Deterministically derived from event taxonomy and timeline analysis.
 */
const FINALITY = {
  RETRYABLE: 'retryable',
  TERMINAL: 'terminal'
};

/**
 * Failure Narrative Structure
 * 
 * Represents a deterministic failure narrative derived from timeline events.
 * No free-text sentences, no stack traces, no human interpretation.
 * All fields must be provable from canonical events and timeline analysis.
 */
class FailureNarrative {
  constructor({
    failed,
    errorCategory,
    origin,
    finality,
    where,
    eventName,
    why,
    attempts,
    terminalEventRef
  }) {
    this.failed = failed;
    this.errorCategory = errorCategory;
    this.origin = origin;
    this.finality = finality;
    this.where = where;
    this.eventName = eventName;
    this.why = why;
    this.attempts = attempts;
    this.terminalEventRef = terminalEventRef;
  }

  /**
   * Validate failure narrative structure
   */
  validate() {
    if (typeof this.failed !== 'boolean') {
      throw new Error('Invalid failed: must be boolean');
    }

    if (this.failed) {
      if (!this.errorCategory) {
        throw new Error('Missing required field for failed narrative: errorCategory');
      }

      if (!this.origin) {
        throw new Error('Missing required field for failed narrative: origin');
      }

      if (!this.finality) {
        throw new Error('Missing required field for failed narrative: finality');
      }

      if (!Object.values(FINALITY).includes(this.finality)) {
        throw new Error(`Invalid finality: ${this.finality}. Must be one of: ${Object.values(FINALITY).join(', ')}`);
      }

      if (!this.where) {
        throw new Error('Missing required field for failed narrative: where');
      }

      if (!this.eventName) {
        throw new Error('Missing required field for failed narrative: eventName');
      }
    }

    if (this.attempts !== undefined && (typeof this.attempts !== 'number' || this.attempts < 0)) {
      throw new Error('Invalid attempts: must be non-negative number or undefined');
    }

    return true;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    const result = {
      failed: this.failed
    };

    // Add failure-specific fields only if failed
    if (this.failed) {
      result.errorCategory = this.errorCategory;
      result.origin = this.origin;
      result.finality = this.finality;
      result.where = this.where;
      result.eventName = this.eventName;

      // Add optional fields only if present
      if (this.why) result.why = this.why;
      if (this.attempts !== undefined) result.attempts = this.attempts;
      if (this.terminalEventRef) result.terminalEventRef = this.terminalEventRef;
    }

    return result;
  }
}

/**
 * Failure Event Reference Structure
 * 
 * Represents a reference to a specific failure-related event in the timeline.
 */
class FailureEventRef {
  constructor({
    index,
    timestamp,
    eventName,
    component,
    phase,
    outcome
  }) {
    this.index = index;
    this.timestamp = timestamp;
    this.eventName = eventName;
    this.component = component;
    this.phase = phase;
    this.outcome = outcome;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      index: this.index,
      timestamp: this.timestamp,
      eventName: this.eventName,
      component: this.component,
      phase: this.phase,
      outcome: this.outcome
    };
  }
}

module.exports = {
  // Enums
  FINALITY,
  
  // Classes
  FailureNarrative,
  FailureEventRef
};
