const axios = require('axios');
const cloudinaryService = require('./cloudinary');
const Logger = require('./logger');

const logger = new Logger('metaCloud');

const getConfig = () => ({
  phoneNumberId: process.env.META_PHONE_NUMBER_ID,
  accessToken: process.env.META_ACCESS_TOKEN,
  businessId: process.env.META_BUSINESS_ID,
  apiVersion: 'v24.0',
  baseUrl: `https://graph.facebook.com/v24.0/${process.env.META_PHONE_NUMBER_ID}`
});

// Transform image URL using Cloudinary for high-quality WhatsApp images
// Menu item images use 1:1 ratio (300x300), chatbot banner images are already optimized
const getSquareImageUrl = (imageUrl) => {
  if (!imageUrl) return imageUrl;
  
  // Skip data URLs
  if (imageUrl.startsWith('data:')) return imageUrl;
  
  // Skip already optimized Cloudinary URLs (chatbot images from admin panel)
  if (imageUrl.includes('cloudinary.com') && imageUrl.includes('restaurant-bot/chatbot-images')) {
    return imageUrl;
  }
  
  // Use Cloudinary for optimized, high-quality images (1:1 for menu items)
  return cloudinaryService.getOptimizedUrl(imageUrl, '1:1');
};

const metaCloud = {
  // Download media file from WhatsApp (for voice messages, images, etc.)
  async downloadMedia(mediaId) {
    try {
      const { accessToken } = getConfig();
      
      // Step 1: Get media URL
      const mediaResponse = await axios.get(`https://graph.facebook.com/v24.0/${mediaId}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      
      const mediaUrl = mediaResponse.data.url;
      
      // Step 2: Download the actual file
      const fileResponse = await axios.get(mediaUrl, {
        responseType: 'arraybuffer'
      });
      
      return Buffer.from(fileResponse.data);
    } catch (error) {
      logger.error('media_download_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message
      });
      throw error;
    }
  },

  async sendMessage(phone, message) {
    try {
      const { baseUrl, accessToken, phoneNumberId } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      const response = await axios.post(`${baseUrl}/messages`, {
        messaging_product: 'whatsapp',
        to: to,
        text: { body: message }
      }, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      const errorData = error.response?.data?.error;
      logger.error('meta_send_message_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorCode: errorData?.code,
        errorMessage: errorData?.message,
        errorType: errorData?.type,
        phone: to
      });
      throw error;
    }
  },

  async sendButtons(phone, message, buttons, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      const payload = {
        messaging_product: 'whatsapp',
        to: to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message },
          action: {
            buttons: buttons.map((b, i) => ({
              type: 'reply',
              reply: { id: b.id, title: b.text }
            }))
          }
        }
      };
      
      if (footer) {
        payload.interactive.footer = { text: footer };
      }
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      const errorData = error.response?.data?.error;
      logger.error('meta_send_buttons_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: errorData?.message || error.message,
        phone: to
      });
      return this.sendMessage(phone, message + '\n\n' + buttons.map((b, i) => `${i + 1}. ${b.text || b}`).join('\n'));
    }
  },

  async sendList(phone, title, description, buttonText, sections, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'list',
          header: { type: 'text', text: title.substring(0, 60) },
          body: { text: description.substring(0, 1024) },
          footer: footer ? { text: footer.substring(0, 60) } : undefined,
          action: {
            button: buttonText.substring(0, 20),
            sections: sections.map(section => ({
              title: section.title.substring(0, 24),
              rows: section.rows.slice(0, 10).map(row => ({
                id: row.rowId || row.id,
                title: row.title.substring(0, 24),
                description: row.description?.substring(0, 72) || ''
              }))
            }))
          }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      logger.info('meta_list_success', {
        phone: to
      });
      return response.data;
    } catch (error) {
      const errorData = error.response?.data?.error;
      logger.error('meta_send_list_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: errorData?.message || error.message,
        phone: to
      });
      let fallback = `*${title}*\n\n${description}\n`;
      sections.forEach(s => {
        fallback += `\n*${s.title}*\n`;
        s.rows.forEach((r, i) => { fallback += `${i + 1}. ${r.title}\n`; });
      });
      return this.sendMessage(phone, fallback);
    }
  },

  async sendTemplateButtons(phone, message, buttons, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      // Check if any button has URL
      const hasUrl = buttons.some(b => b.url);
      
      if (hasUrl) {
        // Send as text with link
        let msg = message + (footer ? `\n\n${footer}` : '') + '\n\n';
        buttons.forEach(btn => {
          if (btn.url) msg += `🔗 *${btn.text}:* ${btn.url}\n`;
          else msg += `• ${btn.text}\n`;
        });
        return this.sendMessage(phone, msg);
      } else {
        return this.sendButtons(phone, message, buttons, footer);
      }
    } catch (error) {
      logger.error('meta_template_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.message
      });
      throw error;
    }
  },

  async sendOrder(phone, order, items, paymentUrl, imageUrl = null) {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      // Build order message
      let orderMsg = `Order #${order.orderId}\n⏳ Order pending\n\n`;
      items.forEach(item => {
        orderMsg += `*${item.name}*\nQuantity ${item.quantity}    ₹${item.quantity * item.price}.00\n\n`;
      });
      orderMsg += `━━━━━━━━━━━━━━━\n`;
      
      // Show items total if delivery charge exists
      if (order.deliveryCharge && order.deliveryCharge > 0) {
        orderMsg += `*Items Total*    ₹${order.itemsTotal || (order.totalAmount - order.deliveryCharge)}.00\n`;
        orderMsg += `*Delivery Charge*    ₹${order.deliveryCharge}.00\n`;
        orderMsg += `━━━━━━━━━━━━━━━\n`;
      }
      
      orderMsg += `*Total*    ₹${order.totalAmount}.00\n\n`;
      orderMsg += `💳 Select your UPI app to pay`;

      // Build CTA payload - with optional image header
      const ctaPayload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          header: imageUrl ? {
            type: 'image',
            image: { link: getSquareImageUrl(imageUrl) }
          } : {
            type: 'text',
            text: 'Order details'
          },
          body: {
            text: orderMsg
          },
          footer: {
            text: 'Tap to select UPI app & pay securely'
          },
          action: {
            name: 'cta_url',
            parameters: {
              display_text: 'Pay Now',
              url: paymentUrl
            }
          }
        }
      };

      const response = await axios.post(`${baseUrl}/messages`, ctaPayload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_order_send_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        orderId: order.orderId
      });
      
      // Fallback: simple text message with link
      let orderMsg = `🧾 *ORDER #${order.orderId}*\n⏳ Order pending\n\n`;
      items.forEach(item => {
        orderMsg += `*${item.name}*\nQty: ${item.quantity} × ₹${item.price} = ₹${item.quantity * item.price}\n\n`;
      });
      orderMsg += `━━━━━━━━━━━━━━━\n`;
      
      // Show items total if delivery charge exists (fallback)
      if (order.deliveryCharge && order.deliveryCharge > 0) {
        orderMsg += `*Items Total: ₹${order.itemsTotal || (order.totalAmount - order.deliveryCharge)}*\n`;
        orderMsg += `*Delivery Charge: ₹${order.deliveryCharge}*\n`;
      }
      
      orderMsg += `*Total: ₹${order.totalAmount}*\n\n`;
      orderMsg += `💳 *Pay here (Select UPI App):*\n${paymentUrl}`;

      return this.sendMessage(phone, orderMsg);
    }
  },

  async sendImage(phone, imageUrl, caption = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      // Transform to square image for consistent display
      const squareImageUrl = getSquareImageUrl(imageUrl);
      
      const response = await axios.post(`${baseUrl}/messages`, {
        messaging_product: 'whatsapp',
        to,
        type: 'image',
        image: { link: squareImageUrl, caption }
      }, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_image_send_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message
      });
      // Fallback to text message
      return this.sendMessage(phone, caption);
    }
  },

  async sendImageWithButtons(phone, imageUrl, message, buttons, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      // Transform to square image for consistent display
      const squareImageUrl = getSquareImageUrl(imageUrl);
      
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          header: {
            type: 'image',
            image: { link: squareImageUrl }
          },
          body: { text: message },
          footer: footer ? { text: footer } : undefined,
          action: {
            buttons: buttons.slice(0, 3).map((btn, i) => ({
              type: 'reply',
              reply: {
                id: btn.id || String(i + 1),
                title: (btn.text || btn).substring(0, 20)
              }
            }))
          }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_image_buttons_send_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        phone: to
      });
      // Fallback to regular buttons
      return this.sendButtons(phone, message, buttons, footer);
    }
  },

  // Send location request - opens WhatsApp location picker directly
  async sendLocationRequest(phone, message) {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      // Use location_request_message type - this opens the location picker directly!
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'location_request_message',
          body: {
            text: message
          },
          action: {
            name: 'send_location'
          }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_location_request_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        phone: to
      });
      // Fallback to buttons if location_request_message not supported
      return this.sendButtons(phone, message, [
        { id: 'share_location', text: 'Share Location' },
        { id: 'skip_location', text: 'Skip' },
        { id: 'clear_cart', text: 'Cancel' }
      ], 'Tap to share your delivery location');
    }
  },

  // Send image with CTA URL button - for external links with image header
  async sendImageWithCtaUrl(phone, imageUrl, message, buttonText, url, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      // Transform to square image for consistent display
      const squareImageUrl = getSquareImageUrl(imageUrl);
      
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          header: {
            type: 'image',
            image: { link: squareImageUrl }
          },
          body: {
            text: message
          },
          footer: footer ? { text: footer } : undefined,
          action: {
            name: 'cta_url',
            parameters: {
              display_text: buttonText,
              url: url
            }
          }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_image_cta_url_send_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        phone: to
      });
      // Fallback to CTA URL without image
      return this.sendCtaUrl(phone, message, buttonText, url, footer);
    }
  },

  // Send image with CTA URL button in original ratio - for offers/promotions
  async sendImageWithCtaUrlOriginal(phone, imageUrl, message, buttonText, url, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      // Use original image URL without transformation
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          header: {
            type: 'image',
            image: { link: imageUrl }
          },
          body: {
            text: message
          },
          footer: footer ? { text: footer } : undefined,
          action: {
            name: 'cta_url',
            parameters: {
              display_text: buttonText,
              url: url
            }
          }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_image_cta_url_original_send_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        phone: to
      });
      // Fallback to CTA URL without image
      return this.sendCtaUrl(phone, message, buttonText, url, footer);
    }
  },

  // Send CTA URL button - for external links like Google Review
  async sendCtaUrl(phone, message, buttonText, url, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: {
            text: message
          },
          footer: footer ? { text: footer } : undefined,
          action: {
            name: 'cta_url',
            parameters: {
              display_text: buttonText,
              url: url
            }
          }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_cta_url_send_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        phone: to
      });
      // Fallback to text message with link
      return this.sendMessage(phone, `${message}\n\n🔗 ${buttonText}: ${url}`);
    }
  },

  // Send CTA phone call button - for customer support
  async sendCtaPhone(phone, message, buttonText, phoneNumber, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          body: {
            text: message
          },
          footer: footer ? { text: footer } : undefined,
          action: {
            name: 'cta_url',
            parameters: {
              display_text: buttonText,
              url: `tel:${phoneNumber.replace(/\D/g, '')}`
            }
          }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_cta_phone_send_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        phone: to
      });
      // Fallback to text message with phone number
      return this.sendMessage(phone, `${message}\n\n📞 ${buttonText}: ${phoneNumber}`);
    }
  },

  // Send image with CTA phone call button
  async sendImageWithCtaPhone(phone, imageUrl, message, buttonText, phoneNumber, footer = '') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      logger.info('meta_send_image_with_cta_phone', {
        phone: to
      });
      
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'cta_url',
          header: {
            type: 'image',
            image: {
              link: imageUrl
            }
          },
          body: {
            text: message
          },
          footer: footer ? { text: footer } : undefined,
          action: {
            name: 'cta_url',
            parameters: {
              display_text: buttonText,
              url: `tel:${phoneNumber.replace(/\D/g, '')}`
            }
          }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_image_cta_phone_send_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        phone: to
      });
      // Fallback to CTA Phone without image
      return this.sendCtaPhone(phone, message, buttonText, phoneNumber, footer);
    }
  },

  // Send a marketing template message (works outside 24-hour window)
  // This requires a pre-approved template in your WhatsApp Business Manager
  // Template name: "offer_broadcast" with header image, body text, and CTA button
  async sendMarketingTemplate(phone, templateName, imageUrl, bodyParams = [], buttonUrl = null) {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      // Build components array
      const components = [];
      
      // Add header with image if provided
      if (imageUrl) {
        components.push({
          type: 'header',
          parameters: [{
            type: 'image',
            image: { link: imageUrl }
          }]
        });
      }
      
      // Add body parameters if provided
      if (bodyParams && bodyParams.length > 0) {
        components.push({
          type: 'body',
          parameters: bodyParams.map(param => ({
            type: 'text',
            text: param
          }))
        });
      }
      
      // Add button URL if provided (for dynamic URL templates)
      if (buttonUrl) {
        components.push({
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [{
            type: 'text',
            text: buttonUrl
          }]
        });
      }
      
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: 'en' },
          components: components.length > 0 ? components : undefined
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_marketing_template_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        templateName,
        phone: to
      });
      throw error;
    }
  },

  // Send a simple text-only template (hello_world style - works outside 24-hour window)
  async sendSimpleTemplate(phone, templateName = 'hello_world', languageCode = 'en_US') {
    try {
      const { baseUrl, accessToken } = getConfig();
      const to = phone.replace('@c.us', '').replace(/\D/g, '');
      
      const payload = {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: languageCode }
        }
      };
      
      const response = await axios.post(`${baseUrl}/messages`, payload, {
        headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
      });
      return response.data;
    } catch (error) {
      logger.error('meta_simple_template_failed', {
        errorCategory: 'provider',
        origin: 'meta_cloud',
        finality: 'retryable',
        errorMessage: error.response?.data || error.message,
        templateName,
        phone: to
      });
      throw error;
    }
  }
};

module.exports = metaCloud;
