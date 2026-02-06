const express = require('express');
const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const cloudinaryService = require('../services/cloudinary');
const dataEvents = require('../services/eventEmitter');
const multer = require('multer');
const Logger = require('../services/logger');
const router = express.Router();

const logger = new Logger('category');

// Configure multer for memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

// Get all categories
router.get('/', async (req, res) => {
  try {
    const categories = await Category.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
    res.json(categories);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Create category
router.post('/', authenticate, authorize(['admin']), upload.single('image'), async (req, res) => {
  try {
    const { name, description, image } = req.body;
    
    // Trim whitespace from name
    const trimmedName = name ? name.trim() : '';
    if (!trimmedName) {
      return res.status(400).json({ error: 'Category name is required' });
    }
    
    // Check for exact match (case-insensitive) - not partial match
    const existing = await Category.findOne({ name: { $regex: new RegExp(`^${trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ error: 'Category already exists' });
    }
    
    let imageUrl = image || null;
    
    // If file uploaded, upload to Cloudinary
    if (req.file) {
      imageUrl = await cloudinaryService.uploadFromBuffer(req.file.buffer, 'restaurant-bot/categories');
    }
    
    const category = new Category({ name: trimmedName, description: description ? description.trim() : '', image: imageUrl });
    await category.save();
    
    // Emit event for real-time updates
    dataEvents.emit('menu');
    
    res.status(201).json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update category
router.put('/:id', authenticate, authorize(['admin']), upload.single('image'), async (req, res) => {
  try {
    const { name, description, image, isActive, isPaused, sortOrder, removeImage } = req.body;
    
    // Trim whitespace from name
    const trimmedName = name ? name.trim() : '';
    const trimmedDescription = description ? description.trim() : '';
    
    // Get existing category to check for old image
    const existingCategory = await Category.findById(req.params.id);
    let imageUrl = existingCategory?.image || null;
    
    // If removeImage flag is set, clear the image
    if (removeImage === 'true' || removeImage === true) {
      if (existingCategory?.image && existingCategory.image.includes('cloudinary.com')) {
        try {
          const publicId = cloudinaryService.extractPublicId(existingCategory.image);
          if (publicId) await cloudinaryService.deleteImage(publicId);
        } catch (e) {
          logger.error('old_category_image_deletion_failed', {
            errorCategory: 'provider',
            origin: 'category',
            finality: 'retryable',
            errorMessage: e.message
          });
        }
      }
    // If new file uploaded, upload to Cloudinary
    else if (req.file) {
      if (existingCategory?.image && existingCategory.image.includes('cloudinary.com')) {
        try {
          const publicId = cloudinaryService.extractPublicId(existingCategory.image);
          if (publicId) await cloudinaryService.deleteImage(publicId);
        } catch (e) {
          logger.error('old_category_image_deletion_failed', {
            errorCategory: 'provider',
            origin: 'category',
            finality: 'retryable',
            errorMessage: e.message
          });
        }
        imageUrl = await cloudinaryService.uploadFromBuffer(req.file.buffer, 'restaurant-bot/categories');
      }
    // If image URL provided (for backward compatibility)
    else if (image && image !== existingCategory?.image) {
      imageUrl = image;
    }
    
    const category = await Category.findByIdAndUpdate(
      req.params.id,
      { name: trimmedName || existingCategory?.name, description: trimmedDescription, image: imageUrl, isActive, isPaused, sortOrder },
      { new: true }
    );
    
    // Emit event for real-time updates
    dataEvents.emit('menu');
    
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Toggle pause status
router.patch('/:id/toggle-pause', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    category.isPaused = !category.isPaused;
    await category.save();
    
    // Emit event for real-time updates
    dataEvents.emit('menu');
    
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update category schedule
router.patch('/:id/schedule', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { enabled, type, startTime, endTime, days, customDays } = req.body;
    
    
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }


    // Update schedule
    category.schedule = {
      enabled: enabled || false,
      type: type || 'daily',
      startTime: startTime || null,
      endTime: endTime || null,
      days: days || [],
      customDays: customDays || [], // Custom times per day
      timezone: 'Asia/Kolkata'
    };

    await category.save();

    // Immediately check if category should be paused based on new schedule
    if (enabled) {
      const categoryScheduler = require('../services/categoryScheduler');
      
      try {
        await categoryScheduler.updateCategoryStatus(category._id);
        } catch (schedulerError) {
        logger.error('category_scheduler_failed', {
          errorCategory: 'provider',
          origin: 'category',
          finality: 'retryable',
          categoryId: category._id,
          errorMessage: schedulerError.message
        });
      }
      
      // Fetch fresh data after scheduler update
      const updatedCategory = await Category.findById(category._id);
      
      // Emit event for real-time updates
      dataEvents.emit('menu');
      
      return res.json(updatedCategory);
    } else {
      // Schedule disabled - unpause category and make all items available
      
      category.isPaused = false;
      await category.save();
      
      // Make all items in this category available
      const MenuItem = require('../models/MenuItem');
      const updateResult = await MenuItem.updateMany(
        { category: category.name, available: false },
        { $set: { available: true } }
      );
      
      if (updateResult.modifiedCount > 0) {
      }
      
      // Fetch fresh data
      const updatedCategory = await Category.findById(category._id);
      
      // Emit event for real-time updates
      dataEvents.emit('menu');
      
      return res.json(updatedCategory);
    }
  } catch (error) {
    logger.error('category_schedule_update_failed', {
      errorCategory: 'domain',
      origin: 'category',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Toggle sold out status for category
// When sold out: marks all items in this category as out of stock
// When resumed: marks all items in this category as available
router.patch('/:id/toggle-soldout', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    category.isSoldOut = !category.isSoldOut;
    
    // Clear sold out schedule when manually toggling
    if (category.soldOutSchedule) {
      category.soldOutSchedule.enabled = false;
      category.soldOutSchedule.endTime = null;
    }
    
    await category.save();
    
    // Update all items in this category
    if (category.isSoldOut) {
      // Mark all items in this category as out of stock
      const result = await MenuItem.updateMany(
        { category: category.name },
        { $set: { available: false } }
      );
      
    } else {
      // Mark all items in this category as available
      const result = await MenuItem.updateMany(
        { category: category.name },
        { $set: { available: true } }
      );
      
    }
    
    // Emit event for real-time updates
    dataEvents.emit('menu');
    
    res.json(category);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Schedule sold out for category (temporary sold out until specific time)
// When sold out: marks all items in this category as out of stock
// When schedule expires: scheduler will mark items as available again
router.patch('/:id/schedule-soldout', authenticate, authorize(['admin']), async (req, res) => {
  try {
    const { enabled, endTime } = req.body;
    
    
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }
    
    // Update sold out schedule
    category.soldOutSchedule = {
      enabled: enabled || false,
      endTime: endTime || null,
      timezone: 'Asia/Kolkata'
    };
    
    // If scheduling sold out, mark category as sold out and items as unavailable
    if (enabled && endTime) {
      category.isSoldOut = true;
      
      // Mark all items in this category as out of stock
      const result = await MenuItem.updateMany(
        { category: category.name },
        { $set: { available: false } }
      );
    
    await category.save();
    
    // Emit event for real-time updates
    dataEvents.emit('menu');
    
    res.json(category);
  } catch (error) {
    logger.error('category_soldout_schedule_failed', {
      errorCategory: 'domain',
      origin: 'category',
      finality: 'terminal',
      errorMessage: error.message
    });
    res.status(500).json({ error: error.message });
  }
});

// Delete category
router.delete('/:id', authenticate, authorize(['admin']), async (req, res) => {
  try {
    // Get the category before deleting
    const category = await Category.findById(req.params.id);
    if (!category) {
      return res.status(404).json({ error: 'Category not found' });
    }

    const categoryName = category.name;
    
    // Delete category image from Cloudinary if exists
    if (category.image && category.image.includes('cloudinary.com')) {
      try {
        const publicId = cloudinaryService.extractPublicId(category.image);
        if (publicId) await cloudinaryService.deleteImage(publicId);
      } catch (e) {
        logger.error('category_image_deletion_failed', {
          errorCategory: 'provider',
          origin: 'category',
          finality: 'retryable',
          errorMessage: e.message
        });
      }
    }

    // Find all menu items that have this category
    const itemsWithCategory = await MenuItem.find({ category: categoryName });

    let deletedItemsCount = 0;
    let updatedItemsCount = 0;

    for (const item of itemsWithCategory) {
      if (item.category.length === 1) {
        // Item only has this category, delete it
        // Also delete item image from Cloudinary
        if (item.image && item.image.includes('cloudinary.com')) {
          try {
            const publicId = cloudinaryService.extractPublicId(item.image);
            if (publicId) await cloudinaryService.deleteImage(publicId);
          } catch (e) {
            logger.error('menu_item_image_deletion_failed', {
              errorCategory: 'provider',
              origin: 'category',
              finality: 'retryable',
              errorMessage: e.message
            });
          }
        }
        await MenuItem.findByIdAndDelete(item._id);
        deletedItemsCount++;
      } else {
        // Item has multiple categories, remove this category from the array
        await MenuItem.findByIdAndUpdate(item._id, {
          $pull: { category: categoryName },
        });
        updatedItemsCount++;
      }
    }

    // Delete the category
    await Category.findByIdAndDelete(req.params.id);

    // Emit event for real-time updates
    dataEvents.emit('menu');

    res.json({
      success: true,
      message: `Category deleted. ${deletedItemsCount} items deleted, ${updatedItemsCount} items updated.`,
      deletedItems: deletedItemsCount,
      updatedItems: updatedItemsCount,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
