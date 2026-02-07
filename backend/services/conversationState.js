/*
 Phase 3 Step 3.3:
 Conversation state manager extraction.
 Centralizes state read/write/reset.
 No behavior change.
 Phase 6 T1: Added state transition enforcement and audit logging.
*/

const Customer = require('../models/Customer');
const { assertTransitionAllowed, StateTransitionError } = require('../domain/stateMachine');
const { assertScopeAllowed } = require('../security/scopeRegistry');
const { assertAbuseAllowed } = require('../security/abuseGuard');
const Intervention = require('../models/Intervention');
const logger = require('./logger');

async function getState(userId, providerContext = {}) {
  const { phone } = providerContext;
  if (!phone) {
    throw new Error('Phone number required for state access');
  }
  
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    return { currentStep: 'welcome' };
  }
  
  return customer.conversationState || { currentStep: 'welcome' };
}

async function setState(userId, partialState, providerContext = {}) {
  const { phone, correlationId, actor } = providerContext;
  if (!phone) {
    throw new Error('Phone number required for state update');
  }
  
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    throw new Error('Customer not found for state update');
  }
  
  // Initialize conversationState if it doesn't exist
  if (!customer.conversationState) {
    customer.conversationState = { currentStep: 'welcome' };
  }
  
  // Enforce state transitions if currentStep is being changed
  if (partialState.currentStep && partialState.currentStep !== customer.conversationState.currentStep) {
    // Enforce scope for state transition
    assertScopeAllowed({
      actionName: 'STATE_TRANSITION',
      actor: actor || 'system',
      correlationId,
      context: { 
        phone, 
        fromState: customer.conversationState.currentStep,
        toState: partialState.currentStep 
      }
    });

    try {
      assertTransitionAllowed({
        fromState: customer.conversationState.currentStep,
        toState: partialState.currentStep,
        correlationId: correlationId || 'unknown',
        actor: actor || 'unknown',
        context: { customerId: customer._id, phone }
      });
    } catch (error) {
      if (error instanceof StateTransitionError) {
        // Emit audit log for denied transition
        const auditEvent = {
          eventType: 'state_transition_denied',
          timestamp: new Date().toISOString(),
          correlationId: correlationId || 'unknown',
          fromState: error.fromState,
          toState: error.toState,
          actor: actor || 'unknown',
          reason: error.code,
          customerId: customer._id,
          phone: phone
        };
        
        logger.error('State transition denied', auditEvent);
        
        // Return safe response - do not mutate state
        throw new Error('Invalid state transition');
      }
      throw error;
    }
  }
  
  // Apply partial state updates
  Object.assign(customer.conversationState, partialState);
  customer.conversationState.lastInteraction = new Date();
  
  await customer.save();
  return customer.conversationState;
}

async function updateState(userId, updaterFn, providerContext = {}) {
  const { phone, correlationId, actor } = providerContext;
  if (!phone) {
    throw new Error('Phone number required for state update');
  }
  
  if (!correlationId) {
    throw new Error('correlationId required for state update');
  }
  
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    throw new Error('Customer not found for state update');
  }
  
  // Initialize conversationState if it doesn't exist
  if (!customer.conversationState) {
    customer.conversationState = { currentStep: 'welcome' };
  }
  
  // Apply updater function
  const updatedState = updaterFn(customer.conversationState);
  if (updatedState !== undefined) {
    // Enforce state transitions if currentStep is being changed
    const currentStep = customer.conversationState.currentStep;
    const newStep = updatedState.currentStep;
    
    if (newStep && newStep !== currentStep) {
      try {
        assertTransitionAllowed({
          fromState: currentStep,
          toState: newStep,
          correlationId: correlationId,
          actor: actor || 'unknown',
          context: { customerId: customer._id, phone }
        });
      } catch (error) {
        if (error instanceof StateTransitionError) {
          // Emit audit log for denied transition
          const auditEvent = {
            eventType: 'state_transition_denied',
            timestamp: new Date().toISOString(),
            correlationId: correlationId,
            fromState: error.fromState,
            toState: error.toState,
            actor: actor || 'unknown',
            reason: error.code,
            customerId: customer._id,
            phone: phone
          };
          
          logger.error('State transition denied', auditEvent);
          
          // Return safe response - do not mutate state
          throw new Error('Invalid state transition');
        }
        throw error;
      }
    }
    
    customer.conversationState = updatedState;
  }
  customer.conversationState.lastInteraction = new Date();
  
  await customer.save();
  return customer.conversationState;
}

async function resetState(userId, providerContext = {}) {
  const { phone, correlationId, actor, reason } = providerContext;
  if (!phone) {
    throw new Error('Phone number required for state reset');
  }
  
  // Enforce scope for state reset
  assertScopeAllowed({
    actionName: 'STATE_RESET',
    actor: actor || 'system',
    correlationId,
    context: { phone, reason }
  });

  if (!actor || actor !== 'system') {
    throw new Error('resetState can only be called by system actor');
  }
  
  const customer = await Customer.findOne({ phone });
  if (!customer) {
    throw new Error('Customer not found for state reset');
  }
  
  const currentStep = customer.conversationState?.currentStep || 'welcome';
  
  // Enforce transition to welcome
  try {
    assertTransitionAllowed({
      fromState: currentStep,
      toState: 'welcome',
      correlationId: correlationId,
      actor: actor,
      context: { customerId: customer._id, phone }
    });
  } catch (error) {
    if (error instanceof StateTransitionError) {
      // Emit audit log for denied reset
      const auditEvent = {
        eventType: 'state_reset_denied',
        timestamp: new Date().toISOString(),
        correlationId: correlationId,
        fromState: error.fromState,
        toState: 'welcome',
        actor: actor,
        reason: error.code,
        resetReason: reason || 'unspecified',
        customerId: customer._id,
        phone: phone
      };
      
      logger.error('State reset denied', auditEvent);
      
      // Return safe response - do not mutate state
      throw new Error('State reset not allowed');
    }
    throw error;
  }
  
  // Emit audit log for successful reset
  const resetAuditEvent = {
    eventType: 'state_reset',
    timestamp: new Date().toISOString(),
    correlationId: correlationId,
    fromState: currentStep,
    toState: 'welcome',
    actor: actor,
    reason: 'RESET_ALLOWED',
    resetReason: reason || 'unspecified',
    customerId: customer._id,
    phone: phone
  };
  
  logger.info('State reset completed', resetAuditEvent);
  
  customer.conversationState = { currentStep: 'welcome' };
  customer.conversationState.lastInteraction = new Date();
  
  await customer.save();
  return customer.conversationState;
}

/**
 * Repair conversation state via intervention
 * Phase 6.2.1: STATE_REPAIR intervention wiring
 * 
 * @param {Object} params - Repair parameters
 * @param {Object} params.customer - Customer document
 * @param {string} params.toState - Target state to repair to
 * @param {string} params.correlationId - Correlation ID for tracking
 * @param {string} params.actor - Actor performing the repair
 * @param {string} params.justification - Reason for repair
 * @returns {Object} Updated conversation state
 */
async function repairState({ customer, toState, correlationId, actor, justification }) {
  if (!customer) {
    throw new Error('Customer required for state repair');
  }
  
  if (!correlationId) {
    throw new Error('Correlation ID required for state repair');
  }
  
  if (!toState) {
    throw new Error('Target state required for state repair');
  }

  // Check for executed STATE_REPAIR intervention
  const intervention = await Intervention.findUnconsumed(correlationId, 'STATE_REPAIR');
  if (!intervention) {
    // Emit audit event for denial
    const denialEvent = {
      eventType: 'state_repair_denied',
      timestamp: new Date().toISOString(),
      correlationId,
      actor,
      toState,
      reason: 'NO_INTERVENTION',
      customerId: customer._id,
      phone: customer.phone
    };
    
    logger.error('State repair denied - no intervention', denialEvent);
    
    const error = new Error('State repair requires executed STATE_REPAIR intervention');
    error.code = 'INTERVENTION_REQUIRED';
    throw error;
  }

  // Enforce scope for state repair
  assertScopeAllowed({
    actionName: 'STATE_REPAIR',
    actor: actor || 'admin',
    correlationId,
    context: { 
      phone: customer.phone, 
      fromState: customer.conversationState?.currentStep || 'unknown',
      toState 
    }
  });

  // Enforce abuse limits for state repairs
  await assertAbuseAllowed({
    rule: 'state_repairs_per_correlation',
    key: correlationId,
    correlationId,
    actor: actor || 'admin',
    context: { 
      phone: customer.phone, 
      fromState: customer.conversationState?.currentStep || 'unknown',
      toState 
    }
  });

  // SAFE allowlist for state repairs - VERY restrictive
  const safeTransitions = {
    'error': ['welcome'],
    'support': ['welcome'],
    'payment_pending': ['welcome']
  };

  const currentState = customer.conversationState?.currentStep || 'welcome';
  
  if (!safeTransitions[currentState] || !safeTransitions[currentState].includes(toState)) {
    // Emit audit event for unsafe transition
    const denialEvent = {
      eventType: 'state_repair_denied',
      timestamp: new Date().toISOString(),
      correlationId,
      actor,
      fromState: currentState,
      toState,
      reason: 'UNSAFE_TRANSITION',
      customerId: customer._id,
      phone: customer.phone
    };
    
    logger.error('State repair denied - unsafe transition', denialEvent);
    
    const error = new Error(`State repair from ${currentState} to ${toState} not allowed`);
    error.code = 'UNSAFE_TRANSITION';
    throw error;
  }

  // Enforce normal state transition rules
  try {
    assertTransitionAllowed({
      fromState: currentState,
      toState: toState,
      correlationId: correlationId,
      actor: actor || 'admin',
      context: { customerId: customer._id, phone: customer.phone }
    });
  } catch (error) {
    if (error instanceof StateTransitionError) {
      // Emit audit event for denied transition
      const denialEvent = {
        eventType: 'state_repair_denied',
        timestamp: new Date().toISOString(),
        correlationId,
        actor,
        fromState: error.fromState,
        toState: error.toState,
        reason: error.code,
        customerId: customer._id,
        phone: customer.phone
      };
      
      logger.error('State repair denied - transition not allowed', denialEvent);
      
      const newError = new Error('State repair transition not allowed');
      newError.code = 'TRANSITION_DENIED';
      throw newError;
    }
    throw error;
  }

  // Apply the state repair
  if (!customer.conversationState) {
    customer.conversationState = { currentStep: 'welcome' };
  }
  
  customer.conversationState.currentStep = toState;
  customer.conversationState.lastInteraction = new Date();
  customer.conversationState.lastRepairedAt = new Date();
  customer.conversationState.lastRepairReason = justification;
  
  await customer.save();

  // Emit audit event for successful repair
  const successEvent = {
    eventType: 'state_repair_executed',
    timestamp: new Date().toISOString(),
    correlationId,
    actor,
    fromState: currentState,
    toState: toState,
    reason: 'REPAIR_ALLOWED',
    justification,
    customerId: customer._id,
    phone: customer.phone
  };
  
  logger.info('State repair completed', successEvent);

  return customer.conversationState;
}

module.exports = {
  getState,
  setState,
  updateState,
  resetState,
  repairState
};

// PHASE 3 STEP 3.3 COMPLETE WHEN:
// [ ] All state read/write/reset in chatbot.js routed through conversationState
// [ ] No state schema changes introduced
// [ ] chatbot behavior unchanged
// [ ] Router and messageProcessor unchanged except parameter plumbing (if any)
// [ ] Phase 1 & Phase 2 invariants preserved
// [ ] Reverting restores previous inline state access
