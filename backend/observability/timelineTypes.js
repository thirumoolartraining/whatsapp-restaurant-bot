/**
 * Phase 5.2: Timeline Reconstruction Engine - Timeline Types
 * 
 * This file defines the timeline step structure and related types.
 * It is a read-only formalization layer that does not change runtime behavior.
 */

/**
 * Timeline Phase Enumeration
 * 
 * Represents the high-level phase of system execution.
 * Deterministically mapped from eventName via explicit mapping table.
 */
const PHASES = {
  INGRESS: 'ingress',
  ROUTING: 'routing',
  DOMAIN: 'domain',
  WORKER: 'worker',
  RETRY: 'retry',
  THROTTLE: 'throttle',
  TERMINAL: 'terminal',
  UNKNOWN: 'unknown'
};

/**
 * Timeline Outcome Enumeration
 * 
 * Represents the outcome of a timeline step.
 * Derived from event level and payload taxonomy when present.
 */
const OUTCOMES = {
  SUCCESS: 'success',
  FAILED: 'failed',
  RETRIED: 'retried',
  THROTTLED: 'throttled',
  DEADLETTERED: 'deadlettered',
  UNKNOWN: 'unknown'
};

/**
 * Timeline Step Structure
 * 
 * Represents a single step in the reconstructed timeline.
 * No free text explanations, no stack traces, no derived assumptions.
 */
class TimelineStep {
  constructor({
    index,
    timestamp,
    eventName,
    component,
    phase,
    outcome,
    reason,
    entityRefs,
    rawEventRef
  }) {
    this.index = index;
    this.timestamp = timestamp;
    this.eventName = eventName;
    this.component = component;
    this.phase = phase;
    this.outcome = outcome;
    this.reason = reason;
    this.entityRefs = entityRefs;
    this.rawEventRef = rawEventRef;
  }

  /**
   * Validate timeline step structure
   */
  validate() {
    if (typeof this.index !== 'number' || this.index < 0) {
      throw new Error('Invalid index: must be non-negative number');
    }

    if (!this.timestamp) {
      throw new Error('Missing required field: timestamp');
    }

    if (!this.eventName) {
      throw new Error('Missing required field: eventName');
    }

    if (!this.component) {
      throw new Error('Missing required field: component');
    }

    if (!Object.values(PHASES).includes(this.phase)) {
      throw new Error(`Invalid phase: ${this.phase}. Must be one of: ${Object.values(PHASES).join(', ')}`);
    }

    if (!Object.values(OUTCOMES).includes(this.outcome)) {
      throw new Error(`Invalid outcome: ${this.outcome}. Must be one of: ${Object.values(OUTCOMES).join(', ')}`);
    }

    return true;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    const result = {
      index: this.index,
      timestamp: this.timestamp,
      eventName: this.eventName,
      component: this.component,
      phase: this.phase,
      outcome: this.outcome
    };

    // Add optional fields only if present
    if (this.reason) result.reason = this.reason;
    if (this.entityRefs) result.entityRefs = this.entityRefs;
    if (this.rawEventRef) result.rawEventRef = this.rawEventRef;

    return result;
  }
}

/**
 * Timeline Metadata Structure
 * 
 * Represents metadata about the reconstructed timeline including gap detection.
 */
class TimelineMetadata {
  constructor({
    correlationId,
    totalSteps,
    startTime,
    endTime,
    gapDetected,
    gapReason,
    missingPhases,
    version
  }) {
    this.correlationId = correlationId;
    this.totalSteps = totalSteps;
    this.startTime = startTime;
    this.endTime = endTime;
    this.gapDetected = gapDetected || false;
    this.gapReason = gapReason;
    this.missingPhases = missingPhases || [];
    this.version = version || '1.0.0';
  }

  /**
   * Convert to plain object
   */
  toObject() {
    const result = {
      correlationId: this.correlationId,
      totalSteps: this.totalSteps,
      startTime: this.startTime,
      endTime: this.endTime,
      gapDetected: this.gapDetected,
      version: this.version
    };

    // Add optional fields only if present
    if (this.gapReason) result.gapReason = this.gapReason;
    if (this.missingPhases && this.missingPhases.length > 0) result.missingPhases = this.missingPhases;

    return result;
  }
}

/**
 * Complete Timeline Structure
 * 
 * Represents the full reconstructed timeline for a correlation ID.
 */
class Timeline {
  constructor({
    metadata,
    steps
  }) {
    this.metadata = metadata;
    this.steps = steps;
  }

  /**
   * Validate timeline structure
   */
  validate() {
    if (!this.metadata) {
      throw new Error('Missing required field: metadata');
    }

    if (!Array.isArray(this.steps)) {
      throw new Error('Invalid steps: must be an array');
    }

    // Validate each step
    this.steps.forEach((step, index) => {
      if (!(step instanceof TimelineStep)) {
        throw new Error(`Invalid step at index ${index}: must be TimelineStep instance`);
      }
      step.validate();
    });

    // Validate step indices are sequential
    for (let i = 0; i < this.steps.length; i++) {
      if (this.steps[i].index !== i) {
        throw new Error(`Invalid step index at position ${i}: expected ${i}, got ${this.steps[i].index}`);
      }
    }

    return true;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    return {
      metadata: this.metadata.toObject(),
      steps: this.steps.map(step => step.toObject())
    };
  }

  /**
   * Get step by index
   */
  getStep(index) {
    return this.steps.find(step => step.index === index);
  }

  /**
   * Get steps by phase
   */
  getStepsByPhase(phase) {
    return this.steps.filter(step => step.phase === phase);
  }

  /**
   * Get steps by outcome
   */
  getStepsByOutcome(outcome) {
    return this.steps.filter(step => step.outcome === outcome);
  }
}

module.exports = {
  // Enums
  PHASES,
  OUTCOMES,
  
  // Classes
  TimelineStep,
  TimelineMetadata,
  Timeline
};
