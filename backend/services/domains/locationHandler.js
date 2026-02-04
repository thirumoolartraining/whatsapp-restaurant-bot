/*
 Phase 3 Step 3.4.5:
 Location & delivery domain extraction.
 Encapsulates service type + location handling + delivery fee/eligibility logic.
 No order creation or persistence logic.
 No behavior change.
*/

const axios = require('axios');
const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const Customer = require('../../models/Customer');
const Settings = require('../../models/Settings');
const chatbotImagesService = require('../chatbotImagesService');
const orderHandler = require('./orderHandler');

// Helper to calculate straight-line distance between two points
const calculateStraightLineDistance = (lat1, lon1, lat2, lon2) => {
  try {
    const R = 6371; // Earth's radius in kilometers
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const distance = R * c;
    return Math.round(distance * 100) / 100;
  } catch (error) {
    console.error('Error calculating distance:', error);
    return null;
  }
};

// Helper to calculate delivery charge based on customer location
const calculateDeliveryCharge = async (customerLat, customerLon) => {
  try {
    // Get restaurant location settings
    const restaurantLocation = await Settings.getValue('restaurantLocation');
    const deliverySettings = await Settings.getValue('deliverySettings');
    
    // If settings not configured, no delivery charge
    if (!restaurantLocation?.latitude || !restaurantLocation?.longitude) {
      console.log('📍 Restaurant location not configured - no delivery charge');
      return { charge: 0, distance: null, withinFreeRadius: true, message: null };
    }
    
    if (!deliverySettings) {
      console.log('🚚 Delivery settings not configured - no delivery charge');
      return { charge: 0, distance: null, withinFreeRadius: true, message: null };
    }
    
    // Calculate RADIUS distance (straight-line) - not road distance
    // This is simpler and more consistent regardless of route taken
    const distance = calculateStraightLineDistance(
      restaurantLocation.latitude, 
      restaurantLocation.longitude,
      customerLat, 
      customerLon
    );
    
    console.log(`\n📍 ========== RADIUS CHECK ==========`);
    console.log(`📍 Restaurant: ${restaurantLocation.latitude}, ${restaurantLocation.longitude}`);
    console.log(`📍 Customer: ${customerLat}, ${customerLon}`);
    console.log(`📏 Radius distance: ${distance} KM (straight-line)`);
    console.log(`📍 ===================================\n`);
    
    if (distance === null) {
      console.log('📍 Could not calculate distance - no delivery charge');
      return { charge: 0, distance: null, withinFreeRadius: true, message: null };
    }
    
    console.log(`📍 Distance from restaurant: ${distance} KM`);
    
    const noFreeDelivery = deliverySettings.noFreeDelivery || false;
    const baseDeliveryCharge = deliverySettings.baseDeliveryCharge || 0;
    const freeRadius = deliverySettings.freeDeliveryRadius || 5;
    const maxRadius = deliverySettings.maxDeliveryRadius;
    const extraChargeEnabled = deliverySettings.enableExtraDeliveryCharge;
    const extraCharge = deliverySettings.extraDeliveryCharge || 0;
    
    // Check if beyond max delivery radius first
    if (maxRadius && distance > maxRadius) {
      console.log(`❌ Beyond max delivery radius (${maxRadius} KM)`);
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
      console.log(`💰 No free delivery - base charge: ₹${baseDeliveryCharge}`);
      // If outside free radius AND extra charge enabled, add extra on top of base
      if (distance > freeRadius && extraChargeEnabled && extraCharge > 0) {
        const totalCharge = baseDeliveryCharge + extraCharge;
        console.log(`💰 Beyond ${freeRadius} KM - total charge: ₹${totalCharge}`);
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
      console.log(`✅ Within free delivery radius (${freeRadius} KM)`);
      return { 
        charge: 0, 
        distance, 
        withinFreeRadius: true, 
        message: `Your location is ${distance.toFixed(1)} KM away - Free Delivery! 🎉`
      };
    }
    
    // Outside free radius - check if extra charge is enabled
    if (extraChargeEnabled && extraCharge > 0) {
      console.log(`💰 Outside free radius - adding delivery charge: ₹${extraCharge}`);
      return { 
        charge: extraCharge, 
        distance, 
        withinFreeRadius: false, 
        message: `Your location is ${distance.toFixed(1)} KM away. A delivery charge of ₹${extraCharge} will be added.`
      };
    }
    
    // Extra charge NOT enabled AND customer is outside free radius - REJECT ORDER
    console.log(`❌ Outside free radius (${freeRadius} KM) - delivery not available`);
    return { 
      charge: null, 
      distance, 
      withinFreeRadius: false, 
      deliveryNotAvailable: true,
      freeRadius,
      message: `Sorry, our delivery service is available only within ${freeRadius} KM. Your location is ${distance.toFixed(1)} KM away. Please try pickup instead.`
    };
    
  } catch (error) {
    console.error('Error calculating delivery charge:', error);
    return { charge: 0, distance: null, withinFreeRadius: true, message: null };
  }
};

// Reverse geocode coordinates to get readable address
const reverseGeocode = async (latitude, longitude) => {
  try {
    const response = await axios.get(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&addressdetails=1`,
      { headers: { 'User-Agent': 'RestaurantBot/1.0' } }
    );
    
    if (response.data && response.data.address) {
      const addr = response.data.address;
      // Build a readable address
      const parts = [];
      if (addr.house_number) parts.push(addr.house_number);
      if (addr.road) parts.push(addr.road);
      if (addr.suburb) parts.push(addr.suburb);
      if (addr.city || addr.town || addr.village) parts.push(addr.city || addr.town || addr.village);
      if (addr.state) parts.push(addr.state);
      if (addr.postcode) parts.push(addr.postcode);
      
      return parts.length > 0 ? parts.join(', ') : response.data.display_name || 'Location shared';
    }
    return 'Location shared';
  } catch (error) {
    console.error('Reverse geocoding error:', error.message);
    return 'Location shared';
  }
};

// Handle service type selection (delivery vs pickup)
const handleServiceTypeSelection = async (phone) => {
  await whatsapp.sendButtons(phone,
    '🚚 *Choose Service Type*\n\nHow would you like to receive your order?',
    [
      { id: 'service_delivery', text: 'Delivery' },
      { id: 'service_pickup', text: 'Self-Pickup' }
    ],
    'Select your preferred option'
  );
};

// Handle location message processing
const handleLocationMessage = async (phone, message, customer, state) => {
  // message contains location data: { latitude, longitude, name, address }
  const locationData = typeof message === 'object' ? message : {};
  
  console.log('📍 Location received:', locationData);
  
  // Get proper address from coordinates using reverse geocoding
  let formattedAddress = 'Location shared';
  if (locationData.latitude && locationData.longitude) {
    formattedAddress = await reverseGeocode(locationData.latitude, locationData.longitude);
  }
  
  // Check delivery radius BEFORE saving location
  if (locationData.latitude && locationData.longitude && customer.cart?.length > 0) {
    const deliveryResult = await calculateDeliveryCharge(locationData.latitude, locationData.longitude);
    
    // If beyond max delivery radius, reject the order
    if (deliveryResult.beyondMaxRadius) {
      const outOfRangeImg = await chatbotImagesService.getImageUrl('out_of_delivery_range');
      const message = `❌ *Delivery Not Available*\n\n${deliveryResult.message}\n\nWould you like to try a different address or opt for self-pickup?`;
      
      if (outOfRangeImg) {
        await whatsapp.sendImageWithButtons(phone, outOfRangeImg, message, [
          { id: 'service_pickup', text: '🏪 Self-Pickup' },
          { id: 'share_location', text: '📍 New Location' },
          { id: 'home', text: '🏠 Main Menu' }
        ]);
      } else {
        await whatsapp.sendButtons(phone, message, [
          { id: 'service_pickup', text: '🏪 Self-Pickup' },
          { id: 'share_location', text: '📍 New Location' },
          { id: 'home', text: '🏠 Main Menu' }
        ]);
      }
      await conversationState.setState(null, { currentStep: 'awaiting_location' }, { phone });
      return { handled: true, shouldReturn: true };
    }
    
    // If delivery not available (outside free radius and extra charge not enabled)
    if (deliveryResult.deliveryNotAvailable) {
      const outOfRangeImg = await chatbotImagesService.getImageUrl('out_of_delivery_range');
      const message = `❌ *Delivery Not Available*\n\n${deliveryResult.message}\n\nWould you like to try a different address or opt for self-pickup?`;
      
      if (outOfRangeImg) {
        await whatsapp.sendImageWithButtons(phone, outOfRangeImg, message, [
          { id: 'service_pickup', text: '🏪 Self-Pickup' },
          { id: 'share_location', text: '📍 New Location' },
          { id: 'home', text: '🏠 Main Menu' }
        ]);
      } else {
        await whatsapp.sendButtons(phone, message, [
          { id: 'service_pickup', text: '🏪 Self-Pickup' },
          { id: 'share_location', text: '📍 New Location' },
          { id: 'home', text: '🏠 Main Menu' }
        ]);
      }
      await conversationState.setState(null, { currentStep: 'awaiting_location' }, { phone });
      return { handled: true, shouldReturn: true };
    }
    
    // Store delivery charge info in customer state for later use
    await conversationState.setState(null, { 
      deliveryCharge: deliveryResult.charge || 0,
      deliveryDistance: deliveryResult.distance
    }, { phone });
  }
  
  customer.deliveryAddress = {
    latitude: locationData.latitude,
    longitude: locationData.longitude,
    address: formattedAddress,
    updatedAt: new Date()
  };
  await customer.save();
  
  // If customer has items in cart, show order summary with payment options
  if (customer.cart?.length > 0) {
    await orderHandler.handleOrderSummary(phone, customer, state);
    await conversationState.setState(null, { currentStep: 'select_payment_method' }, { phone });
  } else {
    // No cart items, just confirm location saved
    await whatsapp.sendButtons(phone, 
      `📍 Location saved!\n\n${formattedAddress}\n\nStart ordering to use this address.`,
      [
        { id: 'place_order', text: 'Start Order' },
        { id: 'home', text: 'Main Menu' }
      ]
    );
    await conversationState.setState(null, { currentStep: 'main_menu' }, { phone });
  }
  
  return { handled: true, shouldReturn: false };
};

// Handle address capture (request location)
const handleAddressCapture = async (phone) => {
  // Request location with action buttons
  await whatsapp.sendLocationRequest(phone,
    `📍 *Share Your Delivery Location*\n\nPlease share your location for accurate delivery.`
  );
};

// Handle delivery eligibility check (wrapper around calculateDeliveryCharge)
const handleDeliveryEligibility = async (customerLat, customerLon) => {
  return await calculateDeliveryCharge(customerLat, customerLon);
};

// Generate order ID based on service type
const generateOrderId = (serviceType = 'delivery') => {
  const prefix = serviceType === 'pickup' ? 'S' : 'O';
  return prefix + 'RD' + Date.now().toString(36).toUpperCase();
};

module.exports = {
  handleServiceTypeSelection,
  handleLocationMessage,
  handleAddressCapture,
  handleDeliveryEligibility,
  calculateDeliveryCharge,
  generateOrderId
};

// PHASE 3 STEP 3.4.5 COMPLETE WHEN:
// [✓] All location/delivery logic moved to locationHandler
// [✓] chatbot.js delegates location logic only
// [✓] No menu/cart/order/payment logic moved
// [✓] State access still via conversationState
// [✓] Delivery fee/eligibility logic unchanged
// [✓] WhatsApp behavior unchanged
// [✓] Phase 1 & Phase 2 invariants preserved
// [✓] Reverting restores inline location logic
// [✓] No order creation or persistence logic in locationHandler
