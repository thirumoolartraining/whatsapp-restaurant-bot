/**
 * Phase 5.4: Throttle & Retry Visibility Engine - Retry View Builder
 * 
 * This file provides pure builder functions to construct retry decision views.
 * Consumes timeline output, produces read-only view models.
 */

const { RetryDecisionView } = require('./throttleRetryTypes');
const {
  selectRetryEvents,
  countRetryAttempts,
  extractRetryDelays,
  wereRetriesScheduled,
  wereRetriesExhausted,
  wasJobDeadlettered,
  getTerminalRetryEvent,
  extractMaxAttempts,
  wasRetrySuccessful
} = require('./retryEventSelector');

/**
 * Build retry decision view for a correlation ID
 * 
 * @param {string} correlationId - Correlation identifier
 * @param {Array} canonicalEvents - Array of canonical events for this correlation
 * @returns {RetryDecisionView} Retry decision view
 */
function buildRetryView(correlationId, canonicalEvents) {
  // Filter events by correlation ID
  const correlationEvents = canonicalEvents.filter(event => 
    event.correlationId === correlationId
  );

  // Count retry attempts
  const attempts = countRetryAttempts(correlationEvents);
  
  // Extract max attempts
  const maxAttempts = extractMaxAttempts(correlationEvents);
  
  // Check if retries were scheduled
  const retryScheduled = wereRetriesScheduled(correlationEvents);
  
  // Extract retry delays
  const retryDelays = extractRetryDelays(correlationEvents);
  
  // Check if retries were exhausted
  const exhausted = wereRetriesExhausted(correlationEvents);
  
  // Check if job was deadlettered
  const deadlettered = wasJobDeadlettered(correlationEvents);
  
  // Get terminal retry event
  const terminalEvent = getTerminalRetryEvent(correlationEvents);
  
  // Build event reference
  const terminalEventRef = terminalEvent ? {
    eventName: terminalEvent.eventName,
    timestamp: terminalEvent.timestamp,
    component: terminalEvent.component
  } : null;

  return new RetryDecisionView({
    attempts: attempts,
    maxAttempts: maxAttempts,
    retryScheduled: retryScheduled,
    retryDelays: retryDelays,
    exhausted: exhausted,
    deadlettered: deadlettered,
    terminalEventRef: terminalEventRef
  });
}

/**
 * Build retry view from timeline steps (alternative input)
 * 
 * @param {string} correlationId - Correlation identifier
 * @param {Object} timeline - Timeline object from Phase 5.2
 * @returns {RetryDecisionView} Retry decision view
 */
function buildRetryViewFromTimeline(correlationId, timeline) {
  if (!timeline || !timeline.steps) {
    return new RetryDecisionView({
      attempts: 0,
      maxAttempts: null,
      retryScheduled: false,
      retryDelays: [],
      exhausted: false,
      deadlettered: false,
      terminalEventRef: null
    });
  }

  // Filter retry phase steps
  const retrySteps = timeline.steps.filter(step => 
    step.phase === 'retry' && step.correlationId === correlationId
  );

  // Count retry attempts from retry_attempt_started events
  const attemptSteps = retrySteps.filter(step => 
    step.eventName === 'retry_attempt_started'
  );
  const attempts = attemptSteps.length;

  // Extract max attempts from any retry step
  let maxAttempts = null;
  for (const step of retrySteps) {
    if (step.reason && step.reason.maxAttempts) {
      maxAttempts = step.reason.maxAttempts;
      break;
    }
    if (step.reason && step.reason.max_attempts) {
      maxAttempts = step.reason.max_attempts;
      break;
    }
  }

  // Check if retries were scheduled
  const scheduledSteps = retrySteps.filter(step => 
    step.eventName === 'retry_scheduled'
  );
  const retryScheduled = scheduledSteps.length > 0;

  // Extract retry delays
  const retryDelays = [];
  scheduledSteps.forEach(step => {
    if (step.reason) {
      const delay = step.reason.delayMs || 
                   step.reason.delay || 
                   step.reason.backoffMs;
      if (typeof delay === 'number' && delay >= 0) {
        retryDelays.push(delay);
      }
    }
  });

  // Check for exhaustion
  const exhaustedSteps = retrySteps.filter(step => 
    step.eventName === 'retry_exhausted'
  );
  const exhausted = exhaustedSteps.length > 0;

  // Check for deadletter
  const deadletterSteps = retrySteps.filter(step => 
    step.eventName === 'job_deadlettered'
  );
  const deadlettered = deadletterSteps.length > 0;

  // Get terminal event
  const terminalStep = getTerminalRetryStep(retrySteps);
  const terminalEventRef = terminalStep ? {
    eventName: terminalStep.eventName,
    timestamp: terminalStep.timestamp,
    component: terminalStep.component
  } : null;

  return new RetryDecisionView({
    attempts: attempts,
    maxAttempts: maxAttempts,
    retryScheduled: retryScheduled,
    retryDelays: retryDelays,
    exhausted: exhausted,
    deadlettered: deadlettered,
    terminalEventRef: terminalEventRef
  });
}

/**
 * Get terminal retry step from retry steps
 * 
 * @param {Array} retrySteps - Array of retry phase steps
 * @returns {Object|null} Terminal retry step or null
 */
function getTerminalRetryStep(retrySteps) {
  // Look for terminal events in order of finality
  const terminalEventNames = [
    'job_deadlettered',
    'retry_exhausted',
    'job_completed',
    'job_failed'
  ];
  
  for (const eventName of terminalEventNames) {
    const steps = retrySteps.filter(step => step.eventName === eventName);
    if (steps.length > 0) {
      // Return the last occurrence
      return steps[steps.length - 1];
    }
  }

  return null;
}

/**
 * Build multiple retry views for multiple correlation IDs
 * 
 * @param {Array} correlationIds - Array of correlation identifiers
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Object} Map of correlationId -> RetryDecisionView
 */
function buildMultipleRetryViews(correlationIds, canonicalEvents) {
  const views = {};
  
  correlationIds.forEach(correlationId => {
    views[correlationId] = buildRetryView(correlationId, canonicalEvents);
  });
  
  return views;
}

/**
 * Build multiple retry views from timelines
 * 
 * @param {Array} correlationIds - Array of correlation identifiers
 * @param {Object} timelines - Map of correlationId -> Timeline
 * @returns {Object} Map of correlationId -> RetryDecisionView
 */
function buildMultipleRetryViewsFromTimelines(correlationIds, timelines) {
  const views = {};
  
  correlationIds.forEach(correlationId => {
    const timeline = timelines[correlationId];
    views[correlationId] = buildRetryViewFromTimeline(correlationId, timeline);
  });
  
  return views;
}

/**
 * Get summary statistics for retry decisions across multiple correlation IDs
 * 
 * @param {Array} correlationIds - Array of correlation identifiers
 * @param {Array} canonicalEvents - Array of canonical events
 * @returns {Object} Summary statistics
 */
function getRetryDecisionSummary(correlationIds, canonicalEvents) {
  const views = buildMultipleRetryViews(correlationIds, canonicalEvents);
  
  const summary = {
    total: correlationIds.length,
    withRetries: 0,
    withoutRetries: 0,
    exhausted: 0,
    deadlettered: 0,
    successful: 0,
    totalAttempts: 0,
    averageAttempts: 0,
    maxAttemptsSeen: 0
  };

  let totalAttempts = 0;
  let maxAttemptsSeen = 0;

  Object.values(views).forEach(view => {
    if (view.retryScheduled) {
      summary.withRetries++;
      totalAttempts += view.attempts;
      maxAttemptsSeen = Math.max(maxAttemptsSeen, view.attempts);
      
      if (view.exhausted) summary.exhausted++;
      if (view.deadlettered) summary.deadlettered++;
    } else {
      summary.withoutRetries++;
    }
  });

  summary.totalAttempts = totalAttempts;
  summary.averageAttempts = summary.withRetries > 0 ? totalAttempts / summary.withRetries : 0;
  summary.maxAttemptsSeen = maxAttemptsSeen;

  return summary;
}

/**
 * Validate retry view consistency
 * 
 * @param {RetryDecisionView} retryView - Retry decision view to validate
 * @returns {Array} Array of validation errors, empty if valid
 */
function validateRetryView(retryView) {
  const errors = [];
  
  if (!retryView) {
    errors.push('Retry view is null or undefined');
    return errors;
  }

  // Validate basic structure
  if (typeof retryView.attempts !== 'number' || retryView.attempts < 0) {
    errors.push('Invalid attempts: must be non-negative number');
  }

  if (retryView.retryScheduled && retryView.attempts === 0) {
    errors.push('Inconsistent: retryScheduled is true but attempts is 0');
  }

  if (retryView.deadlettered && !retryView.exhausted) {
    errors.push('Inconsistent: deadlettered implies exhausted must be true');
  }

  if (retryView.maxAttempts !== null && retryView.attempts > retryView.maxAttempts) {
    errors.push('Inconsistent: attempts exceeds maxAttempts');
  }

  if (retryView.retryDelays && retryView.retryDelays.length > 0) {
    if (retryView.retryDelays.length !== retryView.attempts) {
      errors.push('Inconsistent: retryDelays length does not match attempts');
    }
  }

  return errors;
}

module.exports = {
  // Main builder functions
  buildRetryView,
  buildRetryViewFromTimeline,
  buildMultipleRetryViews,
  buildMultipleRetryViewsFromTimelines,
  getRetryDecisionSummary,
  
  // Helper functions
  getTerminalRetryStep,
  validateRetryView
};
