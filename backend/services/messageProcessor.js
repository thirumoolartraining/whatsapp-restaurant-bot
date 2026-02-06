/*
 Phase 3 Step 0:
 Chatbot containment hardening.
 All chatbot invocations flow exclusively through messageProcessor.
 No behavior change.
*/

const chatbotRouter = require('./chatbotRouter');
const InboundMessage = require('../models/InboundMessage');
const Logger = require('./logger');
const crypto = require('crypto');

const logger = new Logger('messageProcessor');

async function processInboundMessage({ provider, payload, reqId }) {
  // Generate correlation ID for this message processing flow
  const correlationId = logger.generateCorrelationId();
  
  logger.info('message_processor_entry', {
    level: 'info',
    component: 'messageProcessor',
    event: 'message_processor_entry',
    timestamp: new Date().toISOString(),
    context: { correlationId, provider, reqId }
  });
  
  // Normalize inbound Meta payload
  const normalizedMessage = {
    provider: "meta",
    providerMessageId: payload.message?.id || null,
    fromPhone: payload.phone,
    messageType: payload.messageType,
    rawPayload: payload
  };

  // Log inbound message with structured format
  logger.logMessageProcessing(
    normalizedMessage.provider,
    normalizedMessage.providerMessageId,
    normalizedMessage.fromPhone,
    normalizedMessage.messageType,
    correlationId
  );

  // Idempotency check - ensure message processed at most once
  let messageIdForIdempotency = normalizedMessage.providerMessageId;
  let usedFallback = false;

  if (!messageIdForIdempotency) {
    // Generate conservative fallback key
    const minuteTimestamp = Math.floor(Date.now() / 60000) * 60000;
    const fallbackData = `${normalizedMessage.fromPhone}${normalizedMessage.messageType}${minuteTimestamp}`;
    messageIdForIdempotency = crypto.createHash('sha256').update(fallbackData).digest('hex').substring(0, 16);
    usedFallback = true;
    logger.warn('Using fallback message ID for idempotency', {
      fallbackMessageId: messageIdForIdempotency,
      correlationId
    });
  }

  try {
    // Attempt to insert inbound message record for idempotency
    try {
      await InboundMessage.create({
        provider: normalizedMessage.provider,
        providerMessageId: messageIdForIdempotency,
        fromPhone: normalizedMessage.fromPhone
      });
    } catch (error) {
      if (error.code === 11000) {
        // Duplicate key - message already processed
        logger.info('Duplicate message ignored', {
          provider: normalizedMessage.provider,
          providerMessageId: messageIdForIdempotency,
          fromPhone: normalizedMessage.fromPhone,
          correlationId
        });
        
        logger.info('message_processor_exit', {
          level: 'info',
          component: 'messageProcessor',
          event: 'message_processor_exit',
          timestamp: new Date().toISOString(),
          context: { correlationId, outcome: 'success', reason: 'duplicate_ignored' }
        });
        
        return; // Exit gracefully for duplicate
      }
      throw error;
    }

    // New message - continue normal processing
    try {
      const result = await chatbotRouter.routeMessage(
        payload.phone,
        payload.text,
        payload.messageType,
        payload.selectedId,
        payload.senderName,
        correlationId,
        normalizedMessage.providerMessageId
      );
      
      logger.info('message_processor_exit', {
        level: 'info',
        component: 'messageProcessor',
        event: 'message_processor_exit',
        timestamp: new Date().toISOString(),
        context: { correlationId, outcome: 'success', reason: 'message_routed' }
      });
      
      return result;
    } catch (error) {
      // Log error before rethrowing to global error handler
      logger.logError(error, 'messageProcessor', null, null, correlationId, normalizedMessage.providerMessageId);
      
      logger.info('message_processor_exit', {
        level: 'info',
        component: 'messageProcessor',
        event: 'message_processor_exit',
        timestamp: new Date().toISOString(),
        context: { correlationId, outcome: 'failed', reason: 'routing_error' }
      });
      
      throw error;
    }

  } catch (error) {
    // Log error before rethrowing to global error handler
    logger.logError(error, 'messageProcessor', null, null, correlationId, normalizedMessage.providerMessageId);
    
    logger.info('message_processor_exit', {
      level: 'info',
      component: 'messageProcessor',
      event: 'message_processor_exit',
      timestamp: new Date().toISOString(),
      context: { correlationId, outcome: 'failed', reason: 'processing_error' }
    });
    
    throw error;
  }
}

module.exports = {
  processInboundMessage
};

// PHASE 3 STEP 0 COMPLETE WHEN:
// [✓] No direct calls to chatbot exist outside messageProcessor
// [✓] webhook.js routes invoke messageProcessor only
// [✓] polling.js invokes messageProcessor only (if applicable)
// [✓] chatbot.js unchanged
// [✓] Phase 1 & Phase 2 invariants preserved
// [✓] Removing this change restores previous wiring
