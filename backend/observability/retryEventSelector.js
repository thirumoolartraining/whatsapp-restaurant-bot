/**
 * Phase 5.4: Throttle & Retry Visibility Engine - Retry Event Selector
 * 
 * This file provides pure selector functions to identify retry-related events.
 * Prefer terminal events, no inference from repeated failures.
 */

const { RETRY_EVENT_TYPES } = require('./throttleRetryTypes');

/**
 * Retry Event Names (Explicit Matching Only)
 * 
 * These are the exact event names that indicate retry-related activity.
 * Retry exhaustion must be explicit, no inference from timing patterns.
 */
const RETRY_EVENT_NAMES = new Set([
  'retry_scheduled',
  'retry_attempt_started',
  'retry_attempt_failed',
  'retry_exhausted',
  'retry_attempt_success',
  'job_deadlettered',
  'job_failed',
  'job_completed'
]);

/**
 * Pure selector function to identify retry-related events
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Array} Array of retry-related events in chronological order
 */
function selectRetryEvents(canonicalEvents) {
  if (!Array.isArray(canonicalEvents)) {
    return [];
  }

  // Filter events by exact name matching only
  const retryEvents = canonicalEvents.filter(event => {
    return event.eventName && RETRY_EVENT_NAMES.has(event.eventName);
  });

  // Sort by timestamp to maintain chronological order
  return retryEvents.sort((a, b) => {
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    return timeA - timeB;
  });
}

/**
 * Pure selector function to count retry attempts
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {number} Number of retry attempts observed
 */
function countRetryAttempts(canonicalEvents) {
  const retryEvents = selectRetryEvents(canonicalEvents);
  
  // Count explicit retry attempt started events
  const attemptEvents = retryEvents.filter(event => 
    event.eventName === 'retry_attempt_started'
  );
  
  return attemptEvents.length;
}

/**
 * Pure selector function to extract retry delays
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Array} Array of retry delays in milliseconds
 */
function extractRetryDelays(canonicalEvents) {
  const retryEvents = selectRetryEvents(canonicalEvents);
  const delays = [];
  
  // Extract delays from retry_scheduled events
  retryEvents.forEach(event => {
    if (event.eventName === 'retry_scheduled' && event.payload) {
      const delay = event.payload.delayMs || 
                   event.payload.delay || 
                   event.payload.backoffMs;
      
      if (typeof delay === 'number' && delay >= 0) {
        delays.push(delay);
      }
    }
  });
  
  return delays;
}

/**
 * Pure selector function to check if retries were scheduled
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {boolean} True if retry scheduling events are present
 */
function wereRetriesScheduled(canonicalEvents) {
  const retryEvents = selectRetryEvents(canonicalEvents);
  const scheduledEvents = retryEvents.filter(event => 
    event.eventName === 'retry_scheduled'
  );
  
  return scheduledEvents.length > 0;
}

/**
 * Pure selector function to check if retries were exhausted
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {boolean} True if explicit retry exhaustion event is present
 */
function wereRetriesExhausted(canonicalEvents) {
  const retryEvents = selectRetryEvents(canonicalEvents);
  const exhaustedEvents = retryEvents.filter(event => 
    event.eventName === 'retry_exhausted'
  );
  
  return exhaustedEvents.length > 0;
}

/**
 * Pure selector function to check if job was deadlettered
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {boolean} True if explicit deadletter event is present
 */
function wasJobDeadlettered(canonicalEvents) {
  const retryEvents = selectRetryEvents(canonicalEvents);
  const deadletterEvents = retryEvents.filter(event => 
    event.eventName === 'job_deadlettered'
  );
  
  return deadletterEvents.length > 0;
}

/**
 * Pure selector function to get terminal retry event
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Object|null} Terminal retry event or null
 */
function getTerminalRetryEvent(canonicalEvents) {
  const retryEvents = selectRetryEvents(canonicalEvents);
  
  // Look for terminal events in order of finality
  const terminalEventNames = [
    'job_deadlettered',
    'retry_exhausted',
    'job_completed',
    'job_failed'
  ];
  
  for (const eventName of terminalEventNames) {
    const events = retryEvents.filter(event => event.eventName === eventName);
    if (events.length > 0) {
      // Return the last occurrence
      return events[events.length - 1];
    }
  }

  return null;
}

/**
 * Pure selector function to extract max attempts from events
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {number|null} Maximum attempts or null
 */
function extractMaxAttempts(canonicalEvents) {
  const retryEvents = selectRetryEvents(canonicalEvents);
  
  // Look for maxAttempts in event payloads
  for (const event of retryEvents) {
    if (event.payload && typeof event.payload.maxAttempts === 'number') {
      return event.payload.maxAttempts;
    }
    
    if (event.payload && typeof event.payload.max_attempts === 'number') {
      return event.payload.max_attempts;
    }
  }

  return null;
}

/**
 * Pure selector function to check if retry was successful
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {boolean} True if explicit retry success event is present
 */
function wasRetrySuccessful(canonicalEvents) {
  const retryEvents = selectRetryEvents(canonicalEvents);
  const successEvents = retryEvents.filter(event => 
    event.eventName === 'retry_attempt_success' || 
    event.eventName === 'job_completed'
  );
  
  return successEvents.length > 0;
}

module.exports = {
  // Main selector functions
  selectRetryEvents,
  countRetryAttempts,
  extractRetryDelays,
  wereRetriesScheduled,
  wereRetriesExhausted,
  wasJobDeadlettered,
  getTerminalRetryEvent,
  extractMaxAttempts,
  wasRetrySuccessful,
  
  // Constants
  RETRY_EVENT_NAMES
};
