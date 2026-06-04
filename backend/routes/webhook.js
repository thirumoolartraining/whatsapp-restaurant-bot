const express = require('express');
const chatbot = require('../services/chatbot');
const messageProcessor = require('../services/messageProcessor');
const whatsapp = require('../services/whatsapp');
const googleSheets = require('../services/googleSheets');
const metaCloud = require('../services/metaCloud');
const groqAi = require('../services/groqAi');
const metaSignatureVerify = require('../middleware/metaSignatureVerify');
const { webhookLimiter } = require('../middleware/rateLimit');
const Logger = require('../services/logger');
const { assertScopeAllowed } = require('../security/scopeRegistry');
const { assertAbuseAllowed, isPhoneLocked } = require('../security/abuseGuard');
const OutboundMessage = require('../models/OutboundMessage');
const DeliveryStatus = require('../models/DeliveryStatus');
const router = express.Router();

const logger = new Logger('webhook');
const isProduction = process.env.NODE_ENV === 'production';


// Process delivery status events from Meta webhooks
async function processStatusEvents(statuses, contactsMap, correlationId) {
  for (const status of statuses || []) {
    try {
      const messageId = status.id;
      const statusType = status.status; // sent, delivered, failed, read
      const timestamp = status.timestamp ? new Date(parseInt(status.timestamp) * 1000) : null;
      const phone = status.recipient_id;
      
      // Extract error information for failed status
      const errorCode = status.errors?.[0]?.code;
      const errorMessage = status.errors?.[0]?.title;
      
      // Create raw event ID for idempotency
      const rawEventId = `${messageId}_${statusType}_${timestamp?.getTime() || Date.now()}`;
      
      // Check for duplicate processing
      const existingEvent = await DeliveryStatus.findOne({ rawEventId });
      if (existingEvent) {
        logger.info('duplicate_status_event_skipped', {
          level: 'info',
          component: 'webhook',
          event: 'duplicate_status_event_skipped',
          timestamp: new Date().toISOString(),
          context: { correlationId, messageId, statusType, rawEventId }
        });
        continue;
      }
      
      // Attempt correlation with outbound message
      let correlationIdFound = null;
      const outboundMessage = await OutboundMessage.findOne({ providerMessageId: messageId });
      if (outboundMessage) {
        correlationIdFound = outboundMessage._id.toString();
      }
      
      // Persist delivery status event
      const deliveryStatus = new DeliveryStatus({
        messageId,
        correlationId: correlationIdFound,
        status: statusType,
        providerTimestamp: timestamp,
        receivedAt: new Date(),
        rawEventId,
        phone,
        errorCode,
        errorMessage
      });
      
      await deliveryStatus.save();
      
      logger.info('delivery_status_persisted', {
        level: 'info',
        component: 'webhook',
        event: 'delivery_status_persisted',
        timestamp: new Date().toISOString(),
        context: { 
          correlationId, 
          messageId, 
          statusType, 
          correlationIdFound,
          phone,
          timestamp
        }
      });
      
    } catch (error) {
      logger.error('status_event_processing_error', {
        errorCategory: 'unknown',
        origin: 'webhook',
        finality: 'terminal',
        messageId: status.id,
        statusType: status.status,
        errorMessage: error.message
      });
      // Continue processing other status events even if one fails
    }
  }
}

// Raw body capture middleware for Meta POST signature verification.
// This must only run on POST /meta; GET /meta is Meta's webhook verification handshake.
const parseMetaRawJson = (req, res, next) => {
  if (!Buffer.isBuffer(req.body)) {
    return res.status(400).json({ error: 'Expected raw JSON body' });
  }

  req.rawBody = req.body;

  try {
    req.body = JSON.parse(req.body.toString('utf8'));
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }

  next();
};

if (!isProduction) {
// Test Google Sheets connection
router.get('/test-sheets', async (req, res) => {
  const correlationId = logger.generateCorrelationId();
  
  logger.info('test_sheets_entry', {
    level: 'info',
    component: 'webhook',
    event: 'test_sheets_entry',
    timestamp: new Date().toISOString(),
    context: { correlationId }
  });
  
  try {
    const testOrder = {
      orderId: 'TEST' + Date.now(),
      customer: { phone: '1234567890', name: 'Test Customer' },
      items: [{ name: 'Test Item', quantity: 1, price: 100 }],
      totalAmount: 100,
      serviceType: 'delivery',
      paymentMethod: 'cod',
      paymentStatus: 'pending',
      status: 'pending',
      deliveryAddress: { address: 'Test Address', latitude: 0, longitude: 0 }
    };

    logger.info('test_sheets_exit', {
      level: 'info',
      component: 'webhook',
      event: 'test_sheets_exit',
      timestamp: new Date().toISOString(),
      context: { correlationId, outcome: 'success', reason: 'test_completed' }
    });
    
    const result = await googleSheets.addOrder(testOrder);
    res.json({ success: result, message: result ? 'Test order added to Google Sheet!' : 'Failed to add order' });
  } catch (error) {
    logger.info('test_sheets_exit', {
      level: 'info',
      component: 'webhook',
      event: 'test_sheets_exit',
      timestamp: new Date().toISOString(),
      context: { correlationId, outcome: 'failed', reason: 'google_sheets_error' }
    });
    
    logger.error('google_sheets_test_failed', {
      errorCategory: 'provider',
      origin: 'google_sheets',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint - send a test message
router.get('/test/:phone', async (req, res) => {
  const { phone } = req.params;
  const correlationId = logger.generateCorrelationId();
  
  logger.info('test_message_entry', {
    level: 'info',
    component: 'webhook',
    event: 'test_message_entry',
    timestamp: new Date().toISOString(),
    context: { correlationId, phone }
  });
  
  try {
    logger.info('test_message_exit', {
      level: 'info',
      component: 'webhook',
      event: 'test_message_exit',
      timestamp: new Date().toISOString(),
      context: { correlationId, phone, outcome: 'success', reason: 'message_sent' }
    });
    
    await whatsapp.sendMessage(phone, '✅ Test message from your Restaurant Bot!');
    res.json({ success: true, message: 'Test message sent to ' + phone });
  } catch (error) {
    logger.info('test_message_exit', {
      level: 'info',
      component: 'webhook',
      event: 'test_message_exit',
      timestamp: new Date().toISOString(),
      context: { correlationId, phone, outcome: 'failed', reason: 'whatsapp_error' }
    });
    
    logger.error('test_message_failed', {
      errorCategory: 'provider',
      origin: 'whatsapp',
      finality: 'terminal',
      phone,
      errorMessage: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test endpoint - send welcome menu with buttons
router.get('/test-menu/:phone', async (req, res) => {
  try {
    const { phone } = req.params;
    await messageProcessor.processInboundMessage({
      provider: 'meta',
      payload: {
        phone,
        text: 'hi',
        messageType: 'text',
        selectedId: null,
        senderName: null
      },
      reqId: `test_menu_${Date.now()}_${phone}`
    });
    res.json({ success: true, message: 'Welcome menu sent to ' + phone });
  } catch (error) {
    logger.error('test_menu_failed', {
      errorCategory: 'provider',
      origin: 'message_processor',
      finality: 'terminal',
      phone,
      errorMessage: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Simulate incoming message (for testing when Meta test number doesn't forward messages)
router.post('/simulate', express.json(), async (req, res) => {
  try {
    const { phone, message, selectedId } = req.body;
    const messageType = selectedId ? 'list' : 'text';
    logger.info('message_simulated', {
      level: 'info',
      component: 'webhook',
      event: 'message_simulated',
      timestamp: new Date().toISOString(),
      context: { phone, message, messageType, selectedId }
    });
    await messageProcessor.processInboundMessage({
      provider: 'meta',
      payload: {
        phone,
        text: message || '',
        messageType,
        selectedId: selectedId || null,
        senderName: null
      },
      reqId: `simulate_${Date.now()}_${phone}`
    });
    res.json({ success: true, message: 'Simulated message processed' });
  } catch (error) {
    logger.error('simulate_message_failed', {
      errorCategory: 'provider',
      origin: 'message_processor',
      finality: 'terminal',
      phone,
      errorMessage: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Debug endpoint to check customer state
router.get('/debug/:phone', async (req, res) => {
  try {
    const Customer = require('../models/Customer');
    const customer = await Customer.findOne({ phone: req.params.phone }).populate('cart.menuItem');
    if (!customer) {
      return res.json({ error: 'Customer not found' });
    }
    res.json({
      phone: customer.phone,
      cart: customer.cart,
      conversationState: customer.conversationState
    });
  } catch (error) {
    logger.error('debug_customer_failed', {
      errorCategory: 'validation',
      origin: 'database',
      finality: 'terminal',
      phone: req.params.phone,
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

}

// Health check for webhook
router.get('/whatsapp', (req, res) => {
  res.json({ status: 'Webhook is active', timestamp: new Date().toISOString() });
});

// Meta WhatsApp Cloud API webhook verification
router.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  // Verify token should match what you set in Meta dashboard
  const verifyToken = process.env.META_VERIFY_TOKEN || 'restaurant_bot_verify';

  logger.info('webhook_verification_attempt', {
    level: 'info',
    component: 'webhook',
    event: 'webhook_verification_attempt',
    timestamp: new Date().toISOString(),
    context: { mode, token, expectedToken: verifyToken, challenge: challenge ? 'present' : 'missing' }
  });

  if (mode === 'subscribe' && token === verifyToken) {
    logger.info('webhook_verified', {
      level: 'info',
      component: 'webhook',
      event: 'webhook_verified',
      timestamp: new Date().toISOString(),
      context: {}
    });
    res.status(200).send(challenge);
  } else if (!mode && !token) {
    // Simple health check (no verification params)
    res.json({ status: 'Webhook endpoint active', timestamp: new Date().toISOString() });
  } else {
    logger.warn('webhook_verification_failed', {
      level: 'warn',
      component: 'webhook',
      event: 'webhook_verification_failed',
      timestamp: new Date().toISOString(),
      context: { reason: 'token_mismatch' }
    });
    res.sendStatus(403);
  }
});

// Meta WhatsApp Cloud API webhook endpoint
router.post('/meta', express.raw({ type: 'application/json' }), parseMetaRawJson, metaSignatureVerify, webhookLimiter, async (req, res) => {
  const correlationId = logger.generateCorrelationId();
  
  logger.info('webhook_entry', {
    level: 'info',
    component: 'webhook',
    event: 'webhook_entry',
    timestamp: new Date().toISOString(),
    context: { correlationId }
  });
  
  logger.info('webhook_received', {
    level: 'info',
    component: 'webhook',
    event: 'webhook_received',
    timestamp: new Date().toISOString(),
    context: { body: req.body }
  });
  
  // 1. Respond to Meta IMMEDIATELY to avoid timeouts (prevents 'single tick' issue)
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.object === 'whatsapp_business_account') {
      for (const entry of body.entry || []) {
        for (const change of entry.changes || []) {
          if (change.field === 'messages') {
            const value = change.value;

            // Extract contact name from Meta API contacts array (needed for both messages and status)
            const contacts = value.contacts || [];
            const contactsMap = {};
            for (const contact of contacts) {
              if (contact.wa_id && contact.profile?.name) {
                contactsMap[contact.wa_id] = contact.profile.name;
              }
            }

            // Process status updates (delivery receipts, read receipts)
            if (value.statuses) {
              // Process status events in background, don't block webhook response
              processStatusEvents(value.statuses, contactsMap, correlationId).catch(err => {
                logger.error('status_processing_failed', {
                  errorCategory: 'unknown',
                  origin: 'webhook',
                  finality: 'terminal',
                  errorMessage: err.message
                });
              });
              continue;
            }

            for (const message of value.messages || []) {
              const phone = message.from;
              const senderName = contactsMap[phone] || null;
              let text = '';
              let messageType = 'text';
              let selectedId = null;

              if (message.type === 'text') {
                text = message.text?.body || '';
              } else if (message.type === 'interactive') {
                if (message.interactive?.type === 'button_reply') {
                  selectedId = message.interactive.button_reply?.id || '';
                  text = message.interactive.button_reply?.title || '';
                  messageType = 'button';
                } else if (message.interactive?.type === 'list_reply') {
                  selectedId = message.interactive.list_reply?.id || '';
                  text = message.interactive.list_reply?.title || '';
                  messageType = 'list';
                }
              } else if (message.type === 'location') {
                messageType = 'location';
                text = {
                  latitude: message.location?.latitude,
                  longitude: message.location?.longitude,
                  name: message.location?.name || '',
                  address: message.location?.address || ''
                };
              } else if (message.type === 'audio') {
                // Handle voice message
                messageType = 'voice';
                const audioId = message.audio?.id;
                logger.info('voice_message_received', {
                  level: 'info',
                  component: 'webhook',
                  event: 'voice_message_received',
                  timestamp: new Date().toISOString(),
                  context: { correlationId, audioId }
                });
                
                if (audioId) {
                  let audioBuffer;
                  try {
                    // Download and transcribe the audio
                    audioBuffer = await metaCloud.downloadMedia(audioId);
                    let transcription = await groqAi.transcribeAudio(audioBuffer, message.audio?.mime_type || 'audio/ogg');
                    
                    if (transcription && transcription.trim()) {
                      // Normalize transcription to fix common voice recognition mistakes
                      const rawTranscription = transcription.trim();
                      transcription = groqAi.normalizeTranscription(rawTranscription);
                      
                      text = transcription;
                      messageType = 'text'; // Treat as text after transcription
                      logger.info('voice_transcribed', {
                        level: 'info',
                        component: 'webhook',
                        event: 'voice_transcribed',
                        timestamp: new Date().toISOString(),
                        context: { correlationId, rawTranscription, normalizedTranscription: text }
                      });
                    } else {
                      // Transcription failed - emit audit event
                      logger.error('voice_processing_failed', {
                        level: 'error',
                        component: 'webhook',
                        event: 'voice_processing_failed',
                        timestamp: new Date().toISOString(),
                        context: { 
                          correlationId,
                          phone,
                          errorCategory: 'transcription_failed',
                          audioId,
                          payloadSize: audioBuffer ? audioBuffer.length : null
                        }
                      });
                      
                      await whatsapp.sendButtons(phone, 
                        "🎤 Sorry, I couldn't understand your voice message. Please try again or type your message.",
                        [
                          { id: 'home', text: 'Main Menu' },
                          { id: 'help', text: 'Help' }
                        ]
                      );
                      continue;
                    }
                  } catch (err) {
                    // Voice processing failed - emit audit event
                    let errorCategory = 'transcription_failed';
                    if (err.message.includes('format') || err.message.includes('mime')) {
                      errorCategory = 'format_unsupported';
                    } else if (err.message.includes('size') || err.message.includes('large')) {
                      errorCategory = 'size_exceeded';
                    }
                    
                    logger.error('voice_processing_failed', {
                      level: 'error',
                      component: 'webhook',
                      event: 'voice_processing_failed',
                      timestamp: new Date().toISOString(),
                      context: { 
                        correlationId,
                        phone,
                        errorCategory,
                        audioId,
                        payloadSize: audioBuffer ? audioBuffer.length : null,
                        errorMessage: err.message
                      }
                    });
                    
                    await whatsapp.sendButtons(phone,
                      "🎤 Sorry, I couldn't process your voice message. Please type your message instead.",
                      [
                        { id: 'home', text: 'Main Menu' },
                        { id: 'help', text: 'Help' }
                      ]
                    );
                    continue;
                  }
                }
              }

              const hasContent = text || selectedId || messageType === 'location';
              if (phone && hasContent) {
                // Check if phone is locked for abuse violations
                const phoneLocked = await isPhoneLocked(phone);
                if (phoneLocked) {
                  logger.warn('Inbound message rejected - phone locked', {
                    level: 'warn',
                    component: 'webhook',
                    event: 'abuse_locked',
                    timestamp: new Date().toISOString(),
                    context: { correlationId, phone, messageType }
                  });
                  
                  // Send safe user message for lockout
                  await whatsapp.sendMessage(phone, "You're sending messages too fast. Please wait a few minutes.", correlationId);
                  continue;
                }

                // Enforce abuse limits for inbound messages
                try {
                  await assertAbuseAllowed({
                    rule: 'inbound_per_phone_per_minute',
                    key: phone,
                    correlationId,
                    actor: 'system',
                    context: { phone, messageType, hasContent }
                  });
                } catch (abuseError) {
                  if (abuseError.code === 'ABUSE_LIMIT_EXCEEDED') {
                    logger.warn('Inbound message rejected - abuse limit exceeded', {
                      level: 'warn',
                      component: 'webhook',
                      event: 'abuse_denied',
                      timestamp: new Date().toISOString(),
                      context: { 
                        correlationId, 
                        phone, 
                        messageType, 
                        rule: 'inbound_per_phone_per_minute',
                        remaining: abuseError.remaining,
                        resetAt: abuseError.resetAt
                      }
                    });
                    
                    // Send safe user message for rate limiting
                    await whatsapp.sendMessage(phone, "You're sending messages too fast. Please wait a few minutes.", correlationId);
                    continue;
                  }
                  throw abuseError; // Re-throw other errors
                }

                // Enforce scope for inbound message processing
                assertScopeAllowed({
                  actionName: 'INBOUND_MESSAGE_ACCEPT',
                  actor: 'system',
                  correlationId,
                  context: { phone, messageType, hasContent }
                });

                // Process message in the background
                messageProcessor.processInboundMessage({
                  provider: 'meta',
                  payload: {
                    phone,
                    text,
                    messageType,
                    selectedId,
                    senderName,
                    message
                  },
                  reqId: `msg_${Date.now()}_${phone}`
                }).catch(err => logger.error('async_chatbot_error', {
                  errorCategory: 'unknown',
                  origin: 'message_processor',
                  finality: 'terminal',
                  phone,
                  errorMessage: err.message
                }));
              }
            }
          }
        }
      }
    }
    
    logger.info('webhook_exit', {
      level: 'info',
      component: 'webhook',
      event: 'webhook_exit',
      timestamp: new Date().toISOString(),
      context: { correlationId, outcome: 'success', reason: 'processing_completed' }
    });
  } catch (error) {
    logger.info('webhook_exit', {
      level: 'info',
      component: 'webhook',
      event: 'webhook_exit',
      timestamp: new Date().toISOString(),
      context: { correlationId, outcome: 'failed', reason: 'processing_error' }
    });
    
    logger.error('webhook_processing_failed', {
      errorCategory: 'unknown',
      origin: 'webhook',
      finality: 'terminal',
      errorMessage: error.message
    });
  }
});

module.exports = router;
