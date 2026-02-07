/**
 * Send WhatsApp Message Job Handler
 * Phase 4.2: Async Infrastructure - Step 2 (Outbound Send Queue Integration)
 * 
 * Handles outbound WhatsApp message sending through the queue seam.
 * Calls the existing Meta Cloud implementation without changing behavior.
 */

const metaCloud = require('../../metaCloud');
const OutboundMessage = require('../../../models/OutboundMessage');
const Logger = require('../../logger');
const { assertScopeAllowed } = require('../../../security/scopeRegistry');

const logger = new Logger('sendWhatsAppMessageJob');

const jobName = 'SEND_WHATSAPP_MESSAGE';

/**
 * Handle outbound WhatsApp message job
 * @param {Object} payload - Job payload
 * @param {string} payload.methodName - WhatsApp method name to call
 * @param {Array|Object} payload.args - Arguments for the method
 * @param {string} payload.outboundMessageId - ID of outbound message record
 * @param {Object} context - Execution context
 * @param {string} context.correlationId - Correlation ID for tracing
 */
async function handler(payload, context) {
  const { methodName, args, outboundMessageId } = payload;
  const { correlationId } = context;

  // Enforce scope for job execution
  assertScopeAllowed({
    actionName: 'QUEUE_JOB_EXECUTE',
    actor: 'system',
    correlationId,
    context: { jobName, methodName }
  });

  logger.info('Processing WhatsApp message job', {
    methodName,
    outboundMessageId,
    correlationId,
    hasArgs: !!args
  });

  try {
    // Get outbound message record if available
    let outboundMessage = null;
    if (outboundMessageId) {
      try {
        outboundMessage = await OutboundMessage.findById(outboundMessageId);
      } catch (error) {
        logger.error('Failed to fetch outbound message', {
          outboundMessageId,
          error: error.message,
          correlationId
        });
      }
    }

    // Convert args to array if it's an object (for single parameter methods)
    const methodArgs = Array.isArray(args) ? args : [args];

    // Call the appropriate Meta Cloud method
    let result;
    switch (methodName) {
      case 'sendMessage':
        result = await metaCloud.sendMessage(...methodArgs);
        break;
      case 'sendButtons':
        result = await metaCloud.sendButtons(...methodArgs);
        break;
      case 'sendList':
        result = await metaCloud.sendList(...methodArgs);
        break;
      case 'sendTemplateButtons':
        result = await metaCloud.sendTemplateButtons(...methodArgs);
        break;
      case 'sendOrder':
        result = await metaCloud.sendOrder(...methodArgs);
        break;
      case 'sendImage':
        result = await metaCloud.sendImage(...methodArgs);
        break;
      case 'sendImageWithButtons':
        result = await metaCloud.sendImageWithButtons(...methodArgs);
        break;
      case 'sendLocationRequest':
        result = await metaCloud.sendLocationRequest(...methodArgs);
        break;
      case 'sendCtaUrl':
        result = await metaCloud.sendCtaUrl(...methodArgs);
        break;
      case 'sendImageWithCtaUrl':
        result = await metaCloud.sendImageWithCtaUrl(...methodArgs);
        break;
      case 'sendImageWithCtaUrlOriginal':
        result = await metaCloud.sendImageWithCtaUrlOriginal(...methodArgs);
        break;
      case 'sendCtaPhone':
        result = await metaCloud.sendCtaPhone(...methodArgs);
        break;
      case 'sendImageWithCtaPhone':
        result = await metaCloud.sendImageWithCtaPhone(...methodArgs);
        break;
      case 'sendMarketingTemplate':
        result = await metaCloud.sendMarketingTemplate(...methodArgs);
        break;
      case 'sendSimpleTemplate':
        result = await metaCloud.sendSimpleTemplate(...methodArgs);
        break;
      default:
        throw new Error(`Unknown WhatsApp method: ${methodName}`);
    }

    // Update outbound message on success
    if (outboundMessage) {
      await updateOutboundMessageSuccess(outboundMessage, result);
    }

    logger.info('WhatsApp message job completed successfully', {
      methodName,
      outboundMessageId,
      correlationId
    });

    return result;
  } catch (error) {
    // Update outbound message on failure
    if (outboundMessageId) {
      try {
        const outboundMessage = await OutboundMessage.findById(outboundMessageId);
        if (outboundMessage) {
          await updateOutboundMessageFailure(outboundMessage, error);
        }
      } catch (updateError) {
        logger.error('Failed to update outbound message failure', {
          outboundMessageId,
          error: updateError.message,
          correlationId
        });
      }
    }

    logger.error('WhatsApp message job failed', {
      methodName,
      outboundMessageId,
      errorMessage: error.message,
      correlationId
    });

    throw error;
  }
}

/**
 * Update outbound message on success
 */
async function updateOutboundMessageSuccess(outboundMessage, result) {
  if (!outboundMessage) return;
  
  try {
    await OutboundMessage.findByIdAndUpdate(outboundMessage._id, {
      status: 'sent',
      providerMessageId: result.messageId || result.id || null
    });
  } catch (error) {
    logger.error('Failed to update outbound message success', {
      outboundMessageId: outboundMessage._id.toString(),
      error: error.message
    });
  }
}

/**
 * Update outbound message on failure
 */
async function updateOutboundMessageFailure(outboundMessage, error) {
  if (!outboundMessage) return;
  
  try {
    const errorCategory = classifyFailure(error);
    const errorData = error.response?.data?.error;
    const errorCode = errorData?.code || error.code || error.status || 'UNKNOWN';
    
    logger.error('WhatsApp outbound message failed', {
      outboundMessageId: outboundMessage._id.toString(),
      errorCategory,
      errorCode
    });
    
    await OutboundMessage.findByIdAndUpdate(outboundMessage._id, {
      status: 'failed',
      errorCode,
      errorMessage: error.message || error.toString(),
      errorCategory
    });
  } catch (updateError) {
    logger.error('Failed to update outbound message failure', {
      outboundMessageId: outboundMessage._id.toString(),
      error: updateError.message
    });
  }
}

/**
 * Classify WhatsApp API failures (copied from whatsapp.js for consistency)
 */
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

module.exports = {
  jobName,
  handler
};
