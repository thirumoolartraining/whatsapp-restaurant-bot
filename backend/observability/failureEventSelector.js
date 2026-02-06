/**
 * Phase 5.3: Failure Narrative Engine - Failure Event Selector
 * 
 * This file implements pure selector functions to identify failure-relevant events.
 * It is a read-only selection layer that does not change runtime behavior.
 */

const { OUTCOMES } = require('./timelineTypes');

/**
 * Explicit Failure Event Name Patterns
 * 
 * These are the exact event names that indicate failure conditions.
 * No inference, no guessing, no dynamic pattern matching.
 */
const FAILURE_EVENT_NAMES = new Set([
  // Terminal failures
  'job_deadlettered',
  'processing_failed',
  'error_occurred',
  'workflow_failed',
  
  // Retry-related failures
  'retry_exhausted',
  'retry_failed',
  
  // Provider failures
  'provider_rejection',
  'provider_error',
  'provider_timeout',
  
  // Validation failures
  'validation_failed',
  'schema_validation_failed',
  'authentication_failed',
  'authorization_failed',
  
  // Communication failures
  'message_send_failed',
  'template_send_failed',
  'api_call_failed',
  'webhook_failed',
  
  // Domain-specific failures
  'customer_sync_error',
  'payment_failed',
  'order_processing_failed',
  'broadcast_error'
]);

/**
 * Retry Event Name Patterns
 * 
 * These are the exact event names that indicate retry attempts.
 */
const RETRY_EVENT_NAMES = new Set([
  'retry_scheduled',
  'retry_attempted',
  'retry_backoff_started'
]);

/**
 * Deadletter Event Name Patterns
 * 
 * These are the exact event names that indicate deadletter emission.
 */
const DEADLETTER_EVENT_NAMES = new Set([
  'job_deadlettered',
  'message_deadlettered',
  'workflow_deadlettered'
]);

/**
 * Check if an event is a failure event
 * 
 * Uses explicit eventName matching only.
 * Does NOT infer failure from absence of success.
 * 
 * @param {Object} timelineStep - Timeline step to check
 * @returns {boolean} True if the event represents a failure
 */
function isFailureEvent(timelineStep) {
  if (!timelineStep || !timelineStep.eventName) {
    return false;
  }

  // Explicit event name matching
  if (FAILURE_EVENT_NAMES.has(timelineStep.eventName)) {
    return true;
  }

  // Check outcome for explicit failure indicators
  if (timelineStep.outcome === OUTCOMES.FAILED || 
      timelineStep.outcome === OUTCOMES.DEADLETTERED) {
    return true;
  }

  // Check event level for explicit error (only if outcome is not set)
  if (timelineStep.level === 'error' && 
      !timelineStep.outcome && 
      !timelineStep.eventName.includes('success') &&
      !timelineStep.eventName.includes('complete')) {
    return true;
  }

  return false;
}

/**
 * Check if an event is a terminal failure
 * 
 * Terminal failures are the final failure events that end the workflow.
 * 
 * @param {Object} timelineStep - Timeline step to check
 * @returns {boolean} True if the event represents a terminal failure
 */
function isTerminalFailure(timelineStep) {
  if (!isFailureEvent(timelineStep)) {
    return false;
  }

  // Explicit terminal failure event names
  if (DEADLETTER_EVENT_NAMES.has(timelineStep.eventName)) {
    return true;
  }

  // Terminal failure patterns
  const terminalPatterns = [
    'exhausted',
    'deadlettered',
    'workflow_failed',
    'processing_failed'
  ];

  return terminalPatterns.some(pattern => 
    timelineStep.eventName.includes(pattern)
  );
}

/**
 * Check if an event is a retry event
 * 
 * @param {Object} timelineStep - Timeline step to check
 * @returns {boolean} True if the event represents a retry attempt
 */
function isRetryEvent(timelineStep) {
  if (!timelineStep || !timelineStep.eventName) {
    return false;
  }

  return RETRY_EVENT_NAMES.has(timelineStep.eventName);
}

/**
 * Check if an event is a deadletter emission
 * 
 * @param {Object} timelineStep - Timeline step to check
 * @returns {boolean} True if the event represents deadletter emission
 */
function isDeadletterEvent(timelineStep) {
  if (!timelineStep || !timelineStep.eventName) {
    return false;
  }

  return DEADLETTER_EVENT_NAMES.has(timelineStep.eventName);
}

/**
 * Check if an event is a provider rejection
 * 
 * @param {Object} timelineStep - Timeline step to check
 * @returns {boolean} True if the event represents provider rejection
 */
function isProviderRejection(timelineStep) {
  if (!timelineStep || !timelineStep.eventName) {
    return false;
  }

  const providerRejectionPatterns = [
    'provider_rejection',
    'provider_error',
    'provider_timeout',
    'api_rate_limit_exceeded',
    'webhook_rejected'
  ];

  return providerRejectionPatterns.some(pattern => 
    timelineStep.eventName.includes(pattern)
  );
}

/**
 * Check if an event is a validation failure
 * 
 * @param {Object} timelineStep - Timeline step to check
 * @returns {boolean} True if the event represents validation failure
 */
function isValidationFailure(timelineStep) {
  if (!timelineStep || !timelineStep.eventName) {
    return false;
  }

  const validationFailurePatterns = [
    'validation_failed',
    'schema_validation_failed',
    'authentication_failed',
    'authorization_failed',
    'invalid_input',
    'malformed_request'
  ];

  return validationFailurePatterns.some(pattern => 
    timelineStep.eventName.includes(pattern)
  );
}

/**
 * Select all failure-relevant events from timeline steps
 * 
 * Returns events in chronological order, preserving original structure.
 * 
 * @param {Array} timelineSteps - Array of timeline steps
 * @returns {Array} Array of failure-relevant timeline steps
 */
function selectFailureEvents(timelineSteps) {
  if (!Array.isArray(timelineSteps)) {
    return [];
  }

  return timelineSteps.filter(step => isFailureEvent(step));
}

/**
 * Select terminal failure events from timeline steps
 * 
 * @param {Array} timelineSteps - Array of timeline steps
 * @returns {Array} Array of terminal failure timeline steps
 */
function selectTerminalFailures(timelineSteps) {
  if (!Array.isArray(timelineSteps)) {
    return [];
  }

  return timelineSteps.filter(step => isTerminalFailure(step));
}

/**
 * Select retry events from timeline steps
 * 
 * @param {Array} timelineSteps - Array of timeline steps
 * @returns {Array} Array of retry timeline steps
 */
function selectRetryEvents(timelineSteps) {
  if (!Array.isArray(timelineSteps)) {
    return [];
  }

  return timelineSteps.filter(step => isRetryEvent(step));
}

/**
 * Get the last terminal failure event
 * 
 * @param {Array} timelineSteps - Array of timeline steps
 * @returns {Object|null} Last terminal failure event or null
 */
function getLastTerminalFailure(timelineSteps) {
  const terminalFailures = selectTerminalFailures(timelineSteps);
  
  if (terminalFailures.length === 0) {
    return null;
  }

  // Return the last one by index (chronological order)
  return terminalFailures[terminalFailures.length - 1];
}

module.exports = {
  // Selector functions
  isFailureEvent,
  isTerminalFailure,
  isRetryEvent,
  isDeadletterEvent,
  isProviderRejection,
  isValidationFailure,
  
  // Batch selectors
  selectFailureEvents,
  selectTerminalFailures,
  selectRetryEvents,
  getLastTerminalFailure,
  
  // Constants (for testing)
  FAILURE_EVENT_NAMES,
  RETRY_EVENT_NAMES,
  DEADLETTER_EVENT_NAMES
};
