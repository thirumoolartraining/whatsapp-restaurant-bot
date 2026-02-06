/**
 * Phase 5.4: Throttle & Retry Visibility Engine - Throttle Event Selector
 * 
 * This file provides pure selector functions to identify throttle-related events.
 * No inference from timing gaps, no assumption that throttling always runs.
 */

const { RETRY_EVENT_TYPES } = require('./throttleRetryTypes');

/**
 * Throttle Event Names (Explicit Matching Only)
 * 
 * These are the exact event names that indicate throttle-related activity.
 * Unknown events are ignored, no inference or pattern matching.
 */
const THROTTLE_EVENT_NAMES = new Set([
  'throttle_evaluated',
  'throttle_applied',
  'throttle_skipped',
  'throttle_delay_calculated',
  'throttle_policy_checked',
  'throttle_decision_made'
]);

/**
 * Pure selector function to identify throttle-related events
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Array} Array of throttle-related events in chronological order
 */
function selectThrottleEvents(canonicalEvents) {
  if (!Array.isArray(canonicalEvents)) {
    return [];
  }

  // Filter events by exact name matching only
  const throttleEvents = canonicalEvents.filter(event => {
    return event.eventName && THROTTLE_EVENT_NAMES.has(event.eventName);
  });

  // Events are already sorted by timeline builder - no additional sorting needed
  return throttleEvents;
}

/**
 * Pure selector function to get the last effective throttle decision
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Object|null} Last throttle decision event or null
 */
function selectLastThrottleDecision(canonicalEvents) {
  const throttleEvents = selectThrottleEvents(canonicalEvents);
  
  // Look for decision events in order of preference
  const decisionEventNames = ['throttle_decision_made', 'throttle_applied', 'throttle_delay_calculated'];
  
  for (const eventName of decisionEventNames) {
    const events = throttleEvents.filter(event => event.eventName === eventName);
    if (events.length > 0) {
      // Return the last occurrence
      if (!Array.isArray(events) || events.length === 0) return null;
      return events[events.length - 1];
    }
  }

  // If no explicit decision event, look for evaluation
  const evaluationEvents = throttleEvents.filter(event => event.eventName === 'throttle_evaluated');
  if (evaluationEvents.length > 0) {
    if (!Array.isArray(evaluationEvents) || evaluationEvents.length === 0) return null;
    return evaluationEvents[evaluationEvents.length - 1];
  }

  return null;
}

/**
 * Pure selector function to check if throttling was evaluated
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {boolean} True if throttle evaluation events are present
 */
function wasThrottlingEvaluated(canonicalEvents) {
  const throttleEvents = selectThrottleEvents(canonicalEvents);
  return throttleEvents.length > 0;
}

/**
 * Pure selector function to extract throttle policy type from events
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {string} Policy type or 'unknown'
 */
function extractThrottlePolicyType(canonicalEvents) {
  const throttleEvents = selectThrottleEvents(canonicalEvents);
  
  // Look for policy type in event payloads
  for (const event of throttleEvents) {
    if (event.payload && event.payload.policyType) {
      return event.payload.policyType;
    }
    
    if (event.payload && event.payload.policy) {
      return event.payload.policy;
    }
  }

  return 'unknown';
}

/**
 * Pure selector function to extract throttle decision from events
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {string|null} Throttle decision or null
 */
function extractThrottleDecision(canonicalEvents) {
  const decisionEvent = selectLastThrottleDecision(canonicalEvents);
  
  if (!decisionEvent) {
    return null;
  }

  // Extract decision from payload or infer from event name
  if (decisionEvent.payload) {
    if (decisionEvent.payload.decision) {
      return decisionEvent.payload.decision;
    }
    
    if (decisionEvent.payload.action) {
      return decisionEvent.payload.action;
    }
  }

  // Infer from event name as last resort
  switch (decisionEvent.eventName) {
    case 'throttle_applied':
      return decisionEvent.payload && decisionEvent.payload.delayMs ? 'delay' : 'suppress';
    case 'throttle_skipped':
      return 'allow';
    case 'throttle_delay_calculated':
      return 'delay';
    default:
      return null;
  }
}

/**
 * Pure selector function to extract throttle delay from events
 * 
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {number|null} Delay in milliseconds or null
 */
function extractThrottleDelay(canonicalEvents) {
  const decisionEvent = selectLastThrottleDecision(canonicalEvents);
  
  if (!decisionEvent || !decisionEvent.payload) {
    return null;
  }

  return decisionEvent.payload.delayMs || 
         decisionEvent.payload.delay || 
         decisionEvent.payload.backoffMs || 
         null;
}

module.exports = {
  // Main selector functions
  selectThrottleEvents,
  selectLastThrottleDecision,
  wasThrottlingEvaluated,
  extractThrottlePolicyType,
  extractThrottleDecision,
  extractThrottleDelay,
  
  // Constants
  THROTTLE_EVENT_NAMES
};
