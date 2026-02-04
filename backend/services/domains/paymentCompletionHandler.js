/*
 Phase 3 Step 3.4.4b:
 Payment completion domain extraction.
 Covers verification, success/failure handling, and post-payment transitions.
 No behavior change.
*/

const crypto = require('crypto');
const Order = require('../../models/Order');
const Customer = require('../../models/Customer');
const whatsapp = require('../whatsapp');
const brevoMail = require('../brevoMail');
const chatbotImagesService = require('../chatbotImages');
const googleSheets = require('../googleSheets');
const conversationState = require('../conversationState');

async function handlePaymentStatusUpdate(context) {
  const { orderId, razorpay_payment_id, razorpay_order_id, razorpay_signature } = context;
  
  // Verify signature
  const body = razorpay_order_id + '|' + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    return { success: false, error: 'Invalid payment signature' };
  }

  // Find and update order
  const order = await Order.findOne({ orderId });
  if (!order) {
    return { success: false, error: 'Order not found' };
  }

  return await handlePaymentSuccess(order, razorpay_payment_id);
}

async function handlePaymentSuccess(order, razorpay_payment_id = null) {
  order.paymentStatus = 'paid';
  if (razorpay_payment_id) {
    order.paymentId = razorpay_payment_id;
    order.razorpayPaymentId = razorpay_payment_id;
  }
  order.status = 'confirmed';
  order.trackingUpdates.push({ 
    status: 'confirmed', 
    message: 'Payment received via UPI', 
    timestamp: new Date() 
  });
  await order.save();

  // Emit event for real-time updates
  const dataEvents = require('../eventEmitter');
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');

  // Update Google Sheets
  googleSheets.updateOrderStatus(order.orderId, 'confirmed', 'paid').catch(err =>
    console.error('Google Sheets sync error:', err)
  );

  // Build detailed order confirmation message
  let itemsList = order.items.map(item => 
    `• ${item.name} x${item.quantity} - ₹${item.price * item.quantity}`
  ).join('\n');

  let confirmMsg = `✅ *Payment Successful!*\n\n`;
  confirmMsg += `📦 *Order ID:* ${order.orderId}\n`;
  confirmMsg += `💳 *Payment:* UPI\n`;
  confirmMsg += `💰 *Amount Paid:* ₹${order.totalAmount}\n`;
  confirmMsg += `🍽️ *Service:* ${order.serviceType.replace('_', ' ')}\n\n`;
  confirmMsg += `━━━━━━━━━━━━━━━\n`;
  confirmMsg += `*Your Items:*\n${itemsList}\n`;
  confirmMsg += `━━━━━━━━━━━━━━━\n\n`;
  
  if (order.deliveryAddress?.address) {
    confirmMsg += `📍 *Delivery Address:*\n${order.deliveryAddress.address}\n\n`;
  }
  
  confirmMsg += `🙏 Thank you for your order!\nWe're preparing it now.`;

  // Send WhatsApp confirmation
  const confirmedImageUrl = await chatbotImagesService.getImageUrl('payment_success');
  
  try {
    if (confirmedImageUrl) {
      await whatsapp.sendImageWithButtons(order.customer.phone, confirmedImageUrl, confirmMsg, [
        { id: 'track_order', text: 'Track Order' },
        { id: 'view_menu', text: 'Add More Items' },
        { id: 'help', text: 'Help' }
      ]);
    } else {
      await whatsapp.sendButtons(order.customer.phone, confirmMsg, [
        { id: 'track_order', text: 'Track Order' },
        { id: 'view_menu', text: 'Add More Items' },
        { id: 'help', text: 'Help' }
      ]);
    }
  } catch (whatsappErr) {
    console.error('WhatsApp notification failed:', whatsappErr.message);
  }

  // Send email if available
  if (order.customer.email) {
    try {
      await brevoMail.sendOrderConfirmation(order.customer.email, order);
    } catch (emailErr) {
      console.error('Email error:', emailErr.message);
    }
  }

  // Update customer stats
  const customer = await Customer.findOne({ phone: order.customer.phone });
  if (customer) {
    customer.totalOrders = (customer.totalOrders || 0) + 1;
    customer.totalSpent = (customer.totalSpent || 0) + order.totalAmount;
    await customer.save();
  }

  console.log(`✅ UPI Payment verified for order ${order.orderId}`);
  return { success: true, message: 'Payment verified successfully' };
}

async function handleWebhookPaymentSuccess(order, payment) {
  if (order.paymentStatus !== 'paid') {
    order.paymentStatus = 'paid';
    order.razorpayPaymentId = payment.id;
    order.status = 'confirmed';
    order.trackingUpdates.push({ status: 'confirmed', message: 'Payment received via webhook', timestamp: new Date() });
    await order.save();
    
    console.log('✅ Payment captured via webhook:', order.orderId);
    
    // Emit event for real-time updates
    const dataEvents = require('../eventEmitter');
    dataEvents.emit('orders');
    dataEvents.emit('dashboard');
    
    // Update Google Sheets
    googleSheets.updateOrderStatus(order.orderId, 'confirmed', 'paid').catch(err =>
      console.error('Google Sheets sync error:', err)
    );
  }
}

async function handleCallbackPaymentSuccess(order, razorpay_payment_id) {
  order.paymentStatus = 'paid';
  order.paymentId = razorpay_payment_id;
  order.razorpayPaymentId = razorpay_payment_id; // Store for refunds
  order.status = 'confirmed';
  order.trackingUpdates.push({ status: 'confirmed', message: 'Payment received, order confirmed' });
  await order.save();

  // Emit event for real-time updates
  const dataEvents = require('../eventEmitter');
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');

  // Update Google Sheets
  googleSheets.updateOrderStatus(order.orderId, 'confirmed', 'paid').catch(err =>
    console.error('Google Sheets sync error:', err)
  );

  // Build detailed order confirmation message
  let itemsList = order.items.map(item => 
    `• ${item.name} x${item.quantity} - ₹${item.price * item.quantity}`
  ).join('\n');

  let confirmMsg = `✅ *Payment Successful!*\n\n`;
  confirmMsg += `📦 *Order ID:* ${order.orderId}\n`;
  confirmMsg += `💳 *Payment:* UPI/Online\n`;
  confirmMsg += `💰 *Amount Paid:* ₹${order.totalAmount}\n`;
  confirmMsg += `🍽️ *Service:* ${order.serviceType.replace('_', ' ')}\n\n`;
  confirmMsg += `━━━━━━━━━━━━━━━\n`;
  confirmMsg += `*Your Items:*\n${itemsList}\n`;
  confirmMsg += `━━━━━━━━━━━━━━━\n\n`;
  
  if (order.deliveryAddress?.address) {
    confirmMsg += `📍 *Delivery Address:*\n${order.deliveryAddress.address}\n\n`;
  }
  
  confirmMsg += `🙏 Thank you for your order!\nWe're preparing it now.`;

  // Send WhatsApp confirmation with image and buttons
  const confirmedImageUrl = await chatbotImagesService.getImageUrl('payment_success');
  
  if (confirmedImageUrl) {
    await whatsapp.sendImageWithButtons(order.customer.phone, confirmedImageUrl, confirmMsg, [
      { id: 'track_order', text: 'Track Order' },
      { id: 'view_menu', text: 'Add More Items' },
      { id: 'help', text: 'Help' }
    ]);
  } else {
    await whatsapp.sendButtons(order.customer.phone, confirmMsg, [
      { id: 'track_order', text: 'Track Order' },
      { id: 'view_menu', text: 'Add More Items' },
      { id: 'help', text: 'Help' }
    ]);
  }

  // Send email if available
  if (order.customer.email) {
    try {
      await brevoMail.sendOrderConfirmation(order.customer.email, order);
    } catch (emailErr) {
      console.error('Email error:', emailErr.message);
    }
  }

  // Update customer stats
  const customer = await Customer.findOne({ phone: order.customer.phone });
  if (customer) {
    customer.totalOrders = (customer.totalOrders || 0) + 1;
    customer.totalSpent = (customer.totalSpent || 0) + order.totalAmount;
    await customer.save();
  }
  
  console.log(`✅ Payment confirmed for order ${order.orderId}`);
}

async function handleRefundSuccess(order, refund) {
  order.refundStatus = 'completed';
  order.refundId = refund.id;
  order.refundProcessedAt = new Date();
  order.paymentStatus = 'refunded';
  order.status = 'refunded';
  order.statusUpdatedAt = new Date();
  order.trackingUpdates.push({ 
    status: 'refunded', 
    message: `Refund of ₹${refund.amount / 100} processed. Refund ID: ${refund.id}`, 
    timestamp: new Date() 
  });
  await order.save();
  
  console.log('✅ Order updated with refund:', order.orderId);
  
  // Emit event for real-time updates
  const dataEvents = require('../eventEmitter');
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');
  
  // Update Google Sheets - move to refunded sheet
  googleSheets.updateOrderStatus(order.orderId, 'refunded', 'refunded').catch(err =>
    console.error('Google Sheets sync error:', err)
  );
  
  // Notify customer
  try {
    await whatsapp.sendButtons(order.customer.phone,
      `✅ *Refund Successful!*\n\nOrder: ${order.orderId}\nAmount: ₹${refund.amount / 100}\nRefund ID: ${refund.id}\n\n💳 The amount will be credited to your account within 5-7 business days.`,
      [
        { id: 'place_order', text: 'New Order' },
        { id: 'home', text: 'Main Menu' }
      ]
    );
  } catch (whatsappErr) {
    console.error('WhatsApp notification failed:', whatsappErr.message);
  }
}

async function handleRefundFailure(order, refund) {
  order.refundStatus = 'failed';
  order.refundError = refund.failure_reason || 'Refund failed';
  order.paymentStatus = 'refund_failed';
  order.status = 'cancelled';
  order.statusUpdatedAt = new Date();
  order.trackingUpdates.push({ 
    status: 'refund_failed', 
    message: `Refund failed: ${refund.failure_reason || 'Unknown error'}`, 
    timestamp: new Date() 
  });
  await order.save();
  
  // Emit event for real-time updates
  const dataEvents = require('../eventEmitter');
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');
  
  // Update Google Sheets - move to refundfailed sheet
  googleSheets.updateOrderStatus(order.orderId, 'refund_failed', 'refund_failed').catch(err =>
    console.error('Google Sheets sync error:', err)
  );
  
  // Notify customer
  try {
    await whatsapp.sendButtons(order.customer.phone,
      `⚠️ *Refund Issue*\n\nOrder: ${order.orderId}\nAmount: ₹${order.totalAmount}\n\nWe couldn't process your refund automatically.\nOur team will contact you within 24 hours to resolve this.`,
      [
        { id: 'place_order', text: 'New Order' },
        { id: 'home', text: 'Main Menu' }
      ]
    );
  } catch (whatsappErr) {
    console.error('WhatsApp notification failed:', whatsappErr.message);
  }
}

module.exports = {
  handlePaymentStatusUpdate,
  handlePaymentSuccess,
  handleWebhookPaymentSuccess,
  handleCallbackPaymentSuccess,
  handleRefundSuccess,
  handleRefundFailure
};

// PHASE 3 STEP 3.4.4b COMPLETE WHEN:
// [x] All payment verification/completion logic moved to paymentCompletionHandler
// [x] paymentInitiationHandler untouched
// [x] chatbot.js delegates completion logic only
// [x] polling.js delegates completion logic only
// [x] No menu/cart/order/delivery logic moved
// [x] Razorpay verification semantics unchanged
// [x] State access still via conversationState
// [x] WhatsApp behavior unchanged
// [x] Phase 1 & Phase 2 invariants preserved
// [x] Reverting restores inline completion logic
