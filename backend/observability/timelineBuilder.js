/**
 * Phase 5.2: Timeline Reconstruction Engine - Timeline Builder
 * 
 * This file implements the deterministic timeline builder.
 * It is a read-only derivation layer that does not change runtime behavior.
 */

const { PHASES, OUTCOMES, TimelineStep, TimelineMetadata, Timeline } = require('./timelineTypes');

/**
 * Explicit Event Name → Phase Mapping Table
 * 
 * This mapping is explicit and deterministic. No dynamic inference.
 * Unknown events map to PHASES.UNKNOWN.
 */
const EVENT_PHASE_MAPPING = {
  // Ingress events
  'webhook_received': PHASES.INGRESS,
  'message_received': PHASES.INGRESS,
  'request_received': PHASES.INGRESS,
  'api_call_received': PHASES.INGRESS,
  
  // Routing events
  'router_entered': PHASES.ROUTING,
  'route_matched': PHASES.ROUTING,
  'handler_selected': PHASES.ROUTING,
  'domain_handler_entered': PHASES.ROUTING,
  
  // Domain events
  'domain_processing_start': PHASES.DOMAIN,
  'domain_processing_complete': PHASES.DOMAIN,
  'customer_sync_start': PHASES.DOMAIN,
  'customer_sync_complete': PHASES.DOMAIN,
  'order_created': PHASES.DOMAIN,
  'order_updated': PHASES.DOMAIN,
  'payment_initiated': PHASES.DOMAIN,
  'payment_completed': PHASES.DOMAIN,
  
  // Worker events
  'worker_started': PHASES.WORKER,
  'worker_completed': PHASES.WORKER,
  'job_started': PHASES.WORKER,
  'job_completed': PHASES.WORKER,
  'template_send_start': PHASES.WORKER,
  'template_sent': PHASES.WORKER,
  'message_sent': PHASES.WORKER,
  'broadcast_start': PHASES.WORKER,
  'broadcast_complete': PHASES.WORKER,
  
  // Retry events
  'retry_scheduled': PHASES.RETRY,
  'retry_attempted': PHASES.RETRY,
  'retry_exhausted': PHASES.RETRY,
  
  // Throttle events
  'throttle_applied': PHASES.THROTTLE,
  'rate_limit_exceeded': PHASES.THROTTLE,
  'throttle_released': PHASES.THROTTLE,
  
  // Terminal events
  'job_deadlettered': PHASES.TERMINAL,
  'processing_failed': PHASES.TERMINAL,
  'error_occurred': PHASES.TERMINAL,
  'workflow_completed': PHASES.TERMINAL,
  'workflow_failed': PHASES.TERMINAL
};

/**
 * Event Level and Payload → Outcome Mapping
 * 
 * Maps event levels and payload taxonomy to outcomes.
 */
function deriveOutcome(event) {
  const { level, payload } = event;
  
  // Check payload for explicit outcome indicators
  if (payload) {
    if (payload.deadlettered === true) return OUTCOMES.DEADLETTERED;
    if (payload.throttled === true) return OUTCOMES.THROTTLED;
    if (payload.retried === true || payload.retryAttempt !== undefined) return OUTCOMES.RETRIED;
    if (payload.success === true || payload.completed === true) return OUTCOMES.SUCCESS;
    if (payload.failed === true || payload.error !== undefined) return OUTCOMES.FAILED;
  }
  
  // Derive from event level
  switch (level) {
    case 'error':
      return OUTCOMES.FAILED;
    case 'warn':
      // Warning could be throttled or failed, check event name
      if (event.eventName.includes('throttle') || event.eventName.includes('rate_limit')) {
        return OUTCOMES.THROTTLED;
      }
      return OUTCOMES.FAILED;
    case 'info':
    default:
      return OUTCOMES.SUCCESS;
  }
}

/**
 * Extract structured reason from event payload
 * 
 * Only extracts structured data, no free text explanations.
 */
function extractReason(event) {
  const { payload } = event;
  if (!payload) return undefined;
  
  const reason = {};
  
  // Extract structured reason fields
  if (payload.errorCode) reason.errorCode = payload.errorCode;
  if (payload.errorCategory) reason.errorCategory = payload.errorCategory;
  if (payload.retryCount !== undefined) reason.retryCount = payload.retryCount;
  if (payload.retryAttempt !== undefined) reason.retryAttempt = payload.retryAttempt;
  if (payload.maxRetries !== undefined) reason.maxRetries = payload.maxRetries;
  if (payload.throttleReason) reason.throttleReason = payload.throttleReason;
  if (payload.rateLimit) reason.rateLimit = payload.rateLimit;
  
  return Object.keys(reason).length > 0 ? reason : undefined;
}

/**
 * Map event name to phase using explicit mapping table
 */
function mapEventToPhase(eventName) {
  return EVENT_PHASE_MAPPING[eventName] || PHASES.UNKNOWN;
}

/**
 * Detect gaps in timeline
 * 
 * Identifies large timestamp jumps, missing expected phases, and terminal events without prior steps.
 */
function detectGaps(steps) {
  if (steps.length === 0) {
    return { gapDetected: true, gapReason: 'empty_timeline', missingPhases: [] };
  }
  
  const gaps = { gapDetected: false, gapReason: null, missingPhases: [] };
  
  // Check for large timestamp jumps (> 5 minutes)
  for (let i = 1; i < steps.length; i++) {
    const prevTime = new Date(steps[i-1].timestamp).getTime();
    const currTime = new Date(steps[i].timestamp).getTime();
    const timeDiff = currTime - prevTime;
    
    if (timeDiff > 5 * 60 * 1000) { // 5 minutes in milliseconds
      gaps.gapDetected = true;
      gaps.gapReason = 'large_timestamp_jump';
      gaps.timeJumpMs = timeDiff;
      break;
    }
  }
  
  // Check for missing expected phases in non-trivial timelines
  if (steps.length > 1) {
    const presentPhases = new Set(steps.map(step => step.phase));
    const expectedPhases = [PHASES.INGRESS, PHASES.ROUTING, PHASES.DOMAIN, PHASES.WORKER];
    
    expectedPhases.forEach(phase => {
      if (!presentPhases.has(phase)) {
        gaps.missingPhases.push(phase);
      }
    });
    
    if (gaps.missingPhases.length > 0) {
      gaps.gapDetected = true;
      if (!gaps.gapReason) gaps.gapReason = 'missing_expected_phases';
    }
  }
  
  // Check for terminal events without prior steps
  const terminalSteps = steps.filter(step => step.phase === PHASES.TERMINAL);
  terminalSteps.forEach(terminalStep => {
    if (terminalStep.index === 0) {
      gaps.gapDetected = true;
      gaps.gapReason = 'terminal_without_prior_steps';
    }
  });
  
  return gaps;
}

/**
 * Timeline Builder Function (CORE)
 * 
 * Builds a deterministic timeline from canonical events for a given correlation ID.
 * This function is pure - same input always produces same output.
 * 
 * @param {string} correlationId - Correlation identifier
 * @param {Object} options - Optional configuration
 * @param {Array} options.events - Pre-fetched events (for testing)
 * @param {Function} options.eventFetcher - Function to fetch events by correlation ID
 * @returns {Timeline} Complete timeline with metadata and steps
 */
function buildTimeline(correlationId, options = {}) {
  // Input validation
  if (!correlationId || typeof correlationId !== 'string') {
    throw new Error('Invalid correlationId: must be a non-empty string');
  }
  
  // Get events (either from options or fetcher)
  let events;
  if (options.events && Array.isArray(options.events)) {
    events = options.events.filter(event => event.correlationId === correlationId);
  } else if (options.eventFetcher && typeof options.eventFetcher === 'function') {
    events = options.eventFetcher(correlationId);
  } else {
    throw new Error('Either options.events or options.eventFetcher must be provided');
  }
  
  // Sort events deterministically
  const sortedEvents = events.slice().sort((a, b) => {
    // Primary sort: timestamp
    const timeA = new Date(a.timestamp).getTime();
    const timeB = new Date(b.timestamp).getTime();
    
    if (timeA !== timeB) {
      return timeA - timeB;
    }
    
    // Secondary sort: stable fallback by event name then component
    const nameCompare = (a.eventName || '').localeCompare(b.eventName || '');
    if (nameCompare !== 0) {
      return nameCompare;
    }
    
    return (a.component || '').localeCompare(b.component || '');
  });
  
  // Convert each event to TimelineStep
  const steps = sortedEvents.map((event, index) => {
    const phase = mapEventToPhase(event.eventName);
    const outcome = deriveOutcome(event);
    const reason = extractReason(event);
    
    return new TimelineStep({
      index,
      timestamp: event.timestamp,
      eventName: event.eventName,
      component: event.component,
      phase,
      outcome,
      reason,
      entityRefs: event.entityRefs,
      rawEventRef: {
        eventName: event.eventName,
        component: event.component,
        timestamp: event.timestamp
      }
    });
  });
  
  // Detect gaps
  const gapDetection = detectGaps(steps);
  
  // Create metadata
  const metadata = new TimelineMetadata({
    correlationId,
    totalSteps: steps.length,
    startTime: steps.length > 0 ? steps[0].timestamp : null,
    endTime: steps.length > 0 ? steps[steps.length - 1].timestamp : null,
    gapDetected: gapDetection.gapDetected,
    gapReason: gapDetection.gapReason,
    missingPhases: gapDetection.missingPhases,
    version: '1.0.0'
  });
  
  // Create and return timeline
  const timeline = new Timeline({
    metadata,
    steps
  });
  
  return timeline;
}

module.exports = {
  // Core function
  buildTimeline,
  
  // Mapping and utilities (exported for testing)
  EVENT_PHASE_MAPPING,
  mapEventToPhase,
  deriveOutcome,
  extractReason,
  detectGaps
};
