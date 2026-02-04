/*
 Phase 3 Step 3.4.2:
 Cart management domain extraction.
 Encapsulates cart logic only.
 No behavior change.
*/

const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const chatbotImagesService = require('../chatbotImages');
const { formatPriceWithOffer } = require('../utils');
const { sendWithOptionalImage } = require('../messageProcessor');
const Customer = require('../../models/Customer');
const MenuItem = require('../../models/MenuItem');
const Category = require('../../models/Category');

// Helper to check if cart items are still available
const checkCartAvailability = async (cart) => {
  if (!cart || cart.length === 0) return { available: true, unavailableItems: [] };
  
  const unavailableItems = [];
  const allCategories = await Category.find({ isActive: true });
  const pausedCategoryNames = allCategories
    .filter(c => c.schedule?.enabled && (c.isPaused || c.isSoldOut))
    .map(c => c.name);
  
  for (const cartItem of cart) {
    const menuItem = await MenuItem.findById(cartItem.menuItem);
    if (!menuItem) {
      unavailableItems.push({ name: cartItem.menuItem?.name || 'Unknown item', reason: 'deleted' });
      continue;
    }
    
    if (menuItem.isPaused || menuItem.isSoldOut) {
      unavailableItems.push({ name: menuItem.name, reason: menuItem.isPaused ? 'paused' : 'sold out' });
      continue;
    }
    
    if (pausedCategoryNames.includes(menuItem.category)) {
      unavailableItems.push({ name: menuItem.name, reason: 'category paused' });
    }
  }
  
  return {
    available: unavailableItems.length === 0,
    unavailableItems
  };
};

const cartHandler = {
  // Handle adding item to cart with quantity
  async handleAddToCart(context) {
    const { phone, customer, item, quantity } = context;
    
    customer.cart = customer.cart || [];
    const existingIndex = customer.cart.findIndex(c => c.menuItem?.toString() === item._id.toString());
    
    if (existingIndex >= 0) {
      customer.cart[existingIndex].quantity += quantity;
      customer.cart[existingIndex].addedAt = new Date(); // Update timestamp when quantity changes
    } else {
      customer.cart.push({ menuItem: item._id, quantity, addedAt: new Date() });
    }
    
    await customer.save();
    await this.sendAddedToCart(phone, item, quantity, customer.cart);
  },

  // Handle removing item from cart by index
  async handleRemoveFromCart(context) {
    const { phone, customer, index } = context;
    
    if (customer.cart && customer.cart[index]) {
      customer.cart.splice(index, 1);
      await customer.save();
      await this.sendCart(phone, customer);
      await conversationState.setState(null, { currentStep: 'viewing_cart' }, { phone });
    }
  },

  // Handle viewing cart contents
  async handleViewCart(context) {
    const { phone, customer } = context;
    await this.sendCart(phone, customer);
    await conversationState.setState(null, { currentStep: 'viewing_cart' }, { phone });
  },

  // Handle clearing entire cart
  async handleClearCart(context) {
    const { phone, customer } = context;
    
    const itemCount = customer.cart?.length || 0;
    customer.cart = [];
    await customer.save();
    
    const cartClearedImageUrl = await chatbotImagesService.getImageUrl('cart_cleared');
    
    let message = '🗑️ *Cart Cleared Successfully!*\n\n';
    if (itemCount > 0) {
      message += `✅ Removed ${itemCount} item${itemCount > 1 ? 's' : ''} from your cart.\n\n`;
    }
    message += `🛒 Your cart is now empty and ready for a fresh start!\n\n`;
    message += `🍽️ Browse our delicious menu and discover your favorites! 😋`;
    
    await whatsapp.sendMessage(phone, message);
    await conversationState.setState(null, { currentStep: 'main_menu' }, { phone });
  },

  // Handle updating item quantity in cart
  async handleUpdateQuantity(context) {
    const { phone, customer, item, quantity } = context;
    
    // Check if item already in cart
    const existingIndex = customer.cart.findIndex(c => c.menuItem?.toString() === item._id.toString());
    if (existingIndex >= 0) {
      customer.cart[existingIndex].quantity += quantity;
      customer.cart[existingIndex].addedAt = new Date(); // Update timestamp when quantity changes
    } else {
      customer.cart.push({ menuItem: item._id, quantity, addedAt: new Date() });
    }
    
    // Save cart immediately to persist the change
    await customer.save();
    await this.sendAddedToCart(phone, item, quantity, customer.cart);
  },

  // Handle cart options menu
  async handleCartOptionsMenu(context) {
    const { phone } = context;
    
    const cartOptionsImageUrl = await chatbotImagesService.getImageUrl('cart_options');
    const message = `🛒 *Cart Options*\n\nWhat would you like to do?`;
    
    await whatsapp.sendButtons(phone, message, [
      { id: 'view_cart', text: 'View Cart' },
      { id: 'clear_cart', text: 'Clear Cart' },
      { id: 'view_menu', text: 'View Menu' },
      { id: 'home', text: 'Main Menu' }
    ]);
  },

  // Send cart view to user
  async sendCart(phone, customer) {
    // Refresh customer from database to ensure we have latest cart data
    const freshCustomer = await Customer.findOne({ phone }).populate('cart.menuItem');
    
    if (!freshCustomer.cart || freshCustomer.cart.length === 0) {
      await whatsapp.sendButtons(phone, '🛒 Your cart is empty! Add items from the menu.', [
        { id: 'view_menu', text: 'View Menu' },
        { id: 'home', text: 'Main Menu' }
      ]);
      return;
    }

    let total = 0;
    let cartMsg = '🛒 *Your Cart*\n\n';
    let validItems = 0;
    
    freshCustomer.cart.forEach((item, i) => {
      if (item.menuItem && !item.menuItem.isPaused && !item.menuItem.isSoldOut) {
        const subtotal = (item.menuItem.price || 0) * item.quantity;
        total += subtotal;
        validItems++;
        const unitInfo = `${item.menuItem.quantity || 1} ${item.menuItem.unit || 'piece'}`;
        const priceDisplay = formatPriceWithOffer(item.menuItem);
        cartMsg += `${validItems}. *${item.menuItem.name}* (${unitInfo})\n`;
        cartMsg += `   ${item.quantity} × ${priceDisplay} = ₹${subtotal}\n\n`;
      }
    });
    
    if (validItems === 0) {
      await whatsapp.sendButtons(phone, 'All items in your cart are currently unavailable. Please add new items.', [
        { id: 'view_menu', text: 'View Menu' },
        { id: 'home', text: 'Main Menu' }
      ]);
      return;
    }
    
    cartMsg += `━━━━━━━━━━━━━━━\n`;
    cartMsg += `*Total: ₹${total}*`;

    const viewCartImageUrl = await chatbotImagesService.getImageUrl('view_cart');
    await sendWithOptionalImage(phone, viewCartImageUrl, cartMsg, [
      { id: 'review_pay', text: 'Review & Order' },
      { id: 'add_more', text: 'Add More' },
      { id: 'clear_cart', text: 'Clear Cart' }
    ]);
  },

  // Send added to cart confirmation
  async sendAddedToCart(phone, item, qty, cart) {
    const cartCount = cart.reduce((sum, c) => sum + c.quantity, 0);
    const unitInfo = `${item.quantity || 1} ${item.unit || 'piece'}`;
    const priceDisplay = formatPriceWithOffer(item);
    const itemTotal = (item.price || 0) * qty;

    let message = `✅ *Added to Cart!*\n\n`;
    message += `*${item.name}* (${unitInfo})\n`;
    message += `Quantity: ${qty}\n`;
    message += `Price: ${priceDisplay} × ${qty} = ₹${itemTotal}\n\n`;
    message += `🛒 Cart: ${cartCount} item${cartCount > 1 ? 's' : ''}`;

    const addedToCartImageUrl = await chatbotImagesService.getImageUrl('added_to_cart');
    await sendWithOptionalImage(phone, addedToCartImageUrl, message, [
      { id: 'view_cart', text: 'View Cart' },
      { id: 'add_more', text: 'Add More' },
      { id: 'checkout', text: 'Checkout' }
    ]);
  },

  // Check cart availability (exported for use in other domains)
  checkCartAvailability
};

module.exports = cartHandler;

// PHASE 3 STEP 3.4.2 COMPLETE WHEN:
// [ ] All cart management logic moved to cartHandler
// [ ] chatbot.js delegates cart logic only
// [ ] No checkout/order/payment logic moved
// [ ] State access still via conversationState
// [ ] WhatsApp behavior unchanged
// [ ] Phase 1 & Phase 2 invariants preserved
// [ ] Reverting restores inline cart logic
