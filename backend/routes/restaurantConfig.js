const express = require('express');
const router = express.Router();
const RestaurantConfig = require('../models/RestaurantConfig');
const authMiddleware = require('../middleware/auth');
const Logger = require('../services/logger');

const logger = new Logger('restaurantConfigRoutes');

// Get restaurant configuration
router.get('/config/:restaurantId', authMiddleware, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const config = await RestaurantConfig.getConfig(restaurantId);
    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('get_restaurant_config_failed', {
      errorCategory: 'application',
      origin: 'restaurant_config_routes',
      finality: 'terminal',
      restaurantId: req.params.restaurantId,
      userId: req.user?.id,
      errorMessage: error.message
    });
    res.status(404).json({ success: false, error: error.message });
  }
});

// Set fallback user ID for restaurant
router.put('/config/:restaurantId/fallback-user', authMiddleware, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const { fallbackUserId } = req.body;

    if (!fallbackUserId || fallbackUserId.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'fallbackUserId is required and cannot be empty' 
      });
    }

    const config = await RestaurantConfig.setFallbackUserId(
      restaurantId, 
      fallbackUserId.trim(), 
      req.user?.id
    );

    logger.info('fallback_user_updated', {
      restaurantId,
      fallbackUserId: config.fallbackUserId,
      updatedBy: req.user?.id
    });

    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('set_fallback_user_failed', {
      errorCategory: 'application',
      origin: 'restaurant_config_routes',
      finality: 'terminal',
      restaurantId: req.params.restaurantId,
      userId: req.user?.id,
      errorMessage: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

// Create or update restaurant configuration
router.put('/config/:restaurantId', authMiddleware, async (req, res) => {
  try {
    const { restaurantId } = req.params;
    const configData = req.body;

    // Validate required fields
    if (!configData.fallbackUserId || configData.fallbackUserId.trim().length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'fallbackUserId is required and cannot be empty' 
      });
    }

    const config = await RestaurantConfig.findOneAndUpdate(
      { restaurantId },
      { 
        ...configData,
        restaurantId,
        updatedAt: Date.now(),
        updatedBy: req.user?.id
      },
      { upsert: true, new: true }
    );

    logger.info('restaurant_config_updated', {
      restaurantId,
      updatedBy: req.user?.id
    });

    res.json({ success: true, data: config });
  } catch (error) {
    logger.error('update_restaurant_config_failed', {
      errorCategory: 'application',
      origin: 'restaurant_config_routes',
      finality: 'terminal',
      restaurantId: req.params.restaurantId,
      userId: req.user?.id,
      errorMessage: error.message
    });
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router;
