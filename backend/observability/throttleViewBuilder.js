/**
 * Phase 5.4: Throttle & Retry Visibility Engine - Throttle View Builder
 * 
 * This file provides pure builder functions to construct throttle decision views.
 * Consumes canonical events, produces read-only view models.
 */

const { ThrottleDecisionView, POLICY_TYPES, THROTTLE_DECISIONS } = require('./throttleRetryTypes');
const { 
  selectThrottleEvents,
  selectLastThrottleDecision,
  wasThrottlingEvaluated,
  extractThrottlePolicyType,
  extractThrottleDecision,
  extractThrottleDelay
} = require('./throttleEventSelector');

/**
 * Build throttle decision view for a correlation ID
 * 
 * @param {string} correlationId - Correlation identifier
 * @param {Array} canonicalEvents - Array of canonical events for this correlation
 * @returns {ThrottleDecisionView} Throttle decision view
 */
function buildThrottleView(correlationId, canonicalEvents) {
  // Filter events by correlation ID
  const correlationEvents = canonicalEvents.filter(event => 
    event.correlationId === correlationId
  );

  // Check if throttling was evaluated
  const evaluated = wasThrottlingEvaluated(correlationEvents);

  if (!evaluated) {
    // No throttle evaluation occurred
    return new ThrottleDecisionView({
      evaluated: false,
      policyType: POLICY_TYPES.UNKNOWN,
      decision: THROTTLE_DECISIONS.SKIPPED,
      delayMs: null,
      reason: null,
      eventRef: null
    });
  }

  // Extract throttle decision event
  const decisionEvent = selectLastThrottleDecision(correlationEvents);
  
  // Extract policy type
  const policyType = extractThrottlePolicyType(correlationEvents);
  
  // Extract decision
  const decision = extractThrottleDecision(correlationEvents);
  
  // Extract delay
  const delayMs = extractThrottleDelay(correlationEvents);
  
  // Build structured reason from event payload
  const reason = buildThrottleReason(decisionEvent);
  
  // Build event reference
  const eventRef = decisionEvent ? {
    eventName: decisionEvent.eventName,
    timestamp: decisionEvent.timestamp,
    component: decisionEvent.component
  } : null;

  return new ThrottleDecisionView({
    evaluated: true,
    policyType: normalizePolicyType(policyType),
    decision: normalizeDecision(decision),
    delayMs: delayMs,
    reason: reason,
    eventRef: eventRef
  });
}

/**
 * Normalize policy type to known enum values
 * 
 * @param {string} policyType - Raw policy type from events
 * @returns {string} Normalized policy type
 */
function normalizePolicyType(policyType) {
  if (!policyType) {
    return POLICY_TYPES.UNKNOWN;
  }

  const normalized = policyType.toLowerCase();
  
  switch (normalized) {
    case 'broadcast':
      return POLICY_TYPES.BROADCAST;
    case 'transactional':
      return POLICY_TYPES.TRANSACTIONAL;
    case 'burst':
      return POLICY_TYPES.BURST;
    default:
      return POLICY_TYPES.UNKNOWN;
  }
}

/**
 * Normalize decision to known enum values
 * 
 * @param {string} decision - Raw decision from events
 * @returns {string} Normalized decision
 */
function normalizeDecision(decision) {
  if (!decision) {
    return THROTTLE_DECISIONS.SKIPPED;
  }

  const normalized = decision.toLowerCase();
  
  switch (normalized) {
    case 'allow':
    case 'allowed':
    case 'proceed':
      return THROTTLE_DECISIONS.ALLOW;
    case 'delay':
    case 'throttled':
    case 'backoff':
      return THROTTLE_DECISIONS.DELAY;
    case 'suppress':
    case 'reject':
    case 'block':
      return THROTTLE_DECISIONS.SUPPRESS;
    case 'skip':
    case 'skipped':
      return THROTTLE_DECISIONS.SKIPPED;
    default:
      return THROTTLE_DECISIONS.SKIPPED;
  }
}

/**
 * Build structured reason from throttle decision event
 * 
 * @param {Object} decisionEvent - Throttle decision event
 * @returns {Object|null} Structured reason or null
 */
function buildThrottleReason(decisionEvent) {
  if (!decisionEvent || !decisionEvent.payload) {
    return null;
  }

  const reason = {};
  const payload = decisionEvent.payload;

  // Extract common reason fields
  if (payload.reason) reason.reason = payload.reason;
  if (payload.cause) reason.cause = payload.cause;
  if (payload.trigger) reason.trigger = payload.trigger;
  
  // Extract policy-specific fields
  if (payload.limit) reason.limit = payload.limit;
  if (payload.current) reason.current = payload.current;
  if (payload.window) reason.window = payload.window;
  if (payload.threshold) reason.threshold = payload.threshold;
  
  // Extract timing fields
  if (payload.resetTime) reason.resetTime = payload.resetTime;
  if (payload.nextAllowed) reason.nextAllowed = payload.nextAllowed;
  
  // Extract metadata
  if (payload.policyName) reason.policyName = payload.policyName;
  if (payload.ruleId) reason.ruleId = payload.ruleId;
  if (payload.category) reason.category = payload.category;

  return Object.keys(reason).length > 0 ? reason : null;
}

/**
 * Build multiple throttle views for multiple correlation IDs
 * 
 * @param {Array} correlationIds - Array of correlation identifiers
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Object} Map of correlationId -> ThrottleDecisionView
 */
function buildMultipleThrottleViews(correlationIds, canonicalEvents) {
  const views = {};
  
  correlationIds.forEach(correlationId => {
    views[correlationId] = buildThrottleView(correlationId, canonicalEvents);
  });
  
  return views;
}

/**
 * Get summary statistics for throttle decisions across multiple correlation IDs
 * 
 * @param {Array} correlationIds - Array of correlation identifiers
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Object} Summary statistics
 */
function getThrottleDecisionSummary(correlationIds, canonicalEvents) {
  const views = buildMultipleThrottleViews(correlationIds, canonicalEvents);
  
  const summary = {
    total: correlationIds.length,
    evaluated: 0,
    notEvaluated: 0,
    decisions: {
      allow: 0,
      delay: 0,
      suppress: 0,
      skipped: 0
    },
    policyTypes: {
      broadcast: 0,
      transactional: 0,
      burst: 0,
      unknown: 0
    }
  };

  Object.values(views).forEach(view => {
    if (view.evaluated) {
      summary.evaluated++;
      summary.decisions[view.decision]++;
      summary.policyTypes[view.policyType]++;
    } else {
      summary.notEvaluated++;
    }
  });

  return summary;
}

module.exports = {
  // Main builder functions
  buildThrottleView,
  buildMultipleThrottleViews,
  getThrottleDecisionSummary,
  
  // Helper functions
  normalizePolicyType,
  normalizeDecision,
  buildThrottleReason
};
