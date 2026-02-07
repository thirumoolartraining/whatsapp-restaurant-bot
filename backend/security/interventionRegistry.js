/**
 * Intervention Registry
 * Phase 6.2: INTERVENTION AUTHORITY FRAMEWORK
 * 
 * Defines the finite set of INTERVENTION TYPES that are allowed to occur.
 * Denial-by-default: any intervention not explicitly defined is forbidden.
 */

const Logger = require('../services/logger');
const logger = new Logger('interventionRegistry');

// Finite set of intervention types with strict caps and requirements
const INTERVENTION_REGISTRY = {
  RETRY_OVERRIDE: {
    typeName: 'RETRY_OVERRIDE',
    description: 'Allow one extra retry for a correlationId beyond normal policy limits',
    allowedActors: ['admin'],
    maxUsesPerCorrelationId: 1,
    requiresJustification: true,
    requiresCorrelationId: true
  },
  STATE_REPAIR: {
    typeName: 'STATE_REPAIR',
    description: 'Force a limited state change for a correlationId/customer',
    allowedActors: ['admin'],
    maxUsesPerCorrelationId: 1,
    requiresJustification: true,
    requiresCorrelationId: true
  },
  MESSAGE_REPLAY: {
    typeName: 'MESSAGE_REPLAY',
    description: 'Replay a single outbound message job for a correlationId',
    allowedActors: ['admin'],
    maxUsesPerCorrelationId: 1,
    requiresJustification: true,
    requiresCorrelationId: true
  }
  // RATE_LIMIT_RESET removed - no real reset capability exists in rate limiter
};

/**
 * Check if an intervention type is defined
 * @param {string} typeName - The intervention type name to check
 * @returns {boolean} Whether the intervention type is defined
 */
function isInterventionDefined(typeName) {
  return Object.prototype.hasOwnProperty.call(INTERVENTION_REGISTRY, typeName);
}

/**
 * Assert that an intervention is allowed for the given parameters
 * @param {Object} params - Intervention assertion parameters
 * @param {string} params.type - The intervention type being attempted
 * @param {string} params.actor - Who is performing the intervention ('admin')
 * @param {string} [params.correlationId] - Correlation ID for tracking
 * @param {string} [params.justification] - Reason for the intervention
 * @param {Object} [params.context] - Additional context for audit
 * @throws {Error} If intervention is not defined or not allowed
 */
function assertInterventionAllowed({ type, actor, correlationId, justification, context = {} }) {
  // Check if intervention type is defined
  if (!isInterventionDefined(type)) {
    const error = new Error(`Intervention type not defined: ${type}`);
    error.code = 'INTERVENTION_NOT_DEFINED';
    error.type = type;
    error.actor = actor;
    error.correlationId = correlationId;
    
    // Emit audit event for intervention denial
    emitInterventionAudit({
      eventType: 'intervention_denied',
      type,
      actor,
      correlationId,
      justification,
      reason: 'INTERVENTION_NOT_DEFINED',
      context
    });
    
    throw error;
  }

  const intervention = INTERVENTION_REGISTRY[type];

  // Check if actor is allowed
  if (!intervention.allowedActors.includes(actor)) {
    const error = new Error(`Actor ${actor} not allowed for intervention ${type}`);
    error.code = 'ACTOR_NOT_ALLOWED';
    error.type = type;
    error.actor = actor;
    error.correlationId = correlationId;
    
    // Emit audit event for intervention denial
    emitInterventionAudit({
      eventType: 'intervention_denied',
      type,
      actor,
      correlationId,
      justification,
      reason: 'ACTOR_NOT_ALLOWED',
      context
    });
    
    throw error;
  }

  // Check correlation ID requirement
  if (intervention.requiresCorrelationId && !correlationId) {
    const error = new Error(`Correlation ID required for intervention ${type}`);
    error.code = 'CORRELATION_ID_REQUIRED';
    error.type = type;
    error.actor = actor;
    error.correlationId = correlationId;
    
    // Emit audit event for intervention denial
    emitInterventionAudit({
      eventType: 'intervention_denied',
      type,
      actor,
      correlationId,
      justification,
      reason: 'CORRELATION_ID_REQUIRED',
      context
    });
    
    throw error;
  }

  // Check justification requirement
  if (intervention.requiresJustification && !justification) {
    const error = new Error(`Justification required for intervention ${type}`);
    error.code = 'JUSTIFICATION_REQUIRED';
    error.type = type;
    error.actor = actor;
    error.correlationId = correlationId;
    
    // Emit audit event for intervention denial
    emitInterventionAudit({
      eventType: 'intervention_denied',
      type,
      actor,
      correlationId,
      justification,
      reason: 'JUSTIFICATION_REQUIRED',
      context
    });
    
    throw error;
  }

  // Emit audit event for successful intervention assertion
  emitInterventionAudit({
    eventType: 'intervention_allowed',
    type,
    actor,
    correlationId,
    justification,
    reason: 'ALLOWED',
    context
  });
}

/**
 * Record an intervention attempt (centralized audit emission)
 * @param {Object} params - Intervention record parameters
 * @param {string} params.type - The intervention type
 * @param {string} params.actor - Who performed the intervention
 * @param {string} params.correlationId - Correlation ID
 * @param {string} params.justification - Reason for intervention
 * @param {string} params.status - 'requested' | 'denied' | 'executed'
 * @param {Object} [params.context] - Additional context
 */
function recordInterventionAttempt({ type, actor, correlationId, justification, status, context = {} }) {
  emitInterventionAudit({
    eventType: `intervention_${status}`,
    type,
    actor,
    correlationId,
    justification,
    reason: status.toUpperCase(),
    context
  });
}

/**
 * Emit audit events for intervention attempts
 * @param {Object} auditData - Audit event data
 */
function emitInterventionAudit({ eventType, type, actor, correlationId, justification, reason, context }) {
  const auditEvent = {
    level: 'info',
    component: 'interventionRegistry',
    event: eventType,
    timestamp: new Date().toISOString(),
    context: {
      type,
      actor,
      correlationId,
      justification,
      reason,
      ...context
    }
  };

  if (eventType === 'intervention_denied') {
    logger.warn('intervention_denied', auditEvent);
  } else {
    logger.info(eventType, auditEvent);
  }
}

module.exports = {
  INTERVENTION_REGISTRY,
  isInterventionDefined,
  assertInterventionAllowed,
  recordInterventionAttempt
};
