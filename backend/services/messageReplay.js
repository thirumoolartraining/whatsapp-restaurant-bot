/**
 * Message Replay Service
 * Phase 6.2.1: MESSAGE_REPLAY intervention wiring
 * 
 * Provides controlled replay of outbound messages only with executed intervention.
 */

const OutboundMessage = require('../models/OutboundMessage');
const Intervention = require('../models/Intervention');
const { assertScopeAllowed } = require('../security/scopeRegistry');
const { assertAbuseAllowed } = require('../security/abuseGuard');
const { add: addJob } = require('./queue');
const Logger = require('./logger');

const logger = new Logger('messageReplay');

/**
 * Replay an outbound message via intervention
 * @param {Object} params - Replay parameters
 * @param {string} params.correlationId - Correlation ID for tracking
 * @param {string} params.actor - Actor performing replay
 * @param {string} params.justification - Reason for replay
 * @returns {Object} Replay result with job ID
 */
async function replayOutboundMessage({ correlationId, actor, justification }) {
  if (!correlationId) {
    throw new Error('Correlation ID required for message replay');
  }

  // Check for executed MESSAGE_REPLAY intervention
  const intervention = await Intervention.findUnconsumed(correlationId, 'MESSAGE_REPLAY');
  if (!intervention) {
    // Emit audit event for denial
    const denialEvent = {
      eventType: 'message_replay_denied',
      timestamp: new Date().toISOString(),
      correlationId,
      actor,
      reason: 'NO_INTERVENTION',
      justification
    };
    
    logger.error('Message replay denied - no intervention', denialEvent);
    
    const error = new Error('Message replay requires executed MESSAGE_REPLAY intervention');
    error.code = 'INTERVENTION_REQUIRED';
    throw error;
  }

  // Enforce scope for message replay
  assertScopeAllowed({
    actionName: 'MESSAGE_REPLAY',
    actor: actor || 'admin',
    correlationId,
    context: { justification }
  });

  // Enforce abuse limits for message replays
  await assertAbuseAllowed({
    rule: 'message_replays_per_correlation',
    key: correlationId,
    correlationId,
    actor: actor || 'admin',
    context: { justification }
  });

  // Find the last outbound message for this correlationId
  const outboundMessage = await OutboundMessage.findOne({ correlationId })
    .sort({ createdAt: -1 })
    .limit(1);

  if (!outboundMessage) {
    // Emit audit event for denial
    const denialEvent = {
      eventType: 'message_replay_denied',
      timestamp: new Date().toISOString(),
      correlationId,
      actor,
      reason: 'NO_MESSAGE_FOUND',
      justification
    };
    
    logger.error('Message replay denied - no message found', denialEvent);
    
    const error = new Error('No outbound message found for replay');
    error.code = 'NO_MESSAGE_FOUND';
    throw error;
  }

  // Check if message has persisted payload
  if (!outboundMessage.payload) {
    // Emit audit event for denial
    const denialEvent = {
      eventType: 'message_replay_denied',
      timestamp: new Date().toISOString(),
      correlationId,
      actor,
      reason: 'NO_PERSISTED_PAYLOAD',
      justification,
      outboundMessageId: outboundMessage._id
    };
    
    logger.error('Message replay denied - no persisted payload', denialEvent);
    
    const error = new Error('Cannot replay message without persisted payload');
    error.code = 'NO_PERSISTED_PAYLOAD';
    throw error;
  }

  // Create replay job with distinct job name
  const replayPayload = {
    ...outboundMessage.payload,
    originalOutboundMessageId: outboundMessage._id,
    replayCorrelationId: correlationId,
    replayJustification: justification,
    replayActor: actor
  };

  const job = await addJob('sendWhatsAppMessageReplay', replayPayload, {
    correlationId,
    delay: 0,
    attempts: 3
  });

  // Emit audit event for successful replay
  const successEvent = {
    eventType: 'message_replay_executed',
    timestamp: new Date().toISOString(),
    correlationId,
    actor,
    reason: 'REPLAY_ALLOWED',
    justification,
    originalOutboundMessageId: outboundMessage._id,
    replayJobId: job.id,
    methodName: outboundMessage.payload?.methodName || 'unknown'
  };
  
  logger.info('Message replay completed', successEvent);

  return {
    action: 'message_replay_executed',
    replayJobId: job.id,
    originalOutboundMessageId: outboundMessage._id,
    methodName: outboundMessage.payload?.methodName || 'unknown'
  };
}

module.exports = {
  replayOutboundMessage
};
