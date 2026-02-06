const Category = require('../models/Category');
const MenuItem = require('../models/MenuItem');
const cron = require('node-cron');
const Logger = require('./logger');

const logger = new Logger('categoryScheduler');

class CategoryScheduler {
  constructor() {
    this.jobs = new Map();
  }

  // Get current time in specified timezone
  getCurrentTimeInTimezone(timezone = 'Asia/Kolkata') {
    const now = new Date();
    // Get time string in the specified timezone
    const options = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      weekday: 'short'
    };
    
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);
    
    let hours = 0;
    let minutes = 0;
    let weekday = '';
    
    for (const part of parts) {
      if (part.type === 'hour') hours = parseInt(part.value);
      if (part.type === 'minute') minutes = parseInt(part.value);
      if (part.type === 'weekday') weekday = part.value;
    }
    
    // Map weekday to day number (0=Sunday, 1=Monday, etc.)
    const dayMap = { 'Sun': 0, 'Mon': 1, 'Tue': 2, 'Wed': 3, 'Thu': 4, 'Fri': 5, 'Sat': 6 };
    const dayNumber = dayMap[weekday] ?? new Date().getDay();
    
    return { hours, minutes, dayNumber };
  }

  // Check if current time is within schedule
  isWithinSchedule(schedule) {
    if (!schedule || !schedule.enabled) {
      return true; // No schedule means always available
    }

    // Use timezone from schedule, default to Asia/Kolkata
    const timezone = schedule.timezone || 'Asia/Kolkata';
    const { hours: currentHours, minutes: currentMins, dayNumber: currentDay } = this.getCurrentTimeInTimezone(timezone);
    const currentTime = `${currentHours.toString().padStart(2, '0')}:${currentMins.toString().padStart(2, '0')}`;
    
    let startTime, endTime;
    
    // Check for custom days with individual times
    if (schedule.type === 'custom' && schedule.customDays && schedule.customDays.length > 0) {
      // Find today's schedule
      const todaySchedule = schedule.customDays.find(d => d.day === currentDay);
      
      if (!todaySchedule || !todaySchedule.enabled) {
        return false; // Not scheduled for today or day is disabled
      }
      
      startTime = todaySchedule.startTime;
      endTime = todaySchedule.endTime;
    }
    // Backward compatibility: custom type with days array (same time for all days)
    else if (schedule.type === 'custom' && schedule.days && schedule.days.length > 0) {
      if (!schedule.days.includes(currentDay)) {
        return false; // Not scheduled for today
      }
      startTime = schedule.startTime;
      endTime = schedule.endTime;
    }
    // Daily schedule (same time every day)
    else {
      if (!schedule.startTime || !schedule.endTime) {
        return true; // No time set means always available
      }
      startTime = schedule.startTime;
      endTime = schedule.endTime;
    }

    // Parse time strings (HH:MM format)
    const [startHour, startMin] = startTime.split(':').map(Number);
    const [endHour, endMin] = endTime.split(':').map(Number);

    const currentMinutes = currentHours * 60 + currentMins;
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;

    // Handle overnight schedules (e.g., 22:00 to 02:00)
    if (endMinutes < startMinutes) {
      const isWithin = currentMinutes >= startMinutes || currentMinutes < endMinutes;
      return isWithin;
    }

    // Normal schedule (e.g., 08:00 to 22:00)
    // Use < for end time so that at exactly end time, it's considered outside
    const isWithin = currentMinutes >= startMinutes && currentMinutes < endMinutes;
    return isWithin;
  }

  // Update category pause status based on schedule
  async updateCategoryStatus(categoryId) {
    try {
      const category = await Category.findById(categoryId);
      if (!category) {
        return;
      }

      if (!category.schedule || !category.schedule.enabled) {
        return;
      }

      const shouldBeActive = this.isWithinSchedule(category.schedule);
      const shouldBePaused = !shouldBeActive;

      // Only update if status needs to change
      // When within schedule, category should NOT be paused (isPaused = false)
      // When outside schedule, category should be paused (isPaused = true)
      // NOTE: Scheduled categories only set isPaused, NOT isSoldOut (sold out is separate manual action)
      if (category.isPaused !== shouldBePaused) {
        const oldStatus = category.isPaused ? 'PAUSED' : 'ACTIVE';
        const newStatus = shouldBePaused ? 'PAUSED' : 'ACTIVE';
        
        category.isPaused = shouldBePaused;
        // Do NOT set isSoldOut - that's for manual sold out action only
        await category.save();
        
        logger.info('category_status_changed', {
          component: 'category_scheduler',
          event: 'category_status_changed',
          categoryName: category.name,
          oldStatus,
          newStatus,
          reason: shouldBePaused ? 'outside_schedule' : 'within_schedule'
        });
        
        // When category RESUMES (becomes active), make all items in this category available
        if (!shouldBePaused) {
          const updateResult = await MenuItem.updateMany(
            { category: category.name, available: false },
            { $set: { available: true } }
          );
          if (updateResult.modifiedCount > 0) {
            logger.info('items_made_available', {
              component: 'category_scheduler',
              event: 'items_made_available',
              categoryName: category.name,
              count: updateResult.modifiedCount
            });
          }
        }
      }
    } catch (error) {
      logger.error('category_status_update_failed', {
        errorCategory: 'domain',
        origin: 'category_scheduler',
        finality: 'retryable',
        categoryId,
        errorMessage: error.message
      });
    }
  }

  // Check if sold out schedule has expired
  isSoldOutExpired(soldOutSchedule) {
    if (!soldOutSchedule || !soldOutSchedule.enabled || !soldOutSchedule.endTime) {
      return false;
    }

    const timezone = soldOutSchedule.timezone || 'Asia/Kolkata';
    const { hours: currentHours, minutes: currentMins } = this.getCurrentTimeInTimezone(timezone);
    
    const [endHour, endMin] = soldOutSchedule.endTime.split(':').map(Number);
    
    const currentMinutes = currentHours * 60 + currentMins;
    const endMinutes = endHour * 60 + endMin;
    
    // Check if current time has passed the end time
    return currentMinutes >= endMinutes;
  }

  // Update sold out status based on schedule
  async updateSoldOutStatus(categoryId) {
    try {
      const category = await Category.findById(categoryId);
      if (!category) {
        return;
      }

      if (!category.soldOutSchedule || !category.soldOutSchedule.enabled) {
        return;
      }

      const isExpired = this.isSoldOutExpired(category.soldOutSchedule);
      
      if (isExpired) {
        category.isSoldOut = false;
        category.soldOutSchedule.enabled = false;
        await category.save();
        
        logger.info('sold_out_expired', {
          component: 'category_scheduler',
          event: 'sold_out_expired',
          categoryName: category.name
        });
        
        // Make all items available again
        const updateResult = await MenuItem.updateMany(
          { category: category.name, available: false },
          { $set: { available: true } }
        );
        
        if (updateResult.modifiedCount > 0) {
          logger.info('items_made_available_after_sold_out', {
            component: 'category_scheduler',
            event: 'items_made_available_after_sold_out',
            categoryName: category.name,
            count: updateResult.modifiedCount
          });
        }
      }
    } catch (error) {
      logger.error('sold_out_status_update_failed', {
        errorCategory: 'domain',
        origin: 'category_scheduler',
        finality: 'retryable',
        categoryId,
        errorMessage: error.message
      });
    }
  }

  // Check all categories with schedules
  async checkAllSchedules() {
    try {
      // Use Asia/Kolkata timezone for logging
      const { hours, minutes, dayNumber } = this.getCurrentTimeInTimezone('Asia/Kolkata');
      const currentTime = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
      const currentDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dayNumber];
      
      logger.info('running_check', {
        component: 'category_scheduler',
        event: 'running_check',
        time: currentTime,
        day: currentDay
      });
      
      // Check availability schedules
      const categoriesWithSchedule = await Category.find({ 'schedule.enabled': true });
      
      if (categoriesWithSchedule.length > 0) {
        logger.info('found_categories_with_schedules', {
          component: 'category_scheduler',
          event: 'found_categories_with_schedules',
          count: categoriesWithSchedule.length
        });
        for (const category of categoriesWithSchedule) {
          await this.updateCategoryStatus(category._id);
        }
      }
      
      // Check sold out schedules
      const categoriesWithSoldOut = await Category.find({ 'soldOutSchedule.enabled': true });
      
      if (categoriesWithSoldOut.length > 0) {
        logger.info('found_categories_with_sold_out', {
          component: 'category_scheduler',
          event: 'found_categories_with_sold_out',
          count: categoriesWithSoldOut.length
        });
        for (const category of categoriesWithSoldOut) {
          await this.updateSoldOutStatus(category._id);
        }
      }
      
      if (categoriesWithSchedule.length === 0 && categoriesWithSoldOut.length === 0) {
        logger.info('no_categories_with_schedules', {
          component: 'category_scheduler',
          event: 'no_categories_with_schedules'
        });
      }
    } catch (error) {
      logger.error('checking_schedules_failed', {
        errorCategory: 'domain',
        origin: 'category_scheduler',
        finality: 'retryable',
        errorMessage: error.message
      });
    }
  }

  // Start the scheduler
  start() {
    // Run immediately on start
    this.checkAllSchedules();

    // Schedule to run every minute
    this.job = cron.schedule('* * * * *', () => {
      this.checkAllSchedules();
    });

    logger.info('scheduler_started', {
      component: 'category_scheduler',
      event: 'scheduler_started'
    });
  }

  // Stop the scheduler
  stop() {
    if (this.job) {
      this.job.stop();
      logger.info('scheduler_stopped', {
        component: 'category_scheduler',
        event: 'scheduler_stopped'
      });
    }
  }
}

// Export singleton instance
const categoryScheduler = new CategoryScheduler();
module.exports = categoryScheduler;
