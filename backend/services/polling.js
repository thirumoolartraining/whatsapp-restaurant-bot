// Polling service for Green API (alternative to webhooks)
// This polls for new messages every few seconds

const axios = require('axios');
const messageProcessor = require('./messageProcessor');
const Logger = require('./logger');

const logger = new Logger('polling');

let isPolling = false;
let pollInterval = null;

const getConfig = () => ({
  instanceId: process.env.GREEN_API_INSTANCE_ID,
  token: process.env.GREEN_API_TOKEN,
  baseUrl: `https://api.green-api.com/waInstance${process.env.GREEN_API_INSTANCE_ID}`
});

const polling = {
  async receiveNotification() {
    try {
      const { baseUrl, token } = getConfig();
      const response = await axios.get(`${baseUrl}/receiveNotification/${token}`, {
        timeout: 10000
      });
      return response.data;
    } catch (error) {
      if (error.code !== 'ECONNABORTED') {
        logger.error('polling_error', {
          errorCategory: 'provider',
          origin: 'polling',
          finality: 'retryable',
          errorMessage: error.message
        });
      }
      return null;
    }
  },

  async deleteNotification(receiptId) {
    try {
      const { baseUrl, token } = getConfig();
      await axios.delete(`${baseUrl}/deleteNotification/${token}/${receiptId}`);
    } catch (error) {
      logger.error('delete_notification_failed', {
        errorCategory: 'provider',
        origin: 'polling',
        finality: 'retryable',
        receiptId,
        errorMessage: error.message
      });
    }
  },

  async processNotification(notification) {
    if (!notification || !notification.body) return;

    const { typeWebhook, senderData, messageData } = notification.body;

    if (typeWebhook === 'incomingMessageReceived') {
      const phone = senderData?.sender?.replace('@c.us', '') || '';
      let message = '';
      let messageType = 'text';
      let selectedId = null;

      if (messageData?.typeMessage === 'textMessage') {
        message = messageData.textMessageData?.textMessage || '';
      } else if (messageData?.typeMessage === 'extendedTextMessage') {
        message = messageData.extendedTextMessageData?.text || '';
      } else if (messageData?.typeMessage === 'buttonsResponseMessage') {
        selectedId = messageData.buttonsResponseMessage?.selectedButtonId || '';
        message = messageData.buttonsResponseMessage?.selectedButtonText || '';
        messageType = 'button';
      } else if (messageData?.typeMessage === 'listResponseMessage') {
        selectedId = messageData.listResponseMessage?.singleSelectReply?.selectedRowId || '';
        message = messageData.listResponseMessage?.title || '';
        messageType = 'list';
      }

      if (phone && (message || selectedId)) {
        await messageProcessor.processInboundMessage({
          provider: 'meta',
          payload: {
            phone,
            text: message,
            messageType,
            selectedId,
            senderName: null
          },
          reqId: `poll_${Date.now()}_${phone}`
        });
        logger.info('polling_message_handled', {
          level: 'info',
          component: 'polling',
          event: 'polling_message_handled',
          timestamp: new Date().toISOString(),
          context: { phone }
        });
      }
    }
  },

  async poll() {
    if (isPolling) return;
    isPolling = true;

    try {
      const notification = await this.receiveNotification();
      
      if (notification && notification.receiptId) {
        logger.info('notification_received', {
          level: 'info',
          component: 'polling',
          event: 'notification_received',
          timestamp: new Date().toISOString(),
          context: { type: notification.body?.typeWebhook }
        });
        await this.processNotification(notification);
        await this.deleteNotification(notification.receiptId);
      }
    } catch (error) {
      logger.error('poll_cycle_error', {
        errorCategory: 'unknown',
        origin: 'polling',
        finality: 'retryable',
        errorMessage: error.message
      });
    } finally {
      isPolling = false;
    }
  },

  start(intervalMs = 3000) {
    logger.info('polling_service_starting', {
      level: 'info',
      component: 'polling',
      event: 'polling_service_starting',
      timestamp: new Date().toISOString(),
      context: {}
    });
    
    // Clear webhook URL to enable polling
    this.clearWebhook().then(() => {
      // Start polling loop
      pollInterval = setInterval(() => this.poll(), intervalMs);
      logger.info('polling_service_active', {
        level: 'info',
        component: 'polling',
        event: 'polling_service_active',
        timestamp: new Date().toISOString(),
        context: { intervalMs }
      });
    });
  },

  stop() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
      logger.info('polling_service_stopped', {
        level: 'info',
        component: 'polling',
        event: 'polling_service_stopped',
        timestamp: new Date().toISOString(),
        context: {}
      });
    }
  },

  async clearWebhook() {
    try {
      const { baseUrl, token } = getConfig();
      await axios.post(`${baseUrl}/setSettings/${token}`, {
        webhookUrl: '',
        incomingWebhook: 'no'
      });
      logger.info('webhook_cleared_for_polling', {
        level: 'info',
        component: 'polling',
        event: 'webhook_cleared_for_polling',
        timestamp: new Date().toISOString(),
        context: {}
      });
      // Wait for settings to apply
      await new Promise(resolve => setTimeout(resolve, 2000));
    } catch (error) {
      logger.error('webhook_clear_error', {
        errorCategory: 'provider',
        origin: 'green_api',
        finality: 'retryable',
        errorMessage: error.message
      });
    }
  }
};

module.exports = polling;
