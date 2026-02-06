/**
 * Phase 5.3: Failure Narrative Engine - Failure Narrative Builder
 * 
 * This file implements the deterministic failure narrative builder.
 * It is a read-only derivation layer that does not change runtime behavior.
 */

const { FINALITY, FailureNarrative, FailureEventRef } = require('./failureNarrativeTypes');
const { 
  selectFailureEvents, 
  selectTerminalFailures, 
  selectRetryEvents,
  getLastTerminalFailure,
  isFailureEvent,
  isTerminalFailure
} = require('./failureEventSelector');

/**
 * Extract error category from timeline step
 * 
 * Derives error category from payload taxonomy and event characteristics.
 * No inference, only extraction of structured data.
 * 
 * @param {Object} timelineStep - Timeline step to analyze
 * @returns {string|null} Error category or null if not found
 */
function extractErrorCategory(timelineStep) {
  if (!timelineStep) {
    return null;
  }

  // Check payload for explicit error category
  if (timelineStep.reason && timelineStep.reason.errorCategory) {
    return timelineStep.reason.errorCategory;
  }

  // Check entity refs for error category
  if (timelineStep.entityRefs && timelineStep.entityRefs.errorCategory) {
    return timelineStep.entityRefs.errorCategory;
  }

  // Derive from event name patterns (explicit mapping only)
  const eventName = timelineStep.eventName;
  const safeEventName = typeof eventName === 'string' ? eventName : '';
  
  if (safeEventName.includes('validation') || safeEventName.includes('invalid') || safeEventName.includes('malformed')) {
    return 'validation';
  }
  
  if (safeEventName.includes('provider') || safeEventName.includes('api') || safeEventName.includes('webhook')) {
    return 'provider';
  }
  
  if (safeEventName.includes('authentication') || safeEventName.includes('authorization')) {
    return 'authentication';
  }
  
  if (safeEventName.includes('rate_limit') || safeEventName.includes('throttle')) {
    return 'rate_limit';
  }
  
  if (safeEventName.includes('timeout')) {
    return 'timeout';
  }
  
  if (safeEventName.includes('retry') || safeEventName.includes('exhausted')) {
    return 'retry';
  }
  
  if (safeEventName.includes('deadletter')) {
    return 'deadletter';
  }
  
  // Default to 'unknown' if no specific category can be determined
  return 'unknown';
}

/**
 * Extract origin from timeline step
 * 
 * Origin is the component that emitted the failure event.
 * 
 * @param {Object} timelineStep - Timeline step to analyze
 * @returns {string|null} Origin component or null if not found
 */
function extractOrigin(timelineStep) {
  if (!timelineStep) {
    return null;
  }

  return timelineStep.component || null;
}

/**
 * Determine finality from failure events and retry history
 * 
 * @param {Array} failureEvents - Array of failure events
 * @param {Array} retryEvents - Array of retry events
 * @param {Object} terminalFailure - Last terminal failure event
 * @returns {string} Finality value from FINALITY enum
 */
function determineFinality(failureEvents, retryEvents, terminalFailure) {
  // If there's a terminal failure, it's always terminal
  if (terminalFailure) {
    return FINALITY.TERMINAL;
  }

  // If there are retry events but no terminal failure, it's retryable
  if (retryEvents && retryEvents.length > 0) {
    return FINALITY.RETRYABLE;
  }

  // If there are failure events but no retries or terminal, assume retryable
  if (failureEvents && failureEvents.length > 0) {
    return FINALITY.RETRYABLE;
  }

  // No failures means no finality needed
  return null;
}

/**
 * Extract structured why from timeline step
 * 
 * Only extracts structured data from payload and reason fields.
 * No free text, no interpretation.
 * 
 * @param {Object} timelineStep - Timeline step to analyze
 * @returns {Object|null} Structured why object or null
 */
function extractWhy(timelineStep) {
  if (!timelineStep) {
    return null;
  }

  const why = {};

  // Extract from reason field
  if (timelineStep.reason) {
    Object.assign(why, timelineStep.reason);
  }

  // Extract from entity refs
  if (timelineStep.entityRefs) {
    // Only include structured error-related fields
    ['errorCode', 'errorCategory', 'provider', 'providerMessageId', 'retryCount', 'maxRetries'].forEach(field => {
      if (timelineStep.entityRefs[field] !== undefined) {
        why[field] = timelineStep.entityRefs[field];
      }
    });
  }

  // Extract from payload if available
  if (timelineStep.rawEventRef && timelineStep.rawEventRef.payload) {
    const payload = timelineStep.rawEventRef.payload;
    
    // Only include structured fields
    ['errorCode', 'errorCategory', 'errorMessage', 'retryAttempt', 'maxRetries', 'throttleReason'].forEach(field => {
      if (payload[field] !== undefined) {
        why[field] = payload[field];
      }
    });
  }

  return Object.keys(why).length > 0 ? why : null;
}

/**
 * Count retry attempts from retry events and failure events
 * 
 * @param {Array} retryEvents - Array of retry events
 * @param {Array} failureEvents - Array of failure events (to catch retry_exhausted)
 * @returns {number|null} Number of retry attempts or null
 */
function countRetryAttempts(retryEvents, failureEvents) {
  if (!retryEvents && !failureEvents) {
    return null;
  }

  let maxRetryCount = 0;
  let maxRetryAttempt = 0;
  
  // Check retry events for explicit retry counts
  if (retryEvents) {
    retryEvents.forEach(event => {
      if (event.reason) {
        if (event.reason.retryCount !== undefined) {
          maxRetryCount = Math.max(maxRetryCount, event.reason.retryCount);
        }
        if (event.reason.retryAttempt !== undefined) {
          maxRetryAttempt = Math.max(maxRetryAttempt, event.reason.retryAttempt);
        }
      }
    });
  }

  // Check failure events for retry counts (e.g., retry_exhausted)
  if (failureEvents) {
    failureEvents.forEach(event => {
      if (event.reason) {
        if (event.reason.retryCount !== undefined) {
          maxRetryCount = Math.max(maxRetryCount, event.reason.retryCount);
        }
        if (event.reason.retryAttempt !== undefined) {
          maxRetryAttempt = Math.max(maxRetryAttempt, event.reason.retryAttempt);
        }
      }
    });
  }

  // Use the highest explicit retry count found
  if (maxRetryCount > 0) {
    return maxRetryCount;
  }
  
  if (maxRetryAttempt > 0) {
    return maxRetryAttempt;
  }

  // Fallback: Count unique retry events by event name
  if (retryEvents && retryEvents.length > 0) {
    const uniqueRetryEvents = new Set(retryEvents.map(event => event.eventName));
    return uniqueRetryEvents.size;
  }

  return null;
}

/**
 * Create terminal event reference from timeline step
 * 
 * @param {Object} timelineStep - Timeline step to reference
 * @returns {FailureEventRef|null} Terminal event reference or null
 */
function createTerminalEventRef(timelineStep) {
  if (!timelineStep) {
    return null;
  }

  return new FailureEventRef({
    index: timelineStep.index,
    timestamp: timelineStep.timestamp,
    eventName: timelineStep.eventName,
    component: timelineStep.component,
    phase: timelineStep.phase,
    outcome: timelineStep.outcome
  });
}

/**
 * Handle multiple failure events according to rules
 * 
 * Rules:
 * - Prefer terminal events over intermediate ones
 * - Preserve retry history in attempts
 * - Do NOT invent causality between failures
 * - Last terminal failure wins
 * - Earlier failures are context, not explanation
 * 
 * @param {Array} failureEvents - All failure events
 * @param {Array} terminalFailures - Terminal failure events
 * @param {Array} retryEvents - Retry events
 * @returns {Object} Object containing primaryFailure and context
 */
function handleMultipleFailures(failureEvents, terminalFailures, retryEvents) {
  // Rule: Last terminal failure wins
  if (terminalFailures && terminalFailures.length > 0) {
    const lastTerminalFailure = terminalFailures[terminalFailures.length - 1];
    
    return {
      primaryFailure: lastTerminalFailure,
      hasTerminalFailure: true,
      contextFailures: failureEvents ? failureEvents.filter(event => event.index !== lastTerminalFailure.index) : []
    };
  }

  // If no terminal failures, use the last failure event
  if (failureEvents && failureEvents.length > 0) {
    const lastFailure = failureEvents[failureEvents.length - 1];
    
    return {
      primaryFailure: lastFailure,
      hasTerminalFailure: false,
      contextFailures: failureEvents.filter(event => event.index !== lastFailure.index)
    };
  }

  // No failures found
  return {
    primaryFailure: null,
    hasTerminalFailure: false,
    contextFailures: []
  };
}

/**
 * Build Failure Narrative (CORE)
 * 
 * This function consumes timeline output from Phase 5.2 and produces a deterministic
 * failure narrative that answers:
 * - Did the system fail?
 * - Where did it fail?
 * - Why did it fail?
 * - Was the outcome retryable or terminal?
 * - Was the final decision correct per rules?
 * 
 * All answers are provable from events and timeline analysis.
 * 
 * @param {Object} timeline - Timeline object from Phase 5.2
 * @returns {FailureNarrative} Deterministic failure narrative
 */
function buildFailureNarrative(timeline) {
  // Input validation
  if (!timeline || !timeline.steps || !Array.isArray(timeline.steps)) {
    throw new Error('Invalid timeline: must have steps array');
  }

  const steps = timeline.steps;

  // Select failure-relevant events
  const failureEvents = selectFailureEvents(steps);
  const terminalFailures = selectTerminalFailures(steps);
  const retryEvents = selectRetryEvents(steps);

  // Determine if failure occurred
  const failed = failureEvents.length > 0;

  // If no failure occurred, return simple success narrative
  if (!failed) {
    return new FailureNarrative({
      failed: false
    });
  }

  // Handle multiple failures according to rules
  const failureAnalysis = handleMultipleFailures(failureEvents, terminalFailures, retryEvents);
  const primaryFailureEvent = failureAnalysis.primaryFailure;

  // Extract taxonomy fields from primary failure
  const errorCategory = extractErrorCategory(primaryFailureEvent);
  const origin = extractOrigin(primaryFailureEvent);
  const finality = determineFinality(failureEvents, retryEvents, terminalFailures.length > 0 ? terminalFailures[terminalFailures.length - 1] : null);
  const where = primaryFailureEvent.component;
  const eventName = primaryFailureEvent.eventName;
  const why = extractWhy(primaryFailureEvent);
  const attempts = countRetryAttempts(retryEvents, failureEvents);
  const terminalEventRef = createTerminalEventRef(failureAnalysis.hasTerminalFailure && terminalFailures.length > 0 ? terminalFailures[terminalFailures.length - 1] : null);

  // Build and return failure narrative
  return new FailureNarrative({
    failed: true,
    errorCategory,
    origin,
    finality,
    where,
    eventName,
    why,
    attempts,
    terminalEventRef
  });
}

module.exports = {
  // Core function
  buildFailureNarrative,
  
  // Utility functions (exported for testing)
  extractErrorCategory,
  extractOrigin,
  determineFinality,
  extractWhy,
  countRetryAttempts,
  createTerminalEventRef,
  handleMultipleFailures
};
