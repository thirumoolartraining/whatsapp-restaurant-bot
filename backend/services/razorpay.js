const Razorpay = require('razorpay');
const Logger = require('./logger');

const logger = new Logger('razorpay');

let razorpay = null;
let lastKeyId = null;

const getRazorpay = () => {
  // Reset instance if credentials changed
  if (!razorpay || lastKeyId !== process.env.RAZORPAY_KEY_ID) {
    razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET
    });
    lastKeyId = process.env.RAZORPAY_KEY_ID;
    logger.info('razorpay_instance_refreshed', {
      level: 'info',
      component: 'razorpay',
      event: 'razorpay_instance_refreshed',
      timestamp: new Date().toISOString(),
      context: { keyId: process.env.RAZORPAY_KEY_ID?.substring(0, 8) }
    });
  }
  return razorpay;
};

const razorpayService = {
  async createOrder(amount, orderId) {
    try {
      const options = {
        amount: amount * 100,
        currency: 'INR',
        receipt: orderId,
        notes: { orderId }
      };
      const order = await getRazorpay().orders.create(options);
      return order;
    } catch (error) {
      logger.error('razorpay_order_creation_failed', {
        errorCategory: 'provider',
        origin: 'razorpay',
        finality: 'retryable',
        errorMessage: error.message
      });
      throw error;
    }
  },

  async createPaymentLink(amount, orderId, customerPhone, customerName) {
    try {
      // Clean phone number - remove all non-digits and ensure proper format
      let cleanPhone = customerPhone.replace(/\D/g, '');
      // Remove leading 91 if present, then add it back properly
      if (cleanPhone.startsWith('91') && cleanPhone.length > 10) {
        cleanPhone = cleanPhone.substring(2);
      }
      // Ensure it's 10 digits
      if (cleanPhone.length !== 10) {
        logger.error('invalid_phone_length', {
          errorCategory: 'validation',
          origin: 'razorpay',
          finality: 'terminal',
          phoneLength: cleanPhone.length,
          customerPhone
        });
      }
      const formattedPhone = '+91' + cleanPhone;
      
      const paymentLinkOptions = {
        amount: amount * 100,
        currency: 'INR',
        accept_partial: false,
        description: `Order ${orderId}`,
        customer: {
          name: customerName || 'Customer',
          contact: formattedPhone
        },
        notify: { sms: true, email: false },
        reminder_enable: true,
        notes: { orderId },
        callback_url: `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/payment/callback`,
        callback_method: 'get'
      };
      
      logger.info('payment_link_options', {
        level: 'info',
        component: 'razorpay',
        event: 'payment_link_options',
        timestamp: new Date().toISOString(),
        context: { amount: paymentLinkOptions.amount, currency: paymentLinkOptions.currency }
      });
      
      const paymentLink = await getRazorpay().paymentLink.create(paymentLinkOptions);
      logger.info('payment_link_created', {
        level: 'info',
        component: 'razorpay',
        event: 'payment_link_created',
        timestamp: new Date().toISOString(),
        context: { shortUrl: paymentLink.short_url, linkId: paymentLink.id }
      });
      return paymentLink;
    } catch (error) {
      logger.error('payment_link_creation_failed', {
        errorCategory: 'provider',
        origin: 'razorpay',
        finality: 'retryable',
        errorCode: error.error?.code,
        errorMessage: error.message,
        errorDescription: error.error?.description
      });
      throw error;
    }
  },

  async refund(paymentId, amount, retryCount = 0) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 5000; // 5 seconds between retries
    
    try {
      logger.info('refund_attempt', {
        level: 'info',
        component: 'razorpay',
        event: 'refund_attempt',
        timestamp: new Date().toISOString(),
        context: { paymentId, amountInRupees: amount, attempt: retryCount + 1 }
      });
      
      // First fetch payment details to verify it's refundable
      const payment = await getRazorpay().payments.fetch(paymentId);
      const paymentAmountInRupees = payment.amount / 100;
      
      logger.info('payment_details_fetched', {
        level: 'info',
        component: 'razorpay',
        event: 'payment_details_fetched',
        timestamp: new Date().toISOString(),
        context: { status: payment.status, amountInRupees: paymentAmountInRupees, captured: payment.captured }
      });
      
      // Check if payment is captured and not already refunded
      if (payment.status !== 'captured') {
        throw new Error(`Payment not captured. Status: ${payment.status}`);
      }
      
      if (payment.refund_status === 'full') {
        throw new Error('Payment already fully refunded');
      }
      
      // Check if payment is too recent (less than 5 minutes old)
      // Razorpay sometimes needs time to fully process payments before allowing refunds
      const paymentAge = Date.now() - (payment.created_at * 1000);
      const MIN_PAYMENT_AGE_MS = 5 * 60 * 1000; // 5 minutes
      
      if (paymentAge < MIN_PAYMENT_AGE_MS) {
        const waitTime = Math.min(MIN_PAYMENT_AGE_MS - paymentAge, 30000); // Wait up to 30 seconds
        logger.info('payment_age_wait', {
          level: 'info',
          component: 'razorpay',
          event: 'payment_age_wait',
          timestamp: new Date().toISOString(),
          context: { paymentAgeSeconds: Math.round(paymentAge / 1000), waitSeconds: Math.round(waitTime / 1000) }
        });
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
      
      // Calculate refund amount in paise
      const refundAmountInPaise = Math.round(amount * 100);
      const availableForRefund = payment.amount - (payment.amount_refunded || 0);
      
      logger.info('refund_calculation', {
        level: 'info',
        component: 'razorpay',
        event: 'refund_calculation',
        timestamp: new Date().toISOString(),
        context: { requestedRefundInPaise: refundAmountInPaise, availableForRefundInPaise: availableForRefund }
      });
      
      // Validate refund amount doesn't exceed available amount
      const finalRefundAmount = refundAmountInPaise > availableForRefund ? availableForRefund : refundAmountInPaise;
      
      if (finalRefundAmount <= 0) {
        throw new Error('No amount available for refund');
      }
      
      // Process refund using payments.refund (Razorpay SDK v2.x method)
      logger.info('refund_api_call', {
        level: 'info',
        component: 'razorpay',
        event: 'refund_api_call',
        timestamp: new Date().toISOString(),
        context: { paymentId, amountInPaise: finalRefundAmount }
      });
      
      // SDK v2.x: payments.refund(paymentId, options)
      const refund = await getRazorpay().payments.refund(paymentId, {
        amount: finalRefundAmount
      });
      
      logger.info('refund_successful', {
        level: 'info',
        component: 'razorpay',
        event: 'refund_successful',
        timestamp: new Date().toISOString(),
        context: { refundId: refund.id, amountRefunded: finalRefundAmount / 100 }
      });
      return refund;
    } catch (error) {
      const errorCode = error.error?.code || error.code;
      const errorDesc = error.error?.description || error.message;
      
      logger.error('refund_api_error', {
        errorCategory: 'provider',
        origin: 'razorpay',
        finality: 'retryable',
        errorCode,
        errorMessage: error.message,
        paymentId,
        amount,
        attempt: retryCount + 1
      });
      
      // Retry on SERVER_ERROR, GATEWAY_ERROR, or BAD_REQUEST_ERROR (timing issues)
      if ((errorCode === 'SERVER_ERROR' || errorCode === 'GATEWAY_ERROR' || 
           (errorCode === 'BAD_REQUEST_ERROR' && errorDesc === 'invalid request sent')) && retryCount < MAX_RETRIES) {
        const retryDelay = errorCode === 'BAD_REQUEST_ERROR' ? 30000 : RETRY_DELAY_MS; // 30s for timing issues
        logger.info('refund_retry_scheduled', {
          level: 'info',
          component: 'razorpay',
          event: 'refund_retry_scheduled',
          timestamp: new Date().toISOString(),
          context: { retryDelaySeconds: retryDelay / 1000, attempt: retryCount + 2, maxAttempts: MAX_RETRIES + 1 }
        });
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        return this.refund(paymentId, amount, retryCount + 1);
      }
      
      throw error;
    }
  },

  async getPaymentDetails(paymentId) {
    try {
      return await getRazorpay().payments.fetch(paymentId);
    } catch (error) {
      logger.error('razorpay_payment_fetch_failed', {
        errorCategory: 'provider',
        origin: 'razorpay',
        finality: 'retryable',
        paymentId,
        errorMessage: error.message
      });
      throw error;
    }
  }
};

module.exports = razorpayService;
