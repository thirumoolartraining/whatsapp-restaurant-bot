/*
 Phase 3 Step 3.4.4a:
 Payment initiation domain extraction.
 Covers payment method selection and initiation only.
 No behavior change. No verification handling.
*/

const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const Settings = require('../../models/Settings');
const whatsapp = require('../whatsapp');
const chatbotImagesService = require('../chatbotImages');
const conversationState = require('../conversationState');
const Logger = require('../logger');

const logger = new Logger('paymentInitiationHandler');

// Haversine formula to calculate straight-line distance between two coordinates in KM
const calculateStraightLineDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  return distance;
};

// Helper to calculate delivery charge based on customer location
const calculateDeliveryCharge = async (customerLat, customerLon) => {
  try {
    // Get restaurant location settings
    const restaurantLocation = await Settings.getValue('restaurantLocation');
    const deliverySettings = await Settings.getValue('deliverySettings');
    
    
    // Calculate RADIUS distance (straight-line) - not road distance
    const distance = calculateStraightLineDistance(
      restaurantLocation.latitude, 
      restaurantLocation.longitude,
      customerLat, 
      customerLon
    );
    
    
    const noFreeDelivery = deliverySettings.noFreeDelivery || false;
    const baseDeliveryCharge = deliverySettings.baseDeliveryCharge || 0;
    const freeRadius = deliverySettings.freeDeliveryRadius || 5;
    const maxRadius = deliverySettings.maxDeliveryRadius;
    const extraChargeEnabled = deliverySettings.enableExtraDeliveryCharge;
    const extraCharge = deliverySettings.extraDeliveryCharge || 0;
    
    // Check if beyond max delivery radius first
    if (maxRadius && distance > maxRadius) {
      return { 
        charge: null, 
        distance, 
        withinFreeRadius: false, 
        beyondMaxRadius: true,
        maxRadius,
        message: `Sorry, we don't deliver to locations beyond ${maxRadius} KM from our restaurant. Your location is ${distance.toFixed(1)} KM away.`
      };
    }
    
    // If restaurant charges for ALL deliveries (no free delivery)
    if (noFreeDelivery) {
      if (distance > freeRadius && extraChargeEnabled && extraCharge > 0) {
        const totalCharge = baseDeliveryCharge + extraCharge;
        return { 
          charge: totalCharge, 
          distance, 
          withinFreeRadius: false, 
          message: `Your location is ${distance.toFixed(1)} KM away. Delivery charge: ₹${totalCharge} (₹${baseDeliveryCharge} base + ₹${extraCharge} extra).`
        };
      }
      return { 
        charge: baseDeliveryCharge, 
        distance, 
        withinFreeRadius: true, 
        message: `Delivery charge: ₹${baseDeliveryCharge}`
      };
    }
    
    // Check if within free delivery radius
    if (distance <= freeRadius) {
      return { 
        charge: 0, 
        distance, 
        withinFreeRadius: true, 
        message: null 
      };
    }
    
    // Outside free radius - check if extra charge is enabled
    if (extraChargeEnabled && extraCharge > 0) {
      return { 
        charge: extraCharge, 
        distance, 
        withinFreeRadius: false, 
        message: `Your location is ${distance.toFixed(1)} KM away. A delivery charge of ₹${extraCharge} will be added.`
      };
    }
    
    // Extra charge NOT enabled AND customer is outside free radius - REJECT ORDER
    return { 
      charge: null, 
      distance, 
      withinFreeRadius: false, 
      deliveryNotAvailable: true,
      freeRadius,
      message: `Sorry, our delivery service is available only within ${freeRadius} KM. Your location is ${distance.toFixed(1)} KM away. Please try pickup instead.`
    };
    
  } catch (error) {
    logger.error('delivery_charge_calculation_failed', {
      errorCategory: 'domain',
      origin: 'payment_handler',
      finality: 'retryable',
      errorMessage: error.message
    });
    return { charge: 0, distance: null, withinFreeRadius: true, message: null };
  }
};

async function handleSelectPaymentMethod(phone, customer, state = {}, correlationId = null, messageId = null) {
  logger.logDomainHandlerEntry('payment', 'handleSelectPaymentMethod', ['phone', 'customer', 'state'], correlationId, messageId);
  
  try {
    const freshCustomer = await Customer.findOne({ phone }).populate('cart.menuItem');
    
    if (!freshCustomer?.cart?.length) {
      await whatsapp.sendButtons(phone, '🛒 Your cart is empty!', [
        { id: 'view_menu', text: 'View Menu' },
        { id: 'home', text: 'Main Menu' }
      ]);
      
      logger.logDomainHandlerExit('payment', 'handleSelectPaymentMethod', true, 'cart_empty', correlationId, messageId);
      return;
    }

  const currentState = await conversationState.getState(null, { phone });

  let itemsTotal = 0;
  let cartMsg = '🛒 *Order Summary*\n\n';
  let validItems = 0;
  
  freshCustomer.cart.forEach((item, i) => {
    if (item.menuItem) {
      const effectivePrice = item.menuItem.offerPrice || item.menuItem.price;
      const subtotal = effectivePrice * item.quantity;
      itemsTotal += subtotal;
      validItems++;
      const unitInfo = `${item.menuItem.quantity || 1} ${item.menuItem.unit || 'piece'}`;
      const priceDisplay = formatPriceWithOffer(item.menuItem);
      cartMsg += `${validItems}. *${item.menuItem.name}* (${unitInfo})\n`;
      cartMsg += `   Qty: ${item.quantity} × ${priceDisplay} = ₹${subtotal}\n\n`;
    }
  });
  
  if (validItems === 0) {
    freshCustomer.cart = [];
    await freshCustomer.save();
    
    await whatsapp.sendButtons(phone, '🛒 Your cart is empty!', [
      { id: 'view_menu', text: 'View Menu' },
      { id: 'home', text: 'Main Menu' }
    ]);
    return;
  }
  
  cartMsg += `━━━━━━━━━━━━━━━\n`;
  cartMsg += `*Items Total: ₹${itemsTotal}*\n`;
  
  let deliveryCharge = currentState.deliveryCharge || 0;
  const serviceType = currentState.serviceType || 'delivery';
  
  if (serviceType === 'delivery' && freshCustomer.deliveryAddress?.latitude && freshCustomer.deliveryAddress?.longitude) {
    const deliveryResult = await calculateDeliveryCharge(
      freshCustomer.deliveryAddress.latitude,
      freshCustomer.deliveryAddress.longitude
    );
    deliveryCharge = deliveryResult.charge || 0;
    
    if (deliveryResult.distance) {
      cartMsg += `📍 *Distance:* ${deliveryResult.distance} KM\n`;
    }
  }
  
  if (deliveryCharge > 0) {
    cartMsg += `🚚 *Delivery Charge:* ₹${deliveryCharge}\n`;
  } else if (serviceType === 'delivery') {
    cartMsg += `🚚 *Delivery:* FREE\n`;
  }
  
  const grandTotal = itemsTotal + deliveryCharge;
  cartMsg += `━━━━━━━━━━━━━━━\n`;
  cartMsg += `*Grand Total: ₹${grandTotal}*\n\n`;
  
  if (freshCustomer.deliveryAddress?.address && serviceType === 'delivery') {
    cartMsg += `📍 *Delivery Address:*\n${freshCustomer.deliveryAddress.address}\n\n`;
  } else if (serviceType === 'pickup') {
    cartMsg += `🏪 *Self-Pickup at Restaurant*\n\n`;
  }
  
  cartMsg += `💳 Select payment method:`;

  const orderSummaryImageUrl = await chatbotImagesService.getImageUrl('order_summary');
  await sendWithOptionalImage(phone, orderSummaryImageUrl, cartMsg, [
    { id: 'pay_upi', text: 'UPI/APP' },
    { id: 'pay_cod', text: 'COD' },
    { id: 'clear_cart', text: 'Cancel' }
  ]);
  
  logger.logDomainHandlerExit('payment', 'handleSelectPaymentMethod', true, 'payment_method_selection', correlationId, messageId);
  } catch (error) {
    logger.logDomainHandlerExit('payment', 'handleSelectPaymentMethod', false, null, correlationId, messageId);
    throw error;
  }
}

async function handleSelectPickupPaymentMethod(phone, customer, correlationId = null, messageId = null) {
  logger.logDomainHandlerEntry('payment', 'handleSelectPickupPaymentMethod', ['phone', 'customer'], correlationId, messageId);
  
  try {
    const freshCustomer = await Customer.findOne({ phone }).populate('cart.menuItem');
    if (!freshCustomer || !freshCustomer.cart?.length) {
      await whatsapp.sendButtons(phone, '🛒 Your cart is empty!', [
        { id: 'view_menu', text: 'View Menu' }
      ]);
      
      logger.logDomainHandlerExit('payment', 'handleSelectPickupPaymentMethod', true, 'cart_empty', correlationId, messageId);
      return;
    }

  let total = 0;
  const items = [];
  for (const cartItem of freshCustomer.cart) {
    if (!cartItem.menuItem) continue;
    const item = cartItem.menuItem;
    const price = item.offerPrice && item.offerPrice < item.price ? item.offerPrice : item.price;
    const itemTotal = price * cartItem.quantity;
    total += itemTotal;
    items.push({
      name: item.name,
      quantity: cartItem.quantity,
      price: itemTotal
    });
  }

  let msg = '📋 *Order Summary (Self-Pickup)*\n\n';
  items.forEach(item => {
    msg += `• ${item.name} x${item.quantity} - ₹${item.price}\n`;
  });
  msg += `\n💰 *Total: ₹${total}*\n\n`;
  msg += '🏪 *Pickup Location:* Restaurant\n\n';
  msg += '💳 *Choose Payment Method:*';

  await whatsapp.sendButtons(phone, msg, [
    { id: 'pickup_pay_hotel', text: 'Pay at Hotel' },
    { id: 'pickup_pay_upi', text: 'UPI/App' }
  ], 'Select payment method');
  
  logger.logDomainHandlerExit('payment', 'handleSelectPickupPaymentMethod', true, 'pickup_payment_method_selection', correlationId, messageId);
  } catch (error) {
    logger.logDomainHandlerExit('payment', 'handleSelectPickupPaymentMethod', false, null, correlationId, messageId);
    throw error;
  }
}

async function handleInitiateOnlinePayment(phone, customer, state, confirmationResult, correlationId = null, messageId = null) {
  logger.logDomainHandlerEntry('payment', 'handleInitiateOnlinePayment', ['phone', 'customer', 'state', 'confirmationResult'], correlationId, messageId);
  
  try {
    const { order, items, total, freshCustomer, orderId } = confirmationResult;
    
    await order.save();

  const whatsappBroadcast = require('../whatsappBroadcast');
  await whatsappBroadcast.addContact(freshCustomer.phone, freshCustomer.name, new Date());

  if (!freshCustomer.hasOrdered) {
    freshCustomer.hasOrdered = true;
  }

  try {
    const DashboardStats = require('../../models/DashboardStats');
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    await DashboardStats.findOneAndUpdate(
      {},
      { 
        $inc: { todayOrders: 1 },
        $set: { todayDate: todayStr, lastUpdated: new Date() }
      },
      { upsert: true }
    );
  } catch (statsErr) {
    logger.error('daily_order_stats_tracking_failed', {
      errorCategory: 'domain',
      origin: 'domain',
      finality: 'retryable',
      errorMessage: statsErr.message
    });
  }

  const dataEvents = require('../eventEmitter');
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');

  const googleSheets = require('../googleSheets');
  googleSheets.addOrder(order).catch(err => logger.error('google_sheets_order_sync_failed', {
    errorCategory: 'provider',
    origin: 'domain',
    finality: 'retryable',
    errorMessage: err.message
  }));

  try {
    const User = require('../../models/User');
    const pushNotification = require('../pushNotification');
    
    const admins = await User.find({ pushToken: { $ne: null } });
    for (const admin of admins) {
      if (admin.pushToken) {
        await pushNotification.sendAdminNewOrderNotification(admin.pushToken, {
          orderId,
          totalAmount: total,
          customerName: freshCustomer.name || 'Customer',
          items
        });
      }
    }
  } catch (pushErr) {
    logger.error('admin_push_notification_failed', {
      errorCategory: 'provider',
      origin: 'domain',
      finality: 'retryable',
      errorMessage: pushErr.message
    });
  }

  freshCustomer.cart = [];
  freshCustomer.orderHistory = freshCustomer.orderHistory || [];
  freshCustomer.orderHistory.push(order._id);
  await freshCustomer.save();
  
  customer.cart = [];
  customer.orderHistory = freshCustomer.orderHistory;
  
  await conversationState.setState(null, { pendingOrderId: orderId }, { phone });

  try {
    const frontendUrl = process.env.FRONTEND_URL || 'https://restarunt-bot.vercel.app';
    const paymentPageUrl = `${frontendUrl}/pay/${orderId}`;

    const orderDetailsImageUrl = await chatbotImagesService.getImageUrl('order_details');
    await whatsapp.sendOrder(phone, order, items, paymentPageUrl, orderDetailsImageUrl);
    
    logger.logDomainHandlerExit('payment', 'handleInitiateOnlinePayment', true, 'payment_initiated', correlationId, messageId);
    
    return { success: true };
  } catch (err) {
    logger.error('payment_page_creation_failed', {
      errorCategory: 'provider',
      origin: 'payment_handler',
      finality: 'retryable',
      orderId,
      errorMessage: err.message
    });
    await whatsapp.sendButtons(phone,
      `✅ *Order Created!*\n\nOrder ID: ${orderId}\nTotal: ₹${total}\n\n⚠️ Payment link unavailable.\nPlease contact us.`,
      [
        { id: 'order_status', text: 'Check Status' },
        { id: 'home', text: 'Main Menu' }
      ]
    );
    
    logger.logDomainHandlerExit('payment', 'handleInitiateOnlinePayment', true, 'payment_initiated_fallback', correlationId, messageId);
    
    return { success: true };
  }
  } catch (error) {
    logger.logDomainHandlerExit('payment', 'handleInitiateOnlinePayment', false, null, correlationId, messageId);
    throw error;
  }
}

async function handleInitiateCOD(phone, customer, state, correlationId = null, messageId = null) {
  logger.logDomainHandlerEntry('payment', 'handleInitiateCOD', ['phone', 'customer', 'state'], correlationId, messageId);
  
  try {
    const freshCustomer = await Customer.findOne({ phone }).populate('cart.menuItem');
    
    if (!freshCustomer?.cart?.length) {
      await whatsapp.sendButtons(phone, '🛒 Your cart is empty!', [
        { id: 'view_menu', text: 'View Menu' },
        { id: 'home', text: 'Main Menu' }
      ]);
      
      logger.logDomainHandlerExit('payment', 'handleInitiateCOD', true, 'cart_empty', correlationId, messageId);
      
      return { success: false };
    }

  const currentState = await conversationState.getState(null, { phone });
  let itemsTotal = 0;
  const items = [];
  for (const cartItem of freshCustomer.cart) {
    if (!cartItem.menuItem) continue;
    const item = cartItem.menuItem;
    const price = item.offerPrice && item.offerPrice < item.price ? item.offerPrice : item.price;
    const itemTotal = price * cartItem.quantity;
    itemsTotal += itemTotal;
    items.push({
      menuItem: item._id,
      name: item.name,
      quantity: cartItem.quantity,
      price: itemTotal,
      unit: item.unit || 'piece',
      unitQty: item.unitQty || 1,
      image: item.image
    });
  }

  let deliveryCharge = currentState.deliveryCharge || 0;
  const serviceType = currentState.serviceType || 'delivery';
  
  if (serviceType === 'delivery' && freshCustomer.deliveryAddress?.latitude && freshCustomer.deliveryAddress?.longitude) {
    const deliveryResult = await calculateDeliveryCharge(
      freshCustomer.deliveryAddress.latitude,
      freshCustomer.deliveryAddress.longitude
    );
    deliveryCharge = deliveryResult.charge || 0;
  }

  const total = itemsTotal + deliveryCharge;
  const orderId = generateOrderId('cod');
  const order = new Order({
    orderId,
    customer: {
      phone: freshCustomer.phone,
      name: freshCustomer.name || 'Customer',
      email: freshCustomer.email
    },
    deliveryAddress: serviceType === 'pickup' ? {
      address: 'Self-Pickup at Restaurant'
    } : freshCustomer.deliveryAddress,
    items,
    totalAmount: total,
    serviceType,
    deliveryCharge: serviceType === 'delivery' ? deliveryCharge : 0,
    deliveryDistance: currentState.deliveryDistance || null,
    locationCoordinates: serviceType === 'delivery' && freshCustomer.deliveryAddress?.latitude ? {
      latitude: freshCustomer.deliveryAddress.latitude,
      longitude: freshCustomer.deliveryAddress.longitude
    } : null,
    paymentMethod: 'cod',
    status: 'confirmed',
    trackingUpdates: [{ status: 'confirmed', message: 'Order confirmed - Cash on Delivery' }]
  });


  const whatsappBroadcast = require('../whatsappBroadcast');
  await whatsappBroadcast.addContact(freshCustomer.phone, freshCustomer.name, new Date());

  if (!freshCustomer.hasOrdered) {
    freshCustomer.hasOrdered = true;
  }

  try {
    const DashboardStats = require('../../models/DashboardStats');
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    
    await DashboardStats.findOneAndUpdate(
      {},
      { 
        $inc: { todayOrders: 1 },
        $set: { todayDate: todayStr, lastUpdated: new Date() }
      },
      { upsert: true }
    );
  } catch (statsErr) {
    logger.error('daily_order_stats_tracking_failed', {
      errorCategory: 'domain',
      origin: 'domain',
      finality: 'retryable',
      errorMessage: statsErr.message
    });
  }

  const dataEvents = require('../eventEmitter');
  dataEvents.emit('orders');
  dataEvents.emit('dashboard');

  const googleSheets = require('../googleSheets');
  googleSheets.addOrder(order).catch(err => logger.error('google_sheets_order_sync_failed', {
    errorCategory: 'provider',
    origin: 'domain',
    finality: 'retryable',
    errorMessage: err.message
  }));

  freshCustomer.cart = [];
  freshCustomer.orderHistory = freshCustomer.orderHistory || [];
  freshCustomer.orderHistory.push(order._id);
  await freshCustomer.save();
  
  customer.cart = [];
  customer.orderHistory = freshCustomer.orderHistory;

  const orderDetailsImageUrl = await chatbotImagesService.getImageUrl('order_details');
  await whatsapp.sendOrder(phone, order, items, null, orderDetailsImageUrl);

  logger.logDomainHandlerExit('payment', 'handleInitiateCOD', true, 'cod_initiated', correlationId, messageId);

  return { success: true };
  } catch (error) {
    logger.logDomainHandlerExit('payment', 'handleInitiateCOD', false, null, correlationId, messageId);
    throw error;
  }
}

function formatPriceWithOffer(item) {
  const effectivePrice = item.offerPrice && item.offerPrice < item.price ? item.offerPrice : item.price;
  if (item.offerPrice && item.offerPrice < item.price) {
    return `₹${item.offerPrice} ~~₹${item.price}~~`;
  }
  return `₹${effectivePrice}`;
}

function generateOrderId(prefix = 'order') {
  const timestamp = Date.now();
  const random = Math.floor(Math.random() * 1000);
  return `${prefix}_${timestamp}_${random}`;
}

async function sendWithOptionalImage(phone, imageUrl, message, buttons) {
  if (imageUrl) {
    await whatsapp.sendImageWithButtons(phone, imageUrl, message, buttons);
  } else {
    await whatsapp.sendButtons(phone, message, buttons);
  }
}

module.exports = {
  handleSelectPaymentMethod,
  handleSelectPickupPaymentMethod,
  handleInitiateOnlinePayment,
  handleInitiateCOD
};

// PHASE 3 STEP 3.4.4a COMPLETE WHEN:
// [x] Payment method selection + initiation moved to paymentInitiationHandler
// [x] NO payment verification/completion logic moved
// [x] NO order finalization logic moved
// [x] Razorpay payloads unchanged
// [x] State access still via conversationState
// [x] WhatsApp behavior unchanged
// [x] Phase 1 & Phase 2 invariants preserved
// [x] Reverting restores inline initiation logic
