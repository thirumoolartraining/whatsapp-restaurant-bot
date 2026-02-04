// WhatsApp Service - Meta Cloud API
const metaCloud = require('./metaCloud');
const OutboundMessage = require('../models/OutboundMessage');

const whatsapp = {
  async sendMessage(phone, message) {
    const payload = { phone, message };
    const outboundMessage = await createOutboundMessage(phone, 'text', payload);
    
    try {
      const result = await metaCloud.sendMessage(phone, message);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendButtons(phone, message, buttons, footer = '') {
    const payload = { phone, message, buttons, footer };
    const outboundMessage = await createOutboundMessage(phone, 'buttons', payload);
    
    try {
      const result = await metaCloud.sendButtons(phone, message, buttons, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendList(phone, title, description, buttonText, sections, footer = '') {
    const payload = { phone, title, description, buttonText, sections, footer };
    const outboundMessage = await createOutboundMessage(phone, 'list', payload);
    
    try {
      const result = await metaCloud.sendList(phone, title, description, buttonText, sections, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendTemplateButtons(phone, message, buttons, footer = '') {
    const payload = { phone, message, buttons, footer };
    const outboundMessage = await createOutboundMessage(phone, 'template_buttons', payload);
    
    try {
      const result = await metaCloud.sendTemplateButtons(phone, message, buttons, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendOrder(phone, order, items, paymentUrl, imageUrl = null) {
    const payload = { phone, order, items, paymentUrl, imageUrl };
    const outboundMessage = await createOutboundMessage(phone, 'order', payload);
    
    try {
      const result = await metaCloud.sendOrder(phone, order, items, paymentUrl, imageUrl);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendImage(phone, imageUrl, caption = '') {
    const payload = { phone, imageUrl, caption };
    const outboundMessage = await createOutboundMessage(phone, 'image', payload);
    
    try {
      const result = await metaCloud.sendImage(phone, imageUrl, caption);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendImageWithButtons(phone, imageUrl, message, buttons, footer = '') {
    const payload = { phone, imageUrl, message, buttons, footer };
    const outboundMessage = await createOutboundMessage(phone, 'image_buttons', payload);
    
    try {
      const result = await metaCloud.sendImageWithButtons(phone, imageUrl, message, buttons, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendLocationRequest(phone, message) {
    const payload = { phone, message };
    const outboundMessage = await createOutboundMessage(phone, 'location_request', payload);
    
    try {
      const result = await metaCloud.sendLocationRequest(phone, message);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendCtaUrl(phone, message, buttonText, url, footer = '') {
    const payload = { phone, message, buttonText, url, footer };
    const outboundMessage = await createOutboundMessage(phone, 'cta_url', payload);
    
    try {
      const result = await metaCloud.sendCtaUrl(phone, message, buttonText, url, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendImageWithCtaUrl(phone, imageUrl, message, buttonText, url, footer = '') {
    const payload = { phone, imageUrl, message, buttonText, url, footer };
    const outboundMessage = await createOutboundMessage(phone, 'image_cta_url', payload);
    
    try {
      const result = await metaCloud.sendImageWithCtaUrl(phone, imageUrl, message, buttonText, url, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendImageWithCtaUrlOriginal(phone, imageUrl, message, buttonText, url, footer = '') {
    const payload = { phone, imageUrl, message, buttonText, url, footer };
    const outboundMessage = await createOutboundMessage(phone, 'image_cta_url_original', payload);
    
    try {
      const result = await metaCloud.sendImageWithCtaUrlOriginal(phone, imageUrl, message, buttonText, url, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendCtaPhone(phone, message, buttonText, phoneNumber, footer = '') {
    const payload = { phone, message, buttonText, phoneNumber, footer };
    const outboundMessage = await createOutboundMessage(phone, 'cta_phone', payload);
    
    try {
      const result = await metaCloud.sendCtaPhone(phone, message, buttonText, phoneNumber, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendImageWithCtaPhone(phone, imageUrl, message, buttonText, phoneNumber, footer = '') {
    const payload = { phone, imageUrl, message, buttonText, phoneNumber, footer };
    const outboundMessage = await createOutboundMessage(phone, 'image_cta_phone', payload);
    
    try {
      const result = await metaCloud.sendImageWithCtaPhone(phone, imageUrl, message, buttonText, phoneNumber, footer);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendMarketingTemplate(phone, templateName, imageUrl, bodyParams = [], buttonUrl = null) {
    const payload = { phone, templateName, imageUrl, bodyParams, buttonUrl };
    const outboundMessage = await createOutboundMessage(phone, 'marketing_template', payload);
    
    try {
      const result = await metaCloud.sendMarketingTemplate(phone, templateName, imageUrl, bodyParams, buttonUrl);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  },

  async sendSimpleTemplate(phone, templateName = 'hello_world', languageCode = 'en_US') {
    const payload = { phone, templateName, languageCode };
    const outboundMessage = await createOutboundMessage(phone, 'simple_template', payload);
    
    try {
      const result = await metaCloud.sendSimpleTemplate(phone, templateName, languageCode);
      await updateOutboundMessageSuccess(outboundMessage, result);
      return result;
    } catch (error) {
      await updateOutboundMessageFailure(outboundMessage, error);
      throw error;
    }
  }
};

// Helper functions for outbound message tracking
async function createOutboundMessage(toPhone, messageType, payload) {
  try {
    return await OutboundMessage.create({
      provider: 'meta',
      toPhone,
      messageType,
      payload,
      status: 'pending'
    });
  } catch (error) {
    console.error('Failed to create outbound message record:', error);
    return null;
  }
}

// Classify WhatsApp API failures
function classifyFailure(error) {
  const errorData = error.response?.data?.error;
  const errorCode = errorData?.code;
  const httpStatus = error.response?.status;
  
  // Policy failures (non-retriable)
  const policyErrorCodes = [
    131047, // 24-hour messaging window violation
    131051, // Template not approved
    131026, // User blocked business
    131009, // Invalid message type for conversation state
    131014, // Message rejected due to policy violation
    131025, // Recipient cannot receive messages
    131032, // Template message namespace mismatch
    131043, // Media upload error due to policy
    131053, // Business account restricted
    131055, // Phone number not connected
    131056, // Rate limit exceeded for template messaging
  ];
  
  // Check for policy failures by error code
  if (policyErrorCodes.includes(errorCode)) {
    return 'policy';
  }
  
  // Check for policy failures by HTTP status
  if (httpStatus === 400 || httpStatus === 403 || httpStatus === 422) {
    return 'policy';
  }
  
  // Check for specific policy error messages
  const errorMessage = (errorData?.message || '').toLowerCase();
  const policyKeywords = [
    '24 hour window',
    'template not approved',
    'user blocked',
    'invalid message type',
    'policy violation',
    'cannot receive messages',
    'business account restricted',
    'phone number not connected'
  ];
  
  if (policyKeywords.some(keyword => errorMessage.includes(keyword))) {
    return 'policy';
  }
  
  // Transient failures (potentially retriable)
  if (httpStatus >= 500 || httpStatus === 429 || errorCode === 130429) {
    return 'transient';
  }
  
  // Network errors and timeouts
  if (error.code === 'ECONNRESET' || error.code === 'ETIMEDOUT' || error.code === 'ENOTFOUND') {
    return 'transient';
  }
  
  // Default to transient for unknown errors
  return 'transient';
}

async function updateOutboundMessageSuccess(outboundMessage, result) {
  if (!outboundMessage) return;
  
  try {
    await OutboundMessage.findByIdAndUpdate(outboundMessage._id, {
      status: 'sent',
      providerMessageId: result.messageId || result.id || null
    });
  } catch (error) {
    console.error('Failed to update outbound message success:', error);
  }
}

async function updateOutboundMessageFailure(outboundMessage, error) {
  if (!outboundMessage) return;
  
  try {
    const errorCategory = classifyFailure(error);
    const errorData = error.response?.data?.error;
    const errorCode = errorData?.code || error.code || error.status || 'UNKNOWN';
    
    // Log failure classification
    console.log(`WhatsApp failure - messageId: ${outboundMessage._id}, errorCategory: ${errorCategory}, errorCode: ${errorCode}`);
    
    await OutboundMessage.findByIdAndUpdate(outboundMessage._id, {
      status: 'failed',
      errorCode,
      errorMessage: error.message || error.toString(),
      errorCategory
    });
  } catch (updateError) {
    console.error('Failed to update outbound message failure:', updateError);
  }
}

module.exports = whatsapp;

/*
STEP 6 COMPLETE WHEN:
[ ] All outbound failures are classified as policy or transient
[ ] Classification does not alter message behavior
[ ] No retries are introduced
[ ] No chatbot or webhook logic was modified
[ ] Reverting this commit restores previous behavior
*/
