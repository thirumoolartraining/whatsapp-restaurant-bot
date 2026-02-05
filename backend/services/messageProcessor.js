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
        return; // Exit gracefully for duplicate
      }
      throw error;
    }

    // New message - continue normal processing
    try {
      return chatbotRouter.routeMessage(
        payload.phone,
        payload.text,
        payload.messageType,
        payload.selectedId,
        payload.senderName,
        correlationId,
        normalizedMessage.providerMessageId
      );
    } catch (error) {
      // Log error before rethrowing to global error handler
      logger.logError(error, 'messageProcessor', null, null, correlationId, normalizedMessage.providerMessageId);
      throw error;
    }

  } catch (error) {
    // Log error before rethrowing to global error handler
    logger.logError(error, 'messageProcessor', null, null, correlationId, normalizedMessage.providerMessageId);
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
