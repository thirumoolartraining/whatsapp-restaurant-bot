/*
 Phase 3 Step 0:
 Chatbot containment hardening.
 All chatbot invocations flow exclusively through messageProcessor.
 No behavior change.
*/

const chatbotRouter = require('./chatbotRouter');
const InboundMessage = require('../models/InboundMessage');
const crypto = require('crypto');

async function processInboundMessage({ provider, payload, reqId }) {
  // Normalize inbound Meta payload
  const normalizedMessage = {
    provider: "meta",
    providerMessageId: payload.message?.id || null,
    fromPhone: payload.phone,
    messageType: payload.messageType,
    rawPayload: payload
  };

  // Log once at entry
  console.log('📨 Message envelope received:', {
    provider: normalizedMessage.provider,
    providerMessageId: normalizedMessage.providerMessageId,
    fromPhone: normalizedMessage.fromPhone,
    messageType: normalizedMessage.messageType,
    reqId
  });

  // Idempotency check - ensure message processed at most once
  let messageIdForIdempotency = normalizedMessage.providerMessageId;
  let usedFallback = false;

  if (!messageIdForIdempotency) {
    // Generate conservative fallback key
    const minuteTimestamp = Math.floor(Date.now() / 60000) * 60000;
    const fallbackData = `${normalizedMessage.fromPhone}${normalizedMessage.messageType}${minuteTimestamp}`;
    messageIdForIdempotency = crypto.createHash('sha256').update(fallbackData).digest('hex').substring(0, 16);
    usedFallback = true;
    console.log('⚠️  Using fallback message ID for idempotency:', messageIdForIdempotency);
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
        console.log('🔄 Duplicate message ignored:', {
          provider: normalizedMessage.provider,
          providerMessageId: messageIdForIdempotency,
          fromPhone: normalizedMessage.fromPhone
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
        payload.senderName
      );
    } catch (error) {
      // Rethrow to global error handler
      throw error;
    }

  } catch (error) {
    // Rethrow to global error handler
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
