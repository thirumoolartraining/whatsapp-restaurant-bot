/*
 Phase 3 Step 3.4.1:
 Menu domain extraction.
 Encapsulates menu browsing logic only.
 No behavior change.
*/

const conversationState = require('../conversationState');
const whatsapp = require('../whatsapp');
const chatbotImagesService = require('../chatbotImagesService');
const { sendWithOptionalImage, formatPriceWithOffer } = require('../messageUtils');
const Logger = require('../logger');

const logger = new Logger('menuHandler');

// Helper to filter items by food type preference
const filterByFoodType = (menuItems, preference) => {
  if (preference === 'both') return menuItems;
  if (preference === 'veg') return menuItems.filter(item => item.foodType === 'veg');
  if (preference === 'egg') return menuItems.filter(item => item.foodType === 'egg');
  if (preference === 'nonveg') return menuItems.filter(item => item.foodType === 'nonveg');
  return menuItems;
};

// Handle food type selection screen
const handleFoodTypeSelection = async (phone, correlationId = null, messageId = null) => {
  logger.logDomainHandlerEntry('menu', 'handleFoodTypeSelection', ['phone'], correlationId, messageId);
  
  try {
    const browseMenuImageUrl = await chatbotImagesService.getImageUrl('browse_menu');
    await sendWithOptionalImage(phone, browseMenuImageUrl,
      '🍽️ *Browse Menu*\n\nWhat would you like to see?',
      [
        { id: 'food_veg', text: 'Veg Only' },
        { id: 'food_nonveg', text: 'Non-Veg Only' },
        { id: 'food_both', text: 'Show All' }
      ]
    );
    
    logger.logDomainHandlerExit('menu', 'handleFoodTypeSelection', true, 'food_type_selection', correlationId, messageId);
  } catch (error) {
    logger.logDomainHandlerExit('menu', 'handleFoodTypeSelection', false, null, correlationId, messageId);
    logger.logError(error, 'menuHandler', 'domain_handler', null, correlationId, messageId);
    throw error;
  }
};

// Handle showing menu categories based on food type preference
const handleShowMenuCategories = async (phone, menuItems, foodType, label, correlationId = null, messageId = null) => {
  logger.logDomainHandlerEntry('menu', 'handleShowMenuCategories', ['phone', 'menuItems', 'foodType', 'label'], correlationId, messageId);
  
  try {
    await conversationState.setState(null, { foodTypePreference: foodType }, { phone });
    const filteredItems = filterByFoodType(menuItems, foodType);
    
    if (filteredItems.length > 0) {
      await sendMenuCategoriesWithLabel(phone, filteredItems, label);
      await conversationState.setState(null, { currentStep: 'select_category' }, { phone });
      logger.logDomainHandlerExit('menu', 'handleShowMenuCategories', true, 'select_category', correlationId, messageId);
    } else {
      const noItemsMessage = `No ${foodType} items available right now.`;
      await whatsapp.sendButtons(phone, noItemsMessage, [
        { id: 'view_menu', text: 'View All Menu' },
        { id: 'home', text: 'Main Menu' }
      ]);
      await conversationState.setState(null, { currentStep: 'main_menu' }, { phone });
      logger.logDomainHandlerExit('menu', 'handleShowMenuCategories', true, 'main_menu', correlationId, messageId);
    }
  } catch (error) {
    logger.logDomainHandlerExit('menu', 'handleShowMenuCategories', false, null, correlationId, messageId);
    logger.logError(error, 'menuHandler', 'domain_handler', null, correlationId, messageId);
    throw error;
  }
};

// Handle food type selection from buttons
const handleFoodTypeSelectionResponse = async (phone, menuItems, selection, correlationId = null, messageId = null) => {
  const foodType = selection.replace('food_', '');
  await conversationState.setState(null, { foodTypePreference: foodType }, { phone });
  
  const currentState = await conversationState.getState(null, { phone });
  const filteredItems = filterByFoodType(menuItems, currentState.foodTypePreference);
  
  const foodTypeLabels = {
    veg: '🌿 Veg Menu',
    egg: '🥚 Egg Menu',
    nonveg: '🍗 Non-Veg Menu',
    both: '📋 Full Menu'
  };
  
  // If coming from order flow, show menu for ordering; otherwise show browse menu
  if (currentState.currentStep === 'select_food_type_order') {
    await sendMenuForOrderWithLabel(phone, filteredItems, foodTypeLabels[currentState.foodTypePreference]);
    await conversationState.setState(null, { currentStep: 'browsing_menu' }, { phone });
  } else {
    await sendMenuCategoriesWithLabel(phone, filteredItems, foodTypeLabels[currentState.foodTypePreference]);
    await conversationState.setState(null, { currentStep: 'select_category' }, { phone });
  }
};

// Send menu categories with pagination support
const sendMenuCategories = async (phone, menuItems, label = 'Our Menu', page = 0) => {
  // Flatten category arrays and dedupe (category is an array field)
  const categories = [...new Set(menuItems.flatMap(m => Array.isArray(m.category) ? m.category : [m.category]))];
  
  if (!categories.length) {
    await whatsapp.sendButtons(phone, '📋 No menu items available right now.', [
      { id: 'home', text: 'Main Menu' }
    ]);
    return;
  }

  // If 9 or fewer categories (+ All Items = 10), use WhatsApp list without pagination
  if (categories.length <= 9) {
    const rows = [
      { rowId: 'cat_all', title: '📋 All Items', description: `${menuItems.length} items - View everything` }
    ];
    
    categories.forEach(cat => {
      const count = menuItems.filter(m => Array.isArray(m.category) ? m.category.includes(cat) : m.category === cat).length;
      const safeId = cat.replace(/[^a-zA-Z0-9_]/g, '_');
      rows.push({ rowId: `cat_${safeId}`, title: cat.substring(0, 24), description: `${count} items available` });
    });

    await whatsapp.sendList(phone, label, 'Select a category to browse items', 'View Categories',
      [{ title: 'Menu Categories', rows }], 'Fresh & Delicious!');
    return;
  }

  // More than 9 categories - use pagination with WhatsApp list
  const CATS_PER_PAGE = 9; // 9 categories + 1 "All Items" = 10 rows max
  const totalPages = Math.ceil(categories.length / CATS_PER_PAGE);
  const startIdx = page * CATS_PER_PAGE;
  const pageCats = categories.slice(startIdx, startIdx + CATS_PER_PAGE);

  // Build rows for the list
  const rows = [];
  
  // Add "All Items" option on first page only
  if (page === 0) {
    rows.push({ rowId: 'cat_all', title: '📋 All Items', description: `${menuItems.length} items - View everything` });
  }
  
  pageCats.forEach(cat => {
    const count = menuItems.filter(m => Array.isArray(m.category) ? m.category.includes(cat) : m.category === cat).length;
    const safeId = cat.replace(/[^a-zA-Z0-9_]/g, '_');
    rows.push({ rowId: `cat_${safeId}`, title: cat.substring(0, 24), description: `${count} items available` });
  });

  await whatsapp.sendList(
    phone,
    `📋 ${label}`,
    `Page ${page + 1}/${totalPages} • ${categories.length} categories\nTap to select a category`,
    'View Categories',
    [{ title: 'Menu Categories', rows }],
    'Select a category'
  );

  // Send navigation buttons
  const buttons = [];
  if (page > 0) buttons.push({ id: `menucat_page_${page - 1}`, text: 'Previous' });
  if (page < totalPages - 1) buttons.push({ id: `menucat_page_${page + 1}`, text: 'Next' });
  buttons.push({ id: 'home', text: 'Menu' });

  await whatsapp.sendButtons(phone, `Page ${page + 1} of ${totalPages}`, buttons.slice(0, 3));
};

const sendMenuCategoriesWithLabel = async (phone, menuItems, label, page = 0) => {
  await sendMenuCategories(phone, menuItems, label, page);
};

// Handle category selection for browsing
const handleCategorySelection = async (phone, menuItems, selection, correlationId = null, messageId = null) => {
  logger.logDomainHandlerEntry('menu', 'handleCategorySelection', ['phone', 'menuItems', 'selection'], correlationId, messageId);
  
  try {
    if (selection === 'cat_all') {
      // Show all items from all categories (within selected food type)
      const currentState = await conversationState.getState(null, { phone });
      const preference = currentState.foodTypePreference || 'both';
      const filteredItems = filterByFoodType(menuItems, preference);
      
      
      await sendAllItems(phone, filteredItems);
      await conversationState.setState(null, { selectedCategory: 'all', currentStep: 'viewing_items' }, { phone });
      
      logger.logDomainHandlerExit('menu', 'handleCategorySelection', true, 'viewing_items', correlationId, messageId);
    } else if (selection.startsWith('cat_')) {
      const sanitizedCat = selection.replace('cat_', '');
      const currentState = await conversationState.getState(null, { phone });
      const preference = currentState.foodTypePreference || 'both';
      const filteredItems = filterByFoodType(menuItems, preference);
      // Find original category name from sanitized ID
      const allCategories = [...new Set(filteredItems.flatMap(m => Array.isArray(m.category) ? m.category : [m.category]))];
      const category = allCategories.find(c => c.replace(/[^a-zA-Z0-9_]/g, '_') === sanitizedCat) || sanitizedCat;
      
      
      await sendCategoryItems(phone, filteredItems, category);
      await conversationState.setState(null, { selectedCategory: category, currentStep: 'viewing_items' }, { phone });
      
      logger.logDomainHandlerExit('menu', 'handleCategorySelection', true, 'viewing_items', correlationId, messageId);
    }
  } catch (error) {
    logger.logDomainHandlerExit('menu', 'handleCategorySelection', false, null, correlationId, messageId);
    logger.logError(error, 'menuHandler', 'domain_handler', null, correlationId, messageId);
    throw error;
  }
};

// Send category items with pagination
const sendCategoryItems = async (phone, menuItems, category, page = 0) => {
  // Filter items that include this category (category is an array field)
  const items = menuItems.filter(m => Array.isArray(m.category) ? m.category.includes(category) : m.category === category);
  
  if (!items.length) {
    await whatsapp.sendButtons(phone, `📋 No items in ${category} right now.`, [
      { id: 'view_menu', text: 'Back to Menu' },
      { id: 'home', text: 'Main Menu' }
    ]);
    return;
  }

  const getFoodTypeIcon = (type) => type === 'veg' ? '🟢' : type === 'nonveg' ? '🔴' : type === 'egg' ? '🟡' : '';
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const startIdx = page * ITEMS_PER_PAGE;
  const pageItems = items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  // Build rows for the list
  const rows = pageItems.map(item => {
    const ratingStr = item.totalRatings > 0 ? `⭐${item.avgRating}` : '☆';
    const priceDisplay = formatPriceWithOffer(item);
    return {
      rowId: `view_${item._id}`,
      title: `${getFoodTypeIcon(item.foodType)} ${item.name}`.substring(0, 24),
      description: `${ratingStr} • ${priceDisplay} • ${item.quantity || 1} ${item.unit || 'piece'}`.substring(0, 72)
    };
  });

  // Only items in the list, no navigation rows
  const sections = [{ title: `${category} (${items.length} items)`, rows }];

  await whatsapp.sendList(
    phone,
    `📋 ${category}`,
    `Page ${page + 1}/${totalPages} • ${items.length} items total\nTap an item to view details`,
    'View Items',
    sections,
    'Select an item'
  );

  // Send navigation buttons if multiple pages
  if (totalPages > 1) {
    const safeCat = category.replace(/[^a-zA-Z0-9]/g, '_');
    const buttons = [];
    if (page > 0) buttons.push({ id: `catpage_${safeCat}_${page - 1}`, text: 'Previous' });
    if (page < totalPages - 1) buttons.push({ id: `catpage_${safeCat}_${page + 1}`, text: 'Next' });
    buttons.push({ id: 'view_menu', text: 'Menu' });
    await whatsapp.sendButtons(phone, `Page ${page + 1} of ${totalPages}`, buttons.slice(0, 3));
  }
};

// Send all items (for browsing) - always use WhatsApp list with pagination
const sendAllItems = async (phone, menuItems, page = 0) => {
  if (!menuItems.length) {
    await whatsapp.sendButtons(phone, '📋 No items available right now.', [
      { id: 'view_menu', text: 'Back to Menu' },
      { id: 'home', text: 'Main Menu' }
    ]);
    return;
  }

  const getFoodTypeIcon = (type) => type === 'veg' ? '🟢' : type === 'nonveg' ? '🔴' : type === 'egg' ? '🟡' : '';
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(menuItems.length / ITEMS_PER_PAGE);
  const startIdx = page * ITEMS_PER_PAGE;
  const pageItems = menuItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  // Build rows for the list
  const rows = pageItems.map(item => {
    const ratingStr = item.totalRatings > 0 ? `⭐${item.avgRating}` : '☆';
    const priceDisplay = formatPriceWithOffer(item);
    return {
      rowId: `view_${item._id}`,
      title: `${getFoodTypeIcon(item.foodType)} ${item.name}`.substring(0, 24),
      description: `${ratingStr} • ${priceDisplay} • ${item.quantity || 1} ${item.unit || 'piece'}`.substring(0, 72)
    };
  });

  const sections = [{ title: `All Items (${menuItems.length})`, rows }];

  await whatsapp.sendList(
    phone,
    '📋 All Items',
    `Page ${page + 1}/${totalPages} • ${menuItems.length} items total\nTap an item to view details`,
    'View Items',
    sections,
    'Select an item'
  );

  // Send navigation buttons if multiple pages
  if (totalPages > 1) {
    const buttons = [];
    if (page > 0) buttons.push({ id: `allitems_page_${page - 1}`, text: 'Previous' });
    if (page < totalPages - 1) buttons.push({ id: `allitems_page_${page + 1}`, text: 'Next' });
    buttons.push({ id: 'view_menu', text: 'Menu' });
    await whatsapp.sendButtons(phone, `Page ${page + 1} of ${totalPages}`, buttons.slice(0, 3));
  }
};

// Handle menu pagination for categories
const handleMenuPagination = async (phone, menuItems, selection, correlationId = null, messageId = null) => {
  if (selection.startsWith('menucat_page_')) {
    const page = parseInt(selection.replace('menucat_page_', ''));
    const currentState = await conversationState.getState(null, { phone });
    const filteredItems = filterByFoodType(menuItems, currentState.foodTypePreference || 'both');
    await conversationState.setState(null, { categoryPage: page }, { phone });
    await sendMenuCategories(phone, filteredItems, 'Our Menu', page);
    await conversationState.setState(null, { currentStep: 'select_category' }, { phone });
  }
  // Category list pagination (for ordering)
  else if (selection.startsWith('ordercat_page_')) {
    const page = parseInt(selection.replace('ordercat_page_', ''));
    const currentState = await conversationState.getState(null, { phone });
    const filteredItems = filterByFoodType(menuItems, currentState.foodTypePreference || 'both');
    await conversationState.setState(null, { categoryPage: page }, { phone });
    await sendMenuForOrder(phone, filteredItems, 'Select Items', page);
    await conversationState.setState(null, { currentStep: 'browsing_menu' }, { phone });
  }
  // All items pagination (for browsing)
  else if (selection.startsWith('allitems_page_')) {
    const page = parseInt(selection.replace('allitems_page_', ''));
    const currentState = await conversationState.getState(null, { phone });
    const filteredItems = filterByFoodType(menuItems, currentState.foodTypePreference || 'both');
    await conversationState.setState(null, { currentPage: page, currentStep: 'viewing_items' }, { phone });
    await sendAllItems(phone, filteredItems, page);
  }
};

// Menu for ordering (similar to browse but with "Add to Cart" actions)
const sendMenuForOrder = async (phone, menuItems, label = 'Select Items', page = 0) => {
  // Flatten category arrays and dedupe (category is an array field)
  const categories = [...new Set(menuItems.flatMap(m => Array.isArray(m.category) ? m.category : [m.category]))];
  
  if (!categories.length) {
    await whatsapp.sendButtons(phone, '📋 No items available.', [
      { id: 'add_more', text: 'Other Categories' },
      { id: 'home', text: 'Main Menu' }
    ]);
    return;
  }

  // If 9 or fewer categories (+ All Items = 10), use WhatsApp list without pagination
  if (categories.length <= 9) {
    const rows = [
      { rowId: 'order_cat_all', title: '📋 All Items', description: `${menuItems.length} items - Order anything` }
    ];
    
    categories.forEach(cat => {
      const count = menuItems.filter(m => Array.isArray(m.category) ? m.category.includes(cat) : m.category === cat).length;
      const safeId = cat.replace(/[^a-zA-Z0-9_]/g, '_');
      rows.push({ rowId: `order_cat_${safeId}`, title: cat.substring(0, 24), description: `${count} items available` });
    });

    await whatsapp.sendList(phone, label, 'Select a category to order items', 'Order Categories',
      [{ title: 'Menu Categories', rows }], 'Fresh & Delicious!');
    return;
  }

  // More than 9 categories - use pagination with WhatsApp list
  const CATS_PER_PAGE = 9; // 9 categories + 1 "All Items" = 10 rows max
  const totalPages = Math.ceil(categories.length / CATS_PER_PAGE);
  const startIdx = page * CATS_PER_PAGE;
  const pageCats = categories.slice(startIdx, startIdx + CATS_PER_PAGE);

  // Build rows for the list
  const rows = [];
  
  // Add "All Items" option on first page only
  if (page === 0) {
    rows.push({ rowId: 'order_cat_all', title: '📋 All Items', description: `${menuItems.length} items - Order anything` });
  }
  
  pageCats.forEach(cat => {
    const count = menuItems.filter(m => Array.isArray(m.category) ? m.category.includes(cat) : m.category === cat).length;
    const safeId = cat.replace(/[^a-zA-Z0-9_]/g, '_');
    rows.push({ rowId: `order_cat_${safeId}`, title: cat.substring(0, 24), description: `${count} items available` });
  });

  await whatsapp.sendList(
    phone,
    `📋 ${label}`,
    `Page ${page + 1}/${totalPages} • ${categories.length} categories\nTap to select a category`,
    'Order Categories',
    [{ title: 'Menu Categories', rows }],
    'Select a category'
  );

  // Send navigation buttons
  const buttons = [];
  if (page > 0) buttons.push({ id: `ordercat_page_${page - 1}`, text: 'Previous' });
  if (page < totalPages - 1) buttons.push({ id: `ordercat_page_${page + 1}`, text: 'Next' });
  buttons.push({ id: 'add_more', text: 'Menu' });

  await whatsapp.sendButtons(phone, `Page ${page + 1} of ${totalPages}`, buttons.slice(0, 3));
};

const sendMenuForOrderWithLabel = async (phone, menuItems, label, page = 0) => {
  await sendMenuForOrder(phone, menuItems, label, page);
};

// Send all items for ordering with pagination
const sendAllItemsForOrder = async (phone, menuItems, page = 0) => {
  if (!menuItems.length) {
    await whatsapp.sendButtons(phone, '📋 No items available.', [
      { id: 'add_more', text: 'Other Categories' },
      { id: 'home', text: 'Main Menu' }
    ]);
    return;
  }

  const getFoodTypeIcon = (type) => type === 'veg' ? '🟢' : type === 'nonveg' ? '🔴' : type === 'egg' ? '🟡' : '';
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(menuItems.length / ITEMS_PER_PAGE);
  const startIdx = page * ITEMS_PER_PAGE;
  const pageItems = menuItems.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  // Build rows for the list
  const rows = pageItems.map(item => {
    const ratingStr = item.totalRatings > 0 ? `⭐${item.avgRating}` : '☆';
    const priceDisplay = formatPriceWithOffer(item);
    return {
      rowId: `add_${item._id}`,
      title: `${getFoodTypeIcon(item.foodType)} ${item.name}`.substring(0, 24),
      description: `${ratingStr} • ${priceDisplay} • ${item.quantity || 1} ${item.unit || 'piece'}`.substring(0, 72)
    };
  });

  const sections = [{ title: `All Items (${menuItems.length})`, rows }];

  await whatsapp.sendList(
    phone,
    '📋 All Items',
    `Page ${page + 1}/${totalPages} • ${menuItems.length} items total\nTap an item to add to cart`,
    'Order Items',
    sections,
    'Select an item'
  );

  // Send navigation buttons if multiple pages
  if (totalPages > 1) {
    const buttons = [];
    if (page > 0) buttons.push({ id: `orderitems_page_${page - 1}`, text: 'Previous' });
    if (page < totalPages - 1) buttons.push({ id: `orderitems_page_${page + 1}`, text: 'Next' });
    buttons.push({ id: 'add_more', text: 'Menu' });
    await whatsapp.sendButtons(phone, `Page ${page + 1} of ${totalPages}`, buttons.slice(0, 3));
  }
};

// Handle category selection for ordering
const handleCategorySelectionForOrder = async (phone, menuItems, selection, correlationId = null, messageId = null) => {
  logger.logDomainHandlerEntry('menu', 'handleCategorySelectionForOrder', ['phone', 'menuItems', 'selection'], correlationId, messageId);
  
  try {
    if (selection === 'order_cat_all') {
      // Show all items for ordering (within selected food type)
      const currentState = await conversationState.getState(null, { phone });
      const filteredItems = filterByFoodType(menuItems, currentState.foodTypePreference || 'both');
      
      
      await sendAllItemsForOrder(phone, filteredItems);
      await conversationState.setState(null, { selectedCategory: 'all', currentStep: 'selecting_item' }, { phone });
      
      logger.logDomainHandlerExit('menu', 'handleCategorySelectionForOrder', true, 'selecting_item', correlationId, messageId);
    } else if (selection.startsWith('order_cat_')) {
      const sanitizedCat = selection.replace('order_cat_', '');
      const currentState = await conversationState.getState(null, { phone });
      const preference = currentState.foodTypePreference || 'both';
      const filteredItems = filterByFoodType(menuItems, preference);
      // Find original category name from sanitized ID
      const allCategories = [...new Set(filteredItems.flatMap(m => Array.isArray(m.category) ? m.category : [m.category]))];
      const category = allCategories.find(c => c.replace(/[^a-zA-Z0-9_]/g, '_') === sanitizedCat) || sanitizedCat;
      
      
      await sendCategoryItemsForOrder(phone, filteredItems, category);
      await conversationState.setState(null, { selectedCategory: category, currentStep: 'selecting_item' }, { phone });
      
      logger.logDomainHandlerExit('menu', 'handleCategorySelectionForOrder', true, 'selecting_item', correlationId, messageId);
    }
  } catch (error) {
    logger.logDomainHandlerExit('menu', 'handleCategorySelectionForOrder', false, null, correlationId, messageId);
    logger.logError(error, 'menuHandler', 'domain_handler', null, correlationId, messageId);
    throw error;
  }
};

// Send category items for ordering with pagination
const sendCategoryItemsForOrder = async (phone, menuItems, category, page = 0) => {
  // Filter items that include this category (category is an array field)
  const items = menuItems.filter(m => Array.isArray(m.category) ? m.category.includes(category) : m.category === category);
  
  if (!items.length) {
    await whatsapp.sendButtons(phone, `📋 No items in ${category} right now.`, [
      { id: 'add_more', text: 'Other Categories' },
      { id: 'home', text: 'Main Menu' }
    ]);
    return;
  }

  const getFoodTypeIcon = (type) => type === 'veg' ? '🟢' : type === 'nonveg' ? '🔴' : type === 'egg' ? '🟡' : '';
  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.ceil(items.length / ITEMS_PER_PAGE);
  const startIdx = page * ITEMS_PER_PAGE;
  const pageItems = items.slice(startIdx, startIdx + ITEMS_PER_PAGE);

  // Build rows for the list
  const rows = pageItems.map(item => {
    const ratingStr = item.totalRatings > 0 ? `⭐${item.avgRating}` : '☆';
    const priceDisplay = formatPriceWithOffer(item);
    return {
      rowId: `add_${item._id}`,
      title: `${getFoodTypeIcon(item.foodType)} ${item.name}`.substring(0, 24),
      description: `${ratingStr} • ${priceDisplay} • ${item.quantity || 1} ${item.unit || 'piece'}`.substring(0, 72)
    };
  });

  // Only items in the list, no navigation rows
  const sections = [{ title: `${category} (${items.length} items)`, rows }];

  await whatsapp.sendList(
    phone,
    `📋 ${category}`,
    `Page ${page + 1}/${totalPages} • ${items.length} items total\nTap an item to add to cart`,
    'Order Items',
    sections,
    'Select an item'
  );

  // Send navigation buttons if multiple pages
  if (totalPages > 1) {
    const safeCat = category.replace(/[^a-zA-Z0-9]/g, '_');
    const buttons = [];
    if (page > 0) buttons.push({ id: `ordercatpage_${safeCat}_${page - 1}`, text: 'Previous' });
    if (page < totalPages - 1) buttons.push({ id: `ordercatpage_${safeCat}_${page + 1}`, text: 'Next' });
    buttons.push({ id: 'add_more', text: 'Menu' });
    await whatsapp.sendButtons(phone, `Page ${page + 1} of ${totalPages}`, buttons.slice(0, 3));
  }
};

module.exports = {
  handleFoodTypeSelection,
  handleShowMenuCategories,
  handleFoodTypeSelectionResponse,
  handleCategorySelection,
  handleMenuPagination,
  handleCategorySelectionForOrder,
  sendMenuCategories,
  sendMenuCategoriesWithLabel,
  sendCategoryItems,
  sendAllItems,
  sendMenuForOrder,
  sendMenuForOrderWithLabel,
  sendAllItemsForOrder,
  sendCategoryItemsForOrder,
  filterByFoodType
};

// PHASE 3 STEP 3.4.1 COMPLETE WHEN:
// [ ] All menu browsing logic moved to menuHandler
// [ ] chatbot.js delegates menu logic only
// [ ] No cart/order/payment logic moved
// [ ] State access still via conversationState
// [ ] WhatsApp behavior unchanged
// [ ] Phase 1 & Phase 2 invariants preserved
// [ ] Reverting restores inline menu logic
