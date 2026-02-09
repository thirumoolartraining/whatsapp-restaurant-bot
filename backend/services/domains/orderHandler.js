/*
 Phase 3 Step 3.4.3:
 Order placement domain extraction (pre-payment only).
 Encapsulates order confirmation and preparation logic.
 No behavior change.
*/

const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const Customer = require('../../models/Customer');
const Order = require('../../models/Order');
const Settings = require('../../models/Settings');
const chatbotImagesService = require('../chatbotImages');
const Logger = require('../logger');

const logger = new Logger('orderHandler');
const axios = require('axios');

// Helper functions copied from chatbot.js since they're defined there
const generateOrderId = (serviceType = 'delivery') => {
  const prefix = serviceType === 'pickup' ? 'S' : 'O';
  return prefix + 'RD' + Date.now().toString(36).toUpperCase();
};

// Helper to calculate delivery charge based on customer location
const calculateDeliveryCharge = async (customerLat, customerLon) => {
  try {

    // Calculate straight-line distance first
    const straightLineDistance = calculateStraightLineDistance(
      restaurantLocation.latitude,
      restaurantLocation.longitude,
      customerLat,
      customerLon
    );


    // Get delivery radius and charge settings
    const deliveryRadius = await Settings.getValue('deliveryRadius') || 5; // Default 5km
    const deliveryCharge = await Settings.getValue('deliveryCharge') || 30; // Default ₹30

    // If customer is within delivery radius, charge the standard delivery fee
    if (straightLineDistance <= deliveryRadius) {
      return { charge: deliveryCharge, distance: straightLineDistance };
    }

    // If outside delivery radius, delivery is not available
    return { charge: null, distance: straightLineDistance, available: false };
  } catch (error) {
    logger.error('delivery_charge_calculation_failed', {
      errorCategory: 'domain',
      origin: 'domain',
      finality: 'retryable',
      errorMessage: error.message
    });
    return { charge: 0, distance: null };
  }
};

// Haversine formula to calculate straight-line distance between two coordinates in KM
const calculateStraightLineDistance = (lat1, lon1, lat2, lon2) => {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  
  const R = 6371; // Earth's radius in kilometers
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = R * c;
  
  return Math.round(distance * 100) / 100; // Round to 2 decimal places
};

// Helper to format price with offer
const formatPriceWithOffer = (item) => {
  if (item.offerPrice && item.offerPrice < item.price) {
    const discount = Math.round(((item.price - item.offerPrice) / item.price) * 100);
    return `~₹${item.price}~ ➜ *₹${item.offerPrice}* (${discount}% OFF)`;
  }
  return `₹${item.price}`;
};

// Helper to send message with optional image (copied from chatbot.js)
const sendWithOptionalImage = async (phone, imageUrl, message, buttons, footer = '') => {
  if (imageUrl) {
    await whatsapp.sendImageWithButtons(phone, imageUrl, message, buttons, footer);
  } else {
    await whatsapp.sendButtons(phone, message, buttons, footer);
  }
};

const orderHandler = {
  /**
   * Generate and send order summary with payment method options
   * This handles the pre-payment order confirmation flow
   */
  async handleOrderSummary(phone, customer, state = {}, correlationId = null, messageId = null) {
    logger.logDomainHandlerEntry('order', 'handleOrderSummary', ['phone', 'customer', 'state'], correlationId, messageId);
    
    try {
      // Refresh customer from database to ensure we have latest cart data
      const freshCustomer = await Customer.findOne({ phone }).populate('cart.menuItem');
      
      if (!freshCustomer?.cart?.length) {
        await whatsapp.sendButtons(phone, '🛒 Your cart is empty!', [
          { id: 'view_menu', text: 'View Menu' },
          { id: 'home', text: 'Main Menu' }
        ]);
        
        logger.logDomainHandlerExit('order', 'handleOrderSummary', true, 'cart_empty', correlationId, messageId);
        return;
      }

      // Get current state for delivery charge and service type
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
      // Clean up invalid cart items
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
    
    // Calculate delivery charge if applicable
    let deliveryCharge = currentState.deliveryCharge || 0;
    const serviceType = currentState.serviceType || 'delivery';
    
    // Recalculate delivery charge if customer has location and service type is delivery
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
    
    // Show delivery charge if applicable
    if (deliveryCharge > 0) {
      cartMsg += `🚚 *Delivery Charge:* ₹${deliveryCharge}\n`;
    } else if (serviceType === 'delivery') {
      cartMsg += `🚚 *Delivery:* FREE\n`;
    }
    
    const grandTotal = itemsTotal + deliveryCharge;
    cartMsg += `━━━━━━━━━━━━━━━\n`;
    cartMsg += `*Grand Total: ₹${grandTotal}*\n\n`;
    
    // Show delivery address if available
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
    
    logger.logDomainHandlerExit('order', 'handleOrderSummary', true, 'payment_method_selection', correlationId, messageId);
  } catch (error) {
    logger.logDomainHandlerExit('order', 'handleOrderSummary', false, null, correlationId, messageId);
    logger.error('order_summary_processing_failed', {
      errorCategory: 'domain',
      origin: 'domain',
      finality: 'retryable',
      errorMessage: error.message,
      correlationId,
      messageId
    });
    throw error;
  }
},

  /**
   * Process order confirmation and create order object
   * This handles pre-payment order preparation only
   * Returns order object for payment processing
   */
  async handleOrderConfirmation(phone, customer, state, correlationId = null, messageId = null) {
    // Refresh customer from database to ensure we have latest cart data
    const freshCustomer = await Customer.findOne({ phone }).populate('cart.menuItem');
    
    if (!freshCustomer?.cart?.length) {
      await whatsapp.sendButtons(phone, '🛒 Your cart is empty!', [
        { id: 'view_menu', text: 'View Menu' },
        { id: 'home', text: 'Main Menu' }
      ]);
      return { success: false };
    }

    // Get current state for service type
    const currentState = await conversationState.getState(null, { phone });
    const serviceType = currentState.serviceType || currentState.selectedService || 'delivery';
    const orderId = generateOrderId(serviceType);
    let itemsTotal = 0;
    const items = freshCustomer.cart.filter(item => item.menuItem).map(item => {
      const effectivePrice = item.menuItem.offerPrice || item.menuItem.price;
      const subtotal = effectivePrice * item.quantity;
      itemsTotal += subtotal;
      return {
        menuItem: item.menuItem._id,
        name: item.menuItem.name,
        quantity: item.quantity,
        price: effectivePrice,
        unit: item.menuItem.unit || 'piece',
        unitQty: item.menuItem.quantity || 1,
        image: item.menuItem.image
      };
    });

    if (!items.length) {
      await whatsapp.sendButtons(phone, '🛒 Your cart is empty!', [
        { id: 'view_menu', text: 'View Menu' },
        { id: 'home', text: 'Main Menu' }
      ]);
      return { success: false };
    }

    // Calculate delivery charge for delivery orders
    let deliveryCharge = 0;
    let deliveryDistance = null;
    if (serviceType === 'delivery' && freshCustomer.deliveryAddress?.latitude && freshCustomer.deliveryAddress?.longitude) {
      const deliveryResult = await calculateDeliveryCharge(
        freshCustomer.deliveryAddress.latitude,
        freshCustomer.deliveryAddress.longitude
      );
      deliveryCharge = deliveryResult.charge || 0;
      deliveryDistance = deliveryResult.distance;
    }
    
    const total = itemsTotal + deliveryCharge;

    // Create order object (pre-payment)
    const order = new Order({
      orderId,
      customer: { phone: freshCustomer.phone, name: freshCustomer.name || 'Customer', email: freshCustomer.email },
      items,
      itemsTotal,
      deliveryCharge,
      deliveryDistance,
      totalAmount: total,
      serviceType: currentState.serviceType || currentState.selectedService || 'delivery',
      deliveryAddress: freshCustomer.deliveryAddress ? {
        address: freshCustomer.deliveryAddress.address,
        latitude: freshCustomer.deliveryAddress.latitude,
        longitude: freshCustomer.deliveryAddress.longitude
      } : null,
      paymentMethod: 'upi', // Default, will be overridden by payment logic
      paymentStatus: 'pending',
      trackingUpdates: [{ status: 'pending', message: 'Order created, awaiting payment' }],
      // Initialize acceptance discipline fields
      escalationLevel: 'none',
      acceptanceStartedAt: null,
      acceptanceDeadline: null,
      criticalAlertAt: null
    });
    
    return {
      success: true,
      order,
      items,
      total,
      freshCustomer,
      orderId
    };
  },

  /**
   * Handle place order intent - direct to food type selection
   */
  async handlePlaceOrderIntent(phone, menuItems, correlationId = null, messageId = null) {
    const menuHandler = require('./menuHandler');
    await menuHandler.handleFoodTypeSelection(phone, correlationId);
    await conversationState.setState(null, { currentStep: 'select_food_type_order' }, { phone });
  },

  /**
   * Process pickup checkout - moved from locationHandler
   */
  async processPickupCheckout(phone, customer, state) {
    try {
      // Refresh customer from database
      const freshCustomer = await Customer.findOne({ phone }).populate('cart.menuItem');
      if (!freshCustomer || !freshCustomer.cart?.length) {
        await whatsapp.sendButtons(phone, '🛒 Your cart is empty!', [
          { id: 'view_menu', text: 'View Menu' }
        ]);
        return { success: false };
      }

      // Calculate total and prepare items
      let total = 0;
      const items = [];
      for (const cartItem of freshCustomer.cart) {
        if (!cartItem.menuItem) continue;
        const item = cartItem.menuItem;
        const price = item.offerPrice && item.offerPrice < item.price ? item.offerPrice : item.price;
        const itemTotal = price * cartItem.quantity;
        total += itemTotal;
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

      // Create order
      const orderId = generateOrderId('pickup');
      const order = new Order({
        orderId,
        customer: {
          phone: freshCustomer.phone,
          name: freshCustomer.name || 'Customer',
          email: freshCustomer.email
        },
        deliveryAddress: {
          address: 'Self-Pickup at Restaurant'
        },
        items,
        totalAmount: total,
        serviceType: 'pickup',
        paymentMethod: state.paymentMethod || 'cod',
        paymentStatus: 'pending',
        status: 'pending',
        // Initialize acceptance discipline fields
        escalationLevel: 'none',
        acceptanceStartedAt: null,
        acceptanceDeadline: null,
        criticalAlertAt: null
      });


      // Clear cart
      freshCustomer.cart = [];
      await conversationState.setState(null, { currentStep: 'order_placed' }, { phone });
      await freshCustomer.save();

      // Send confirmation message
      const currentState = await conversationState.getState(null, { phone });
      let msg = '✅ *Order Request Successful!*\n\n';
      msg += `📦 Order ID: *${orderId}*\n`;
      msg += `🏪 Service: *Self-Pickup*\n`;
      msg += `💰 Total: *₹${total}*\n`;
      msg += `💳 Payment: *${currentState.paymentMethod === 'cod' ? 'Pay at Hotel' : 'UPI/App'}*\n\n`;
      
      // Add order items details
      msg += `━━━━━━━━━━━━━━━\n`;
      msg += `📋 *Order Details*\n`;
      msg += `━━━━━━━━━━━━━━━\n`;
      items.forEach((item, index) => {
        msg += `${index + 1}. ${item.name}\n`;
        msg += `   ${item.quantity} × ₹${item.price} = ₹${item.price * item.quantity}\n`;
      });
      msg += `━━━━━━━━━━━━━━━\n\n`;
      
      if (currentState.paymentMethod === 'cod') {
        msg += '✨ Your order has been received!\n\n';
        msg += '📍 Please come to the restaurant to pick up your order.\n';
        msg += '💵 Payment will be collected at the hotel.\n\n';
        msg += '⏰ We will notify you when your order is ready!\n\n';
        msg += 'Thank you for your order! 🙏';
      } else {
        msg += '✨ Your order has been received!\n\n';
        msg += '📍 Please come to the restaurant to pick up your order.\n';
        msg += '💳 Please complete the payment using the UPI link.\n\n';
        msg += '⏰ We will notify you when your order is ready!\n\n';
        msg += 'Thank you for your order! 🙏';
      }

      await whatsapp.sendMessage(phone, msg);
      return { success: true, orderId };
    } catch (error) {
      logger.error('pickup_checkout_processing_failed', {
        errorCategory: 'domain',
        origin: 'domain',
        finality: 'retryable',
        errorMessage: error.message
      });
      await whatsapp.sendMessage(phone, '❌ Failed to process your pickup order. Please try again.');
      return { success: false };
    }
  }
};

module.exports = orderHandler;

// PHASE 3 STEP 3.4.3 COMPLETE WHEN:
// [ ] All pre-payment order logic moved to orderHandler
// [ ] chatbot.js delegates order placement logic only
// [ ] NO payment logic moved
// [ ] NO delivery/location logic moved
// [ ] State access still via conversationState
// [ ] WhatsApp behavior unchanged
// [ ] Phase 1 & Phase 2 invariants preserved
// [ ] Reverting restores inline order logic
