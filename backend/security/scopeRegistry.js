/**
 * Scope Registry
 * Phase 6.1: SCOPE REGISTRY + SCOPE ENFORCEMENT
 * 
 * Defines the finite set of SYSTEM ACTIONS that are allowed to occur.
 * Denial-by-default: any action not explicitly defined is forbidden.
 */

const Logger = require('../services/logger');
const logger = new Logger('scopeRegistry');

// Finite set of scoped actions based on actual system behavior
const SCOPE_REGISTRY = {
  // Inbound message handling
  INBOUND_MESSAGE_ACCEPT: {
    actionName: 'INBOUND_MESSAGE_ACCEPT',
    description: 'Accept and process incoming webhook message',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },
  INBOUND_MESSAGE_REJECT: {
    actionName: 'INBOUND_MESSAGE_REJECT',
    description: 'Reject incoming webhook message',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },

  // Messaging actions
  TEMPLATE_SEND: {
    actionName: 'TEMPLATE_SEND',
    description: 'Send WhatsApp template message',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },
  TRANSACTIONAL_MESSAGE_SEND: {
    actionName: 'TRANSACTIONAL_MESSAGE_SEND',
    description: 'Send transactional WhatsApp message',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },
  BROADCAST_MESSAGE_SEND: {
    actionName: 'BROADCAST_MESSAGE_SEND',
    description: 'Send WhatsApp broadcast message',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },

  // State management
  STATE_TRANSITION: {
    actionName: 'STATE_TRANSITION',
    description: 'Transition conversation state',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },
  STATE_RESET: {
    actionName: 'STATE_RESET',
    description: 'Reset conversation state to welcome',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },

  // Queue operations
  QUEUE_JOB_ENQUEUE: {
    actionName: 'QUEUE_JOB_ENQUEUE',
    description: 'Enqueue job for execution',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },
  QUEUE_JOB_EXECUTE: {
    actionName: 'QUEUE_JOB_EXECUTE',
    description: 'Execute queued job',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },

  // Retry operations
  RETRY_EXECUTE: {
    actionName: 'RETRY_EXECUTE',
    description: 'Execute retry attempt',
    allowedActors: ['system'],
    requiresCorrelationId: true
  },

  // Observability and admin
  OBSERVABILITY_QUERY: {
    actionName: 'OBSERVABILITY_QUERY',
    description: 'Query observability data',
    allowedActors: ['admin'],
    requiresCorrelationId: false
  },

  // Intervention actions
  ADMIN_INTERVENTION_EXECUTE: {
    actionName: 'ADMIN_INTERVENTION_EXECUTE',
    description: 'Execute administrative intervention',
    allowedActors: ['admin'],
    requiresCorrelationId: true
  },

  STATE_REPAIR: {
    actionName: 'STATE_REPAIR',
    description: 'Repair conversation state via intervention',
    allowedActors: ['admin', 'system'],
    requiresCorrelationId: true
  },

  MESSAGE_REPLAY: {
    actionName: 'MESSAGE_REPLAY',
    description: 'Replay outbound message via intervention',
    allowedActors: ['admin'],
    requiresCorrelationId: true
  }
};

/**
 * Check if a scope action is defined
 * @param {string} actionName - The action name to check
 * @returns {boolean} Whether the action is defined
 */
function isScopeDefined(actionName) {
  return Object.prototype.hasOwnProperty.call(SCOPE_REGISTRY, actionName);
}

/**
 * Assert that a scope action is allowed for the given actor and context
 * @param {Object} params - Scope assertion parameters
 * @param {string} params.actionName - The action being attempted
 * @param {string} params.actor - Who is performing the action ('system' | 'user' | 'admin')
 * @param {string} [params.correlationId] - Correlation ID for tracking
 * @param {Object} [params.context] - Additional context for audit
 * @throws {Error} If scope is not defined or not allowed
 */
function assertScopeAllowed({ actionName, actor, correlationId, context = {} }) {
  // Check if action is defined
  if (!isScopeDefined(actionName)) {
    const error = new Error(`Scope not defined: ${actionName}`);
    error.code = 'SCOPE_NOT_DEFINED';
    error.actionName = actionName;
    error.actor = actor;
    error.correlationId = correlationId;
    
    // Emit audit event for scope denial
    emitScopeAudit({
      eventType: 'scope_denied',
      actionName,
      actor,
      correlationId,
      reason: 'SCOPE_NOT_DEFINED',
      context
    });
    
    throw error;
  }

  const scope = SCOPE_REGISTRY[actionName];

  // Check if actor is allowed
  if (!scope.allowedActors.includes(actor)) {
    const error = new Error(`Actor ${actor} not allowed for action ${actionName}`);
    error.code = 'ACTOR_NOT_ALLOWED';
    error.actionName = actionName;
    error.actor = actor;
    error.correlationId = correlationId;
    
    // Emit audit event for scope denial
    emitScopeAudit({
      eventType: 'scope_denied',
      actionName,
      actor,
      correlationId,
      reason: 'ACTOR_NOT_ALLOWED',
      context
    });
    
    throw error;
  }

  // Check correlation ID requirement
  if (scope.requiresCorrelationId && !correlationId) {
    const error = new Error(`Correlation ID required for action ${actionName}`);
    error.code = 'CORRELATION_ID_REQUIRED';
    error.actionName = actionName;
    error.actor = actor;
    error.correlationId = correlationId;
    
    // Emit audit event for scope denial
    emitScopeAudit({
      eventType: 'scope_denied',
      actionName,
      actor,
      correlationId,
      reason: 'CORRELATION_ID_REQUIRED',
      context
    });
    
    throw error;
  }

  // Emit audit event for successful scope assertion
  emitScopeAudit({
    eventType: 'scope_allowed',
    actionName,
    actor,
    correlationId,
    reason: 'ALLOWED',
    context
  });
}

/**
 * Emit audit events for scope assertions
 * @param {Object} auditData - Audit event data
 */
function emitScopeAudit({ eventType, actionName, actor, correlationId, reason, context }) {
  const auditEvent = {
    level: 'info',
    component: 'scopeRegistry',
    event: eventType,
    timestamp: new Date().toISOString(),
    context: {
      actionName,
      actor,
      correlationId,
      reason,
      ...context
    }
  };

  if (eventType === 'scope_denied') {
    logger.warn('scope_denied', auditEvent);
  } else {
    logger.info('scope_allowed', auditEvent);
  }
}

module.exports = {
  SCOPE_REGISTRY,
  isScopeDefined,
  assertScopeAllowed
};
