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
const router = express.Router();

const logger = new Logger('webhook');

// Raw body capture middleware for signature verification
router.use('/meta', express.raw({ type: 'application/json' }), (req, res, next) => {
  req.rawBody = req.body;
  // Parse JSON body normally for downstream processing
  try {
    req.body = JSON.parse(req.body);
  } catch (error) {
    return res.status(400).json({ error: 'Invalid JSON' });
  }
  next();
});

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
router.post('/simulate', async (req, res) => {
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
router.post('/meta', metaSignatureVerify, webhookLimiter, async (req, res) => {
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

            // Skip status updates (delivery receipts, read receipts)
            if (value.statuses) {
              continue;
            }

            // Extract contact name from Meta API contacts array
            const contacts = value.contacts || [];
            const contactsMap = {};
            for (const contact of contacts) {
              if (contact.wa_id && contact.profile?.name) {
                contactsMap[contact.wa_id] = contact.profile.name;
              }
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
                  context: { audioId }
                });
                
                if (audioId) {
                  try {
                    // Download and transcribe the audio
                    const audioBuffer = await metaCloud.downloadMedia(audioId);
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
                        context: { rawTranscription, normalizedTranscription: text }
                      });
                    } else {
                      // Transcription failed, send error message
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
                    logger.error('voice_processing_failed', {
                      errorCategory: 'provider',
                      origin: 'voice_transcription',
                      finality: 'retryable',
                      phone,
                      audioId,
                      errorMessage: err.message
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
