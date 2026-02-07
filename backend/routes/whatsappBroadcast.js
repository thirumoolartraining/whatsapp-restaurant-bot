const express = require('express');
const router = express.Router();
const whatsappBroadcast = require('../services/whatsappBroadcast');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const Logger = require('../services/logger');

const logger = new Logger('whatsappBroadcast');

// Get all WhatsApp contacts
router.get('/contacts', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const contacts = await whatsappBroadcast.getAllContacts();
    res.json({ success: true, contacts });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Get WhatsApp contacts statistics
router.get('/stats', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const stats = await whatsappBroadcast.getStats();
    res.json({ success: true, stats });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Sync existing customers to WhatsApp contacts
router.post('/sync', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const result = await whatsappBroadcast.syncExistingCustomers();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Send offer to all WhatsApp contacts
router.post('/send-offer', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { offerImageUrl, offerTitle, offerDescription, offerType } = req.body;
    
    if (!offerImageUrl && !offerTitle && !offerDescription) {
      return res.status(400).json({ 
        success: false, 
        error: 'At least one of offerImageUrl, offerTitle, or offerDescription is required' 
      });
    }

    // Send offers and wait for actual results
    const result = await whatsappBroadcast.sendOfferToAll(offerImageUrl, offerTitle, offerDescription, offerType);
    
    res.json({
      success: true,
      message: 'Offer broadcast completed',
      result
    });
    
    // Build detailed message for admin
    let message = '';
    if (result.sent > 0) {
      message = `Successfully sent to ${result.sent} customers!\n`;
      if (result.sentViaInteractive > 0) {
        message += `• ${result.sentViaInteractive} via interactive message\n`;
      }
      if (result.sentViaTemplate > 0) {
        message += `• ${result.sentViaTemplate} via template (24h window expired)\n`;
      }
    }
    
    if (result.failed > 0) {
      message += `\nFailed: ${result.failed} customers\n`;
      
      // Group failures by reason
      const failureReasons = {};
      (result.failedContacts || []).forEach(fc => {
        const reason = fc.reason || 'unknown';
        failureReasons[reason] = (failureReasons[reason] || 0) + 1;
      });
      
      Object.entries(failureReasons).forEach(([reason, count]) => {
        if (reason === '24h_no_template') {
          message += `• ${count} outside 24h window (no template configured)\n`;
        } else if (reason === 'test_recipient_restriction') {
          message += `• ${count} test number restrictions\n`;
        } else if (reason === 'template_failed') {
          message += `• ${count} template send failed\n`;
        } else {
          message += `• ${count} other errors\n`;
        }
      });
    }
    
    if (!result.templateConfigured && result.failed > 0) {
      message += `\n⚠️ Tip: Configure WHATSAPP_OFFER_TEMPLATE in .env to reach customers outside 24h window`;
    }
    
    res.json({
      success: result.success && result.sent > 0,
      message: message.trim(),
      total: result.total,
      sent: result.sent,
      sentViaInteractive: result.sentViaInteractive || 0,
      sentViaTemplate: result.sentViaTemplate || 0,
      failed: result.failed,
      failedContacts: result.failedContacts || [],
      successContacts: result.successContacts || [],
      templateConfigured: result.templateConfigured
    });

  } catch (error) {
    logger.error('whatsapp_broadcast_failed', {
      errorCategory: 'provider',
      origin: 'whatsapp_broadcast',
      finality: 'retryable',
      errorMessage: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Test send offer to a single phone number
// Only available in non-production environments
if (process.env.NODE_ENV !== 'production') {
  router.post('/test-send', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { phone, offerImageUrl, offerTitle, offerDescription, offerType } = req.body;
    
    if (!phone) {
      return res.status(400).json({ 
        success: false, 
        error: 'Phone number is required for test' 
      });
    }

    const result = await whatsappBroadcast.sendOfferToSingle(phone, offerImageUrl, offerTitle, offerDescription, offerType);
    
    res.json(result);

  } catch (error) {
    logger.error('whatsapp_broadcast_test_failed', {
      errorCategory: 'provider',
      origin: 'whatsapp_broadcast',
      finality: 'retryable',
      errorMessage: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});
}

module.exports = router;
