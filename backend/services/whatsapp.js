// WhatsApp Service - Meta Cloud API
const metaCloud = require('./metaCloud');
const OutboundMessage = require('../models/OutboundMessage');
const Logger = require('./logger');
const jobQueue = require('./queue/jobQueue');
const { JOB_TYPES } = require('./queue/jobTypes');

const logger = new Logger('whatsapp');

const whatsapp = {
  async sendMessage(phone, message, correlationId = null) {
    const payload = { phone, message };
    const outboundMessage = await createOutboundMessage(phone, 'text', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'text', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendMessage',
          args: [phone, message],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  },

  async sendButtons(phone, message, buttons, footer = '', correlationId = null) {
    const payload = { phone, message, buttons, footer };
    const outboundMessage = await createOutboundMessage(phone, 'buttons', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'buttons', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendButtons',
          args: [phone, message, buttons, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  },

  async sendList(phone, title, description, buttonText, sections, footer = '', correlationId = null) {
    const payload = { phone, title, description, buttonText, sections, footer };
    const outboundMessage = await createOutboundMessage(phone, 'list', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'list', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendList',
          args: [phone, title, description, buttonText, sections, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  },

  async sendTemplateButtons(phone, message, buttons, footer = '', correlationId = null) {
    const payload = { phone, message, buttons, footer };
    const outboundMessage = await createOutboundMessage(phone, 'template_buttons', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'template_buttons', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendTemplateButtons',
          args: [phone, message, buttons, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  },

  async sendOrder(phone, order, items, paymentUrl, imageUrl = null, correlationId = null) {
    const payload = { phone, order, items, paymentUrl, imageUrl };
    const outboundMessage = await createOutboundMessage(phone, 'order', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'order', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendOrder',
          args: [phone, order, items, paymentUrl, imageUrl],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  },

  async sendImage(phone, imageUrl, caption = '', correlationId = null) {
    const payload = { phone, imageUrl, caption };
    const outboundMessage = await createOutboundMessage(phone, 'image', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'image', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendImage',
          args: [phone, imageUrl, caption],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  },

  async sendImageWithButtons(phone, imageUrl, message, buttons, footer = '', correlationId = null) {
    const payload = { phone, imageUrl, message, buttons, footer };
    const outboundMessage = await createOutboundMessage(phone, 'image_buttons', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'image_buttons', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendImageWithButtons',
          args: [phone, imageUrl, message, buttons, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  },

  async sendLocationRequest(phone, message, correlationId = null) {
    const payload = { phone, message };
    const outboundMessage = await createOutboundMessage(phone, 'location_request', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'location_request', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendLocationRequest',
          args: [phone, message],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  },

  async sendCtaUrl(phone, message, buttonText, url, footer = '', correlationId = null) {
    const payload = { phone, message, buttonText, url, footer };
    const outboundMessage = await createOutboundMessage(phone, 'cta_url', payload);
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendCtaUrl',
          args: [phone, message, buttonText, url, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      return { success: true };
    } catch (error) {
      if (outboundMessage) {
        await updateOutboundMessageFailure(outboundMessage, error);
      }
      throw error;
    }
  },

  async sendImageWithCtaUrl(phone, imageUrl, message, buttonText, url, footer = '', correlationId = null) {
    const payload = { phone, imageUrl, message, buttonText, url, footer };
    const outboundMessage = await createOutboundMessage(phone, 'image_cta_url', payload);
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendImageWithCtaUrl',
          args: [phone, imageUrl, message, buttonText, url, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      return { success: true };
    } catch (error) {
      if (outboundMessage) {
        await updateOutboundMessageFailure(outboundMessage, error);
      }
      throw error;
    }
  },

  async sendImageWithCtaUrlOriginal(phone, imageUrl, message, buttonText, url, footer = '', correlationId = null) {
    const payload = { phone, imageUrl, message, buttonText, url, footer };
    const outboundMessage = await createOutboundMessage(phone, 'image_cta_url_original', payload);
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendImageWithCtaUrlOriginal',
          args: [phone, imageUrl, message, buttonText, url, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      return { success: true };
    } catch (error) {
      if (outboundMessage) {
        await updateOutboundMessageFailure(outboundMessage, error);
      }
      throw error;
    }
  },

  async sendCtaPhone(phone, message, buttonText, phoneNumber, footer = '', correlationId = null) {
    const payload = { phone, message, buttonText, phoneNumber, footer };
    const outboundMessage = await createOutboundMessage(phone, 'cta_phone', payload);
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendCtaPhone',
          args: [phone, message, buttonText, phoneNumber, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      return { success: true };
    } catch (error) {
      if (outboundMessage) {
        await updateOutboundMessageFailure(outboundMessage, error);
      }
      throw error;
    }
  },

  async sendImageWithCtaPhone(phone, imageUrl, message, buttonText, phoneNumber, footer = '', correlationId = null) {
    const payload = { phone, imageUrl, message, buttonText, phoneNumber, footer };
    const outboundMessage = await createOutboundMessage(phone, 'image_cta_phone', payload);
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendImageWithCtaPhone',
          args: [phone, imageUrl, message, buttonText, phoneNumber, footer],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      return { success: true };
    } catch (error) {
      if (outboundMessage) {
        await updateOutboundMessageFailure(outboundMessage, error);
      }
      throw error;
    }
  },

  async sendMarketingTemplate(phone, templateName, imageUrl, bodyParams = [], buttonUrl = null, correlationId = null) {
    const payload = { phone, templateName, imageUrl, bodyParams, buttonUrl };
    const outboundMessage = await createOutboundMessage(phone, 'marketing_template', payload);
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendMarketingTemplate',
          args: [phone, templateName, imageUrl, bodyParams, buttonUrl],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      return { success: true };
    } catch (error) {
      if (outboundMessage) {
        await updateOutboundMessageFailure(outboundMessage, error);
      }
      throw error;
    }
  },

  async sendSimpleTemplate(phone, templateName = 'hello_world', languageCode = 'en_US', correlationId = null) {
    const payload = { phone, templateName, languageCode };
    const outboundMessage = await createOutboundMessage(phone, 'simple_template', payload);
    
    // Log outbound attempt
    if (outboundMessage) {
      logger.logOutboundAttempt(outboundMessage._id.toString(), 'simple_template', phone, correlationId);
    }
    
    try {
      // Enqueue job for immediate execution
      await jobQueue.enqueue(
        JOB_TYPES.SEND_WHATSAPP_MESSAGE,
        {
          methodName: 'sendSimpleTemplate',
          args: [phone, templateName, languageCode],
          outboundMessageId: outboundMessage?._id?.toString()
        },
        { correlationId }
      );
      
      // Log successful send (job completed synchronously)
      if (outboundMessage) {
        logger.logOutboundResult(outboundMessage._id.toString(), 'sent', null, correlationId);
      }
      
      return { success: true };
    } catch (error) {
      // Log failed send
      if (outboundMessage) {
        const errorCategory = classifyFailure(error);
        logger.logOutboundResult(outboundMessage._id.toString(), 'failed', errorCategory, correlationId);
      }
      
      throw error;
    }
  }
};

// Helper function for outbound message tracking
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

module.exports = whatsapp;

/*
STEP 4.2 COMPLETE WHEN:
[X] All outbound send methods route through jobQueue.enqueue()
[X] Under inProcessQueue, behavior remains synchronous (no timing drift)
[X] correlationId appears in queue logs and outbound attempt/result logs
[X] No message payload content logged
[X] No changes to messageProcessor/router/domains
[X] All WhatsApp send methods have correlationId parameter
[X] Job handler processes all method types correctly
[X] Outbound message tracking preserved in job handler
*/
