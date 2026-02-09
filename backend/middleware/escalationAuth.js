const RestaurantConfig = require('../models/RestaurantConfig');
const Logger = require('../services/logger');

const logger = new Logger('escalationAuth');

/**
 * Middleware to ensure only authorized users can modify escalated orders
 * - Owner/fallback user can always modify escalated orders
 * - Regular staff cannot modify escalated orders (only owner can resolve)
 */
const escalationAuth = async (req, res, next) => {
  try {
    const orderId = req.params.id;
    const userId = req.user?.id;
    const userRole = req.user?.role;

    // Skip check for non-escalated orders or if no user
    if (!orderId || !userId) {
      return next();
    }

    // Get the order to check escalation level
    const Order = require('../models/Order');
    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    // If order is not escalated, allow normal flow
    if (order.escalationLevel !== 'escalated') {
      return next();
    }

    // For escalated orders, check if user is authorized
    let isAuthorized = false;

    // 1. Check if user is the fallback user for this restaurant
    try {
      const restaurantId = order.restaurantId || 'default';
      const fallbackUserId = await RestaurantConfig.getFallbackUserId(restaurantId);
      if (fallbackUserId === userId) {
        isAuthorized = true;
      }
    } catch (error) {
      logger.warn('fallback_user_check_failed', {
        orderId: order.orderId,
        userId,
        error: error.message
      });
    }

    // 2. Check if user has admin/owner role (fallback for super admins)
    if (!isAuthorized && (userRole === 'admin' || userRole === 'owner')) {
      isAuthorized = true;
    }

    // 3. If user is the one who received the escalation
    if (!isAuthorized && order.escalatedToUserId === userId) {
      isAuthorized = true;
    }

    if (!isAuthorized) {
      logger.warn('unauthorized_escalated_order_access', {
        orderId: order.orderId,
        userId,
        userRole,
        escalationLevel: order.escalationLevel,
        escalatedToUserId: order.escalatedToUserId,
        action: req.method,
        path: req.path
      });

      return res.status(403).json({ 
        error: 'This order has been escalated to owner/manager due to staff non-response. Only authorized personnel can modify escalated orders.',
        code: 'ESCALATED_ORDER_ACCESS_DENIED'
      });
    }

    // User is authorized - proceed
    next();

  } catch (error) {
    logger.error('escalation_auth_check_failed', {
      errorCategory: 'application',
      origin: 'escalation_auth',
      finality: 'terminal',
      orderId: req.params.id,
      userId: req.user?.id,
      errorMessage: error.message
    });

    return res.status(500).json({ error: 'Authorization check failed' });
  }
};

module.exports = escalationAuth;
