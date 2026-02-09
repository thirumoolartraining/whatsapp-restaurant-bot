const Order = require('../models/Order');
const RestaurantConfig = require('../models/RestaurantConfig');
const Logger = require('./logger');

const logger = new Logger('acceptanceWatchdog');

const ACCEPTANCE_WINDOW_MINUTES = 3;
const GRACE_WINDOW_MINUTES = 1;
const CHECK_INTERVAL_SECONDS = 15;

const acceptanceWatchdog = {
  // Check orders for acceptance deadline expiry and handle escalation
  async checkAcceptanceDeadlines() {
    try {
      const now = new Date();
      
      // Find orders that are confirmed and paid but not yet accepted
      // Only include orders with escalation levels none or critical
      const pendingOrders = await Order.find({
        status: 'confirmed',
        paymentStatus: 'paid',
        escalationLevel: { $in: ['none', 'critical'] },
        acceptanceStartedAt: { $exists: true, $ne: null },
        acceptanceDeadline: { $exists: true, $ne: null }
      });

      let criticalCount = 0;
      let escalatedCount = 0;

      for (const order of pendingOrders) {
        // Skip if order is no longer in confirmed status (admin might have accepted)
        if (order.status !== 'confirmed') {
          continue;
        }

        // Handle escalation from none to critical
        if (order.escalationLevel === 'none' && now >= order.acceptanceDeadline) {
          await this.escalateToCritical(order);
          criticalCount++;
        }
        // Handle escalation from critical to escalated
        else if (order.escalationLevel === 'critical') {
          const criticalDeadline = new Date(order.acceptanceDeadline.getTime() + GRACE_WINDOW_MINUTES * 60 * 1000);
          if (now >= criticalDeadline) {
            await this.escalateToEscalated(order);
            escalatedCount++;
          }
        }
      }

      if (criticalCount > 0 || escalatedCount > 0) {
        logger.info('acceptance_escalation_processed', {
          criticalCount,
          escalatedCount,
          timestamp: now
        });
      }

      return { criticalCount, escalatedCount };
    } catch (error) {
      logger.error('acceptance_deadline_check_failed', {
        errorCategory: 'domain',
        origin: 'acceptance_watchdog',
        finality: 'retryable',
        errorMessage: error.message
      });
      return { criticalCount: 0, escalatedCount: 0 };
    }
  },

  // Escalate order from none to critical
  async escalateToCritical(order) {
    try {
      const now = new Date();
      const delaySeconds = Math.floor((now - order.acceptanceDeadline) / 1000);

      // Update order escalation level
      order.escalationLevel = 'critical';
      order.criticalAlertAt = now;
      await order.save();

      // Emit structured event
      const dataEvents = require('./eventEmitter');
      dataEvents.emit('ORDER_ACCEPTANCE_CRITICAL', {
        orderId: order.orderId,
        restaurantId: order.restaurantId || null,
        acceptanceStartedAt: order.acceptanceStartedAt,
        acceptanceDeadline: order.acceptanceDeadline,
        escalationLevel: order.escalationLevel,
        criticalAlertAt: order.criticalAlertAt,
        delaySeconds
      });

      logger.info('order_escalated_to_critical', {
        orderId: order.orderId,
        acceptanceStartedAt: order.acceptanceStartedAt,
        acceptanceDeadline: order.acceptanceDeadline,
        criticalAlertAt: order.criticalAlertAt,
        delaySeconds
      });

      return true;
    } catch (error) {
      logger.error('order_critical_escalation_failed', {
        errorCategory: 'domain',
        origin: 'acceptance_watchdog',
        finality: 'retryable',
        orderId: order.orderId,
        errorMessage: error.message
      });
      return false;
    }
  },

  // Escalate order from critical to escalated
  async escalateToEscalated(order) {
    try {
      const now = new Date();
      const criticalDeadline = new Date(order.acceptanceDeadline.getTime() + GRACE_WINDOW_MINUTES * 60 * 1000);
      const delaySeconds = Math.floor((now - criticalDeadline) / 1000);

      // Resolve fallback user ID for escalation routing
      let fallbackUserId;
      try {
        // Use default restaurant ID if not specified
        const restaurantId = order.restaurantId || 'default';
        fallbackUserId = await RestaurantConfig.getFallbackUserId(restaurantId);
      } catch (error) {
        logger.error('fallback_user_resolution_failed', {
          errorCategory: 'domain',
          origin: 'acceptance_watchdog',
          finality: 'retryable',
          orderId: order.orderId,
          restaurantId: order.restaurantId,
          errorMessage: error.message
        });
        return false;
      }

      // Update order escalation level and routing information
      order.escalationLevel = 'escalated';
      order.escalatedToUserId = fallbackUserId;
      order.escalatedAt = now;
      await order.save();

      // Emit structured event for owner routing
      const dataEvents = require('./eventEmitter');
      dataEvents.emit('ORDER_ACCEPTANCE_ESCALATED', {
        orderId: order.orderId,
        restaurantId: order.restaurantId || null,
        acceptanceStartedAt: order.acceptanceStartedAt,
        acceptanceDeadline: order.acceptanceDeadline,
        criticalAlertAt: order.criticalAlertAt,
        escalationLevel: order.escalationLevel,
        escalatedToUserId: order.escalatedToUserId,
        escalatedAt: order.escalatedAt,
        delaySeconds
      });

      // Emit owner-targeted escalation event
      dataEvents.emit('OWNER_ESCALATION_ALERT', {
        orderId: order.orderId,
        restaurantId: order.restaurantId || null,
        targetUserId: fallbackUserId,
        escalatedAt: order.escalatedAt,
        message: 'ESCALATED — STAFF DID NOT RESPOND',
        urgency: 'high'
      });

      logger.info('order_escalated_to_owner', {
        orderId: order.orderId,
        restaurantId: order.restaurantId,
        escalatedToUserId: order.escalatedToUserId,
        escalatedAt: order.escalatedAt,
        acceptanceStartedAt: order.acceptanceStartedAt,
        acceptanceDeadline: order.acceptanceDeadline,
        criticalAlertAt: order.criticalAlertAt,
        delaySeconds
      });

      return true;
    } catch (error) {
      logger.error('order_escalated_escalation_failed', {
        errorCategory: 'domain',
        origin: 'acceptance_watchdog',
        finality: 'retryable',
        orderId: order.orderId,
        errorMessage: error.message
      });
      return false;
    }
  },

  // Start the acceptance watchdog (runs every 15 seconds)
  start() {
    logger.info('acceptance_watchdog_starting', {
      checkInterval: CHECK_INTERVAL_SECONDS,
      acceptanceWindow: ACCEPTANCE_WINDOW_MINUTES,
      graceWindow: GRACE_WINDOW_MINUTES
    });

    // Run immediately on start
    this.checkAcceptanceDeadlines();

    // Then run every 15 seconds
    setInterval(() => {
      this.checkAcceptanceDeadlines();
    }, CHECK_INTERVAL_SECONDS * 1000);
  }
};

module.exports = acceptanceWatchdog;
