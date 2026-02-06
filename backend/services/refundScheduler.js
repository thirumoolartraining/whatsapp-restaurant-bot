// Refund Scheduler - Processes refund after delay and sends success message
const Order = require('../models/Order');
const whatsapp = require('./whatsapp');
const googleSheets = require('./googleSheets');
const razorpayService = require('./razorpay');
const Logger = require('./logger');

const logger = new Logger('refundScheduler');

const pendingRefunds = new Map();

const refundScheduler = {
  // Schedule refund to be processed after delay (default 5 minutes)
  scheduleRefund(orderId, delayMs = 5 * 60 * 1000) {
    logger.info('refund_scheduled', {
      level: 'info',
      component: 'refundScheduler',
      event: 'refund_scheduled',
      timestamp: new Date().toISOString(),
      context: { orderId, delaySeconds: delayMs / 1000 }
    });
    
    // Cancel any existing scheduled refund for this order
    this.cancelScheduledRefund(orderId);
    
    const timeoutId = setTimeout(async () => {
      await this.processRefund(orderId);
      pendingRefunds.delete(orderId);
    }, delayMs);
    
    pendingRefunds.set(orderId, timeoutId);
  },

  async processRefund(orderId) {
    try {
      const order = await Order.findOne({ orderId });
      
      if (!order) {
        logger.warn('refund_order_not_found', {
          level: 'warn',
          component: 'refundScheduler',
          event: 'refund_order_not_found',
          timestamp: new Date().toISOString(),
          context: { orderId }
        });
        return;
      }
      
      // Check if refund should be processed
      if (order.refundStatus === 'completed') {
        logger.info('refund_already_completed', {
          level: 'info',
          component: 'refundScheduler',
          event: 'refund_already_completed',
          timestamp: new Date().toISOString(),
          context: { orderId }
        });
        return;
      }
      
      if (order.refundStatus !== 'scheduled' && order.refundStatus !== 'pending') {
        logger.info('refund_status_not_scheduled', {
          level: 'info',
          component: 'refundScheduler',
          event: 'refund_status_not_scheduled',
          timestamp: new Date().toISOString(),
          context: { orderId, refundStatus: order.refundStatus }
        });
        return;
      }
      
      if (order.status !== 'cancelled') {
        logger.info('refund_order_not_cancelled', {
          level: 'info',
          component: 'refundScheduler',
          event: 'refund_order_not_cancelled',
          timestamp: new Date().toISOString(),
          context: { orderId, status: order.status }
        });
        return;
      }
      
      if (!order.razorpayPaymentId) {
        logger.info('refund_no_payment_id', {
          level: 'info',
          component: 'refundScheduler',
          event: 'refund_no_payment_id',
          timestamp: new Date().toISOString(),
          context: { orderId }
        });
        return;
      }
      
      logger.info('refund_processing_started', {
        level: 'info',
        component: 'refundScheduler',
        event: 'refund_processing_started',
        timestamp: new Date().toISOString(),
        context: { orderId }
      });
      
      try {
        // Process the actual refund via Razorpay
        const refund = await razorpayService.refund(order.razorpayPaymentId, order.totalAmount);
        
        // Update order with refund details
        order.refundStatus = 'completed';
        order.status = 'refunded';
        order.refundId = refund.id;
        order.refundProcessedAt = new Date();
        order.statusUpdatedAt = new Date();
        order.trackingUpdates.push({
          status: 'refunded',
          message: `Refund of ₹${order.totalAmount} completed successfully`,
          timestamp: new Date()
        });
        await order.save();
        
        // Emit event for real-time updates
        const dataEvents = require('./eventEmitter');
        dataEvents.emit('orders');
        dataEvents.emit('dashboard');
        
        logger.info('refund_completed', {
          level: 'info',
          component: 'refundScheduler',
          event: 'refund_completed',
          timestamp: new Date().toISOString(),
          context: { orderId, refundId: refund.id, amount: order.totalAmount }
        });
        
        // Send WhatsApp success message
        await this.sendRefundSuccessMessage(order);
        
        // Sync to Google Sheets
        try {
          await googleSheets.updateOrderStatus(order.orderId, 'refunded', 'refunded');
        } catch (err) {
          logger.error('google_sheets_sync_error', {
            errorCategory: 'provider',
            origin: 'google_sheets',
            finality: 'retryable',
            errorMessage: err.message
          });
        }
        
      } catch (refundError) {
        logger.error('refund_processing_failed', {
          errorCategory: 'provider',
          origin: 'razorpay',
          finality: 'retryable',
          orderId,
          errorMessage: refundError.message
        });
        
        // Update order with failure status
        order.refundStatus = 'failed';
        order.status = 'refund_failed';
        order.paymentStatus = 'refund_failed';
        order.refundError = refundError.message;
        order.trackingUpdates.push({
          status: 'refund_failed',
          message: `Refund failed: ${refundError.message}`,
          timestamp: new Date()
        });
        await order.save();
        
        // Emit event for real-time updates
        const dataEvents = require('./eventEmitter');
        dataEvents.emit('orders');
        
        // Sync to Google Sheets - move to refundfailed sheet
        try {
          await googleSheets.updateOrderStatus(order.orderId, 'refund_failed', 'refund_failed');
        } catch (err) {
          logger.error('google_sheets_sync_error', {
            errorCategory: 'provider',
            origin: 'google_sheets',
            finality: 'retryable',
            errorMessage: err.message
          });
        }
        
        // Send failure notification
        await this.sendRefundFailureMessage(order);
      }
      
    } catch (error) {
      logger.error('refund_processing_error', {
        errorCategory: 'unknown',
        origin: 'refund_scheduler',
        finality: 'terminal',
        orderId,
        errorMessage: error.message
      });
    }
  },

  async sendRefundSuccessMessage(order) {
    try {
      const msg = `✅ *Refund Successful!*\n\n` +
        `Order: ${order.orderId}\n` +
        `Amount: ₹${order.totalAmount}\n` +
        `Refund ID: ${order.refundId}\n\n` +
        `💰 The amount has been credited to your account.\n\n` +
        `Thank you for your patience! 🙏`;
      
      await whatsapp.sendButtons(order.customer.phone, msg, [
        { id: 'place_order', text: 'New Order' },
        { id: 'home', text: 'Main Menu' }
      ]);
      logger.info('refund_success_message_sent', {
        level: 'info',
        component: 'refundScheduler',
        event: 'refund_success_message_sent',
        timestamp: new Date().toISOString(),
        context: { orderId, phone: order.customer.phone }
      });
    } catch (whatsappError) {
      logger.error('refund_notification_failed', {
        errorCategory: 'provider',
        origin: 'whatsapp',
        finality: 'retryable',
        orderId,
        errorMessage: whatsappError.message
      });
    }
  },

  async sendRefundFailureMessage(order) {
    try {
      const msg = `⚠️ *Refund Issue*\n\n` +
        `Order: ${order.orderId}\n` +
        `Amount: ₹${order.totalAmount}\n\n` +
        `We couldn't process your refund automatically.\n` +
        `Our team will contact you within 24 hours to resolve this.\n\n` +
        `Sorry for the inconvenience! 🙏`;
      
      await whatsapp.sendButtons(order.customer.phone, msg, [
        { id: 'place_order', text: 'New Order' },
        { id: 'home', text: 'Main Menu' }
      ]);
      logger.info('refund_failure_message_sent', {
        level: 'info',
        component: 'refundScheduler',
        event: 'refund_failure_message_sent',
        timestamp: new Date().toISOString(),
        context: { orderId, phone: order.customer.phone }
      });
    } catch (whatsappError) {
      logger.error('refund_failure_notification_failed', {
        errorCategory: 'provider',
        origin: 'whatsapp',
        finality: 'retryable',
        orderId,
        errorMessage: whatsappError.message
      });
    }
  },

  cancelScheduledRefund(orderId) {
    const timeoutId = pendingRefunds.get(orderId);
    if (timeoutId) {
      clearTimeout(timeoutId);
      pendingRefunds.delete(orderId);
      logger.info('refund_cancelled', {
        level: 'info',
        component: 'refundScheduler',
        event: 'refund_cancelled',
        timestamp: new Date().toISOString(),
        context: { orderId }
      });
    }
  }
};

module.exports = refundScheduler;
