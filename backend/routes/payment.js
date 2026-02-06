const express = require('express');
const crypto = require('crypto');
const Order = require('../models/Order');
const Customer = require('../models/Customer');
const whatsapp = require('../services/whatsapp');
const brevoMail = require('../services/brevoMail');
const razorpayService = require('../services/razorpay');
const googleSheets = require('../services/googleSheets');
const chatbotImagesService = require('../services/chatbotImages');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const paymentCompletionHandler = require('../services/domains/paymentCompletionHandler');
const Logger = require('../services/logger');
const router = express.Router();

const logger = new Logger('payment');

// Create Razorpay order for UPI intent payment (no auth required - public endpoint)
router.post('/create-upi-order', async (req, res) => {
  try {
    const { orderId, amount } = req.body;
    
    if (!orderId || !amount) {
      return res.status(400).json({ error: 'Order ID and amount are required' });
    }

    // Verify order exists and is pending payment
    const order = await Order.findOne({ orderId });
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    if (order.paymentStatus === 'paid') {
      return res.status(400).json({ error: 'Order already paid' });
    }

    // Create Razorpay order
    const razorpayOrder = await razorpayService.createOrder(amount, orderId);
    
    // Update order with Razorpay order ID
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    res.json({
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      configId: process.env.RAZORPAY_CONFIG_ID || null,
      merchantName: process.env.MERCHANT_NAME || 'Restaurant'
    });
  } catch (error) {
    logger.error('upi_order_creation_failed', {
      errorCategory: 'provider',
      origin: 'payment',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Verify UPI payment (no auth required - public endpoint)
router.post('/verify-upi', async (req, res) => {
  try {
    const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

    const result = await paymentCompletionHandler.handlePaymentStatusUpdate({
      orderId,
      razorpay_payment_id,
      razorpay_order_id,
      razorpay_signature
    });

    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    res.json(result);
  } catch (error) {
    logger.error('upi_payment_verification_failed', {
      errorCategory: 'provider',
      origin: 'payment',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Razorpay Webhook - receives payment and refund events
router.post('/razorpay-webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    
    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const signature = req.headers['x-razorpay-signature'];
      const body = req.body.toString();
      
      const expectedSignature = crypto
        .createHmac('sha256', webhookSecret)
        .update(body)
        .digest('hex');
      
      if (signature !== expectedSignature) {
        return res.status(400).json({ error: 'Invalid signature' });
      }
    }
    
    const event = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    const payload = event.payload;
    
    // Handle refund events
    if (event.event === 'refund.processed' || event.event === 'refund.created') {
      const refund = payload.refund?.entity;
      const paymentId = refund?.payment_id;
      
      if (!paymentId) {
        return res.json({ status: 'ok' });
      }
      
      
      // Find order by payment ID
      const order = await Order.findOne({ 
        $or: [
          { razorpayPaymentId: paymentId },
          { paymentId: paymentId }
        ]
      });
      
      if (!order) {
        return res.json({ status: 'ok' });
      }
      
      // Update order with refund details
      if (refund.status === 'processed') {
        await paymentCompletionHandler.handleRefundSuccess(order, refund);
      }
      
      return res.json({ status: 'ok' });
    }
    
    // Handle refund failed event
    if (event.event === 'refund.failed') {
      const refund = payload.refund?.entity;
      const paymentId = refund?.payment_id;
      
      if (!paymentId) {
        return res.json({ status: 'ok' });
      }
      
      
      const order = await Order.findOne({ 
        $or: [
          { razorpayPaymentId: paymentId },
          { paymentId: paymentId }
        ]
      });
      
      if (!order) {
        return res.json({ status: 'ok' });
      }
      
      await paymentCompletionHandler.handleRefundFailure(order, refund);
      
      return res.json({ status: 'ok' });
    }
    
    // Handle payment captured event (backup for callback)
    if (event.event === 'payment.captured') {
      const payment = payload.payment?.entity;
      const paymentLinkId = payment?.notes?.payment_link_id || payment?.payment_link_id;
      
      if (paymentLinkId) {
        const order = await Order.findOne({ razorpayOrderId: paymentLinkId });
        if (order) {
          await paymentCompletionHandler.handleWebhookPaymentSuccess(order, payment);
        }
      }
      
      return res.json({ status: 'ok' });
    }
    
    res.json({ status: 'ok' });
  } catch (error) {
    logger.error('razorpay_webhook_failed', {
      errorCategory: 'provider',
      origin: 'payment',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

router.get('/callback', async (req, res) => {
  try {
    const { razorpay_payment_id, razorpay_payment_link_id, razorpay_payment_link_status } = req.query;
    
    if (razorpay_payment_link_status === 'paid') {
      const order = await Order.findOne({ razorpayOrderId: razorpay_payment_link_id });
      if (order) {
        await paymentCompletionHandler.handleCallbackPaymentSuccess(order, razorpay_payment_id);
      }
    }
    
    res.send(`
      <html>
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1">
          <style>
            body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f0f9f0; }
            .success { color: #22c55e; font-size: 48px; }
            h1 { color: #166534; }
            p { color: #666; }
          </style>
        </head>
        <body>
          <div class="success">✅</div>
          <h1>Payment Successful!</h1>
          <p>Your order has been confirmed.</p>
          <p>Check WhatsApp for order details.</p>
          <p style="margin-top: 30px; color: #999;">You can close this window.</p>
        </body>
      </html>
    `);
  } catch (error) {
    logger.error('payment_callback_failed', {
      errorCategory: 'provider',
      origin: 'payment',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.send('<html><body><h1>Payment Error</h1><p>Please contact support.</p></body></html>');
  }
});

router.post('/refund/:orderId', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (!order.razorpayPaymentId && !order.paymentId) return res.status(400).json({ error: 'No payment found' });

    const paymentId = order.razorpayPaymentId || order.paymentId;
    
    // Process refund immediately via Razorpay
    try {
      const refund = await razorpayService.refund(paymentId, order.totalAmount);
      
      await paymentCompletionHandler.handleRefundSuccess(order, refund);

      res.json({ success: true, message: 'Refund processed', refundId: refund.id, orderId: order.orderId });
    } catch (refundError) {
      logger.error('refund_failed', {
        errorCategory: 'provider',
        origin: 'payment',
        finality: 'retryable',
        orderId: order.orderId,
        errorMessage: refundError.message
      });
      
      const failedRefund = {
        id: 'failed',
        amount: order.totalAmount * 100,
        failure_reason: refundError.message
      };
      
      await paymentCompletionHandler.handleRefundFailure(order, failedRefund);

      res.status(500).json({ success: false, error: refundError.message, orderId: order.orderId });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Process refund for pending refund orders (admin can trigger this)
router.post('/process-refund/:orderId', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const order = await Order.findOne({ orderId: req.params.orderId });
    if (!order) return res.status(404).json({ error: 'Order not found' });
    
    if (order.refundStatus === 'completed') {
      return res.status(400).json({ error: 'Order already refunded' });
    }
    
    const paymentId = order.razorpayPaymentId || order.paymentId;
    if (!paymentId) return res.status(400).json({ error: 'No payment ID found' });

    // Process refund via Razorpay
    try {
      const refund = await razorpayService.refund(paymentId, order.totalAmount);
      
      await paymentCompletionHandler.handleRefundSuccess(order, refund);

      res.json({ success: true, message: 'Refund processed', refundId: refund.id });
    } catch (refundError) {
      logger.error('refund_processing_failed', {
        errorCategory: 'provider',
        origin: 'payment',
        finality: 'retryable',
        orderId: order.orderId,
        errorMessage: refundError.message
      });
      
      const failedRefund = {
        id: 'failed',
        amount: order.totalAmount * 100,
        failure_reason: refundError.message
      };
      
      await paymentCompletionHandler.handleRefundFailure(order, failedRefund);

      res.status(500).json({ success: false, error: refundError.message });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
