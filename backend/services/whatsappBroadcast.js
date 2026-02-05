const WhatsAppContact = require('../models/WhatsAppContact');
const Customer = require('../models/Customer');
const whatsapp = require('./whatsapp');
const googleSheets = require('./googleSheets');
const Logger = require('./logger');

const logger = new Logger('whatsappBroadcast');

// Template name for broadcast offers - must be created in WhatsApp Business Manager
// If you don't have a custom template, we'll use 'hello_world' which is pre-approved for all accounts
const OFFER_TEMPLATE_NAME = process.env.WHATSAPP_OFFER_TEMPLATE || 'hello_world';

// Check if using a test WhatsApp number
// Test numbers (like 15550001234, or numbers starting with 1555) have restrictions
const isTestNumber = () => {
  const phoneNumberId = process.env.META_PHONE_NUMBER_ID;
  // Meta test phone number IDs are typically different from production
  // You can set this env var to 'true' if using a test number
  return process.env.WHATSAPP_TEST_MODE === 'true';
};

const whatsappBroadcast = {
  // Add or update a WhatsApp contact - Now saves to Google Sheets (cost-saving)
  async addContact(phone, name = null, orderDate = new Date(), correlationId = null, messageId = null) {
    try {
      // Save to Google Sheets (primary storage)
      await googleSheets.addOrUpdateWhatsAppContact({
        phone,
        name,
        firstOrderDate: orderDate,
        lastOrderDate: orderDate,
        totalOrders: 1,
        isActive: true
      });
      
      // Also save to MongoDB for backward compatibility (can be removed later)
      const contact = await WhatsAppContact.findOne({ phone });
      
      if (contact) {
        contact.name = name || contact.name;
        contact.lastOrderDate = orderDate;
        contact.totalOrders += 1;
        await contact.save();
        return contact;
      } else {
        const newContact = new WhatsAppContact({
          phone,
          name,
          firstOrderDate: orderDate,
          lastOrderDate: orderDate,
          totalOrders: 1
        });
        await newContact.save();
        return newContact;
      }
    } catch (error) {
      logger.error('Error adding contact', {
        event: 'contact_add_error',
        phone,
        error: error.message
      });
      return null;
    }
  },

  // Sync all existing customers to WhatsApp contacts (both MongoDB and Sheets)
  async syncExistingCustomers(correlationId = null, messageId = null) {
    logger.logDomainHandlerEntry('broadcast', 'syncExistingCustomers', [], correlationId, messageId);
    
    try {
      logger.info('Syncing existing customers', {
        event: 'customer_sync_start',
        correlationId
      });
      
      // Get all customers with phone numbers from MongoDB
      const customers = await Customer.find({ 
        phone: { $exists: true, $ne: null, $ne: '' } 
      });
      
      logger.info('Found customers with phone numbers', {
        event: 'customers_found',
        count: customers.length
      });
      
      let synced = 0;
      
      // Sync each customer to Google Sheets
      for (const customer of customers) {
        if (customer.phone && customer.phone.trim() !== '') {
          await googleSheets.addOrUpdateWhatsAppContact({
            phone: customer.phone,
            name: customer.name || '',
            firstOrderDate: customer.createdAt,
            lastOrderDate: customer.updatedAt || customer.createdAt,
            totalOrders: customer.totalOrders || 1,
            isActive: true
          });
          synced++;
        }
      }
      
      logger.info('Synced customers to Google Sheets', {
        event: 'customer_sync_complete',
        synced,
        total: customers.length
      });
      return { success: true, synced, total: customers.length };
    } catch (error) {
      logger.error('Error syncing customers', {
        event: 'customer_sync_error',
        error: error.message
      });
      return { success: false, error: error.message };
    }
  },

  // Get all active WhatsApp contacts from Google Sheets (cost-saving)
  async getAllContacts(includeOldCustomers = true, correlationId = null, messageId = null) {
    try {
      if (includeOldCustomers) {
        // Sync any new customers first
        await this.syncExistingCustomers(correlationId);
      }
      
      // Fetch from Google Sheets (primary source)
      const sheetContacts = await googleSheets.getActiveWhatsAppContacts();
      
      if (sheetContacts.length > 0) {
        logger.info('Found active contacts from Google Sheets', {
          event: 'contacts_found',
          source: 'google_sheets',
          count: sheetContacts.length
        });
        return sheetContacts;
      }
      
      // Fallback to MongoDB if sheets fail
      logger.info('Falling back to MongoDB for contacts', {
        event: 'fallback_to_mongodb'
      });
      const contacts = await WhatsAppContact.find({ isActive: true }).sort({ lastOrderDate: -1 });
      logger.info('Found active contacts from MongoDB', {
        event: 'contacts_found',
        source: 'mongodb',
        count: contacts.length
      });
      return contacts;
    } catch (error) {
      logger.error('Error getting contacts', {
        event: 'contacts_fetch_error',
        error: error.message
      });
      return [];
    }
  },

  // Send offer image to all WhatsApp contacts (including old customers)
  // Uses interactive messages for users within 24-hour window
  // Falls back to template messages for users outside 24-hour window (even if they sent "hi" months ago)
  // This ensures ALL customers who ever interacted get the offer, regardless of when they last messaged
  async sendOfferToAll(offerImageUrl, offerTitle, offerDescription, offerType, correlationId = null, messageId = null) {
    try {
      // Ensure all customers are synced before sending (includes old customers who sent "hi" or any message)
      logger.info('Syncing all customers before sending', {
        event: 'broadcast_sync_start'
      });
      await this.syncExistingCustomers(correlationId);
      
      const contacts = await this.getAllContacts(true, correlationId); // Include old customers
      
      if (contacts.length === 0) {
        return { success: false, message: 'No contacts found', sent: 0, failed: 0 };
      }

      let sent = 0;
      let failed = 0;
      let sentViaTemplate = 0;
      let sentViaInteractive = 0;
      const failedContacts = [];
      const successContacts = [];

      // Build message for interactive messages
      let message = `🎉 *New Offer!*\n\n`;
      if (offerType) {
        message += `🏷️ *${offerType}*\n\n`;
      }
      if (offerTitle) {
        message += `*${offerTitle}*\n\n`;
      }
      if (offerDescription) {
        message += `${offerDescription}\n\n`;
      }
      message += `Order now and enjoy this amazing deal! 🍽️`;

      const websiteUrl = 'https://restarunt-bot.vercel.app/offers';

      logger.info('Starting broadcast to contacts', {
        event: 'broadcast_start',
        totalContacts: contacts.length,
        note: 'Customers outside 24h window will receive via template',
        templateConfigured: OFFER_TEMPLATE_NAME || 'None'
      });

      // Send to each contact with delay to avoid rate limiting
      // For customers within 24h window: sends interactive message directly
      // For customers outside 24h window: uses hello_world template to re-open conversation, then sends offer
      for (const contact of contacts) {
        // Check if customer is outside 24h window based on lastOrderDate
        const hoursSinceLastInteraction = Math.floor((new Date() - new Date(contact.lastOrderDate)) / (1000 * 60 * 60));
        const isOutside24h = hoursSinceLastInteraction >= 24;
        
        if (isOutside24h) {
          logger.info('Customer outside 24h window, using template', {
            event: 'template_required',
            phone: contact.phone,
            name: contact.name || 'Unknown',
            hoursSinceLastInteraction
          });
        }
        
        try {
          // If customer is outside 24h window, use template directly
          if (isOutside24h && OFFER_TEMPLATE_NAME) {
            logger.info('Sending template to customer', {
              event: 'template_send_start',
              phone: contact.phone,
              name: contact.name || 'Unknown',
              template: OFFER_TEMPLATE_NAME
            });
            
            if (OFFER_TEMPLATE_NAME === 'hello_world') {
              // Use the pre-approved hello_world template first to re-open the conversation
              await whatsapp.sendSimpleTemplate(contact.phone, 'hello_world', 'en_US', correlationId);
              logger.info('Template sent successfully', {
                event: 'template_sent',
                phone: contact.phone,
                name: contact.name || 'Unknown'
              });
              
              // Wait a moment then send the actual offer (now within 24h window)
              await new Promise(resolve => setTimeout(resolve, 1500));
              
              // Now send the actual offer content
              if (offerImageUrl) {
                await whatsapp.sendImageWithCtaUrlOriginal(
                  contact.phone, 
                  offerImageUrl, 
                  message, 
                  'View Offer', 
                  websiteUrl,
                  'Tap to order now!',
                  correlationId
                );
              } else {
                await whatsapp.sendCtaUrl(
                  contact.phone, 
                  message, 
                  'View Offer', 
                  websiteUrl,
                  'Tap to order now!',
                  correlationId
                );
              }
            } else {
              // Send using custom marketing template
              await whatsapp.sendMarketingTemplate(
                contact.phone,
                OFFER_TEMPLATE_NAME,
                offerImageUrl,
                [offerTitle || 'Special Offer', offerDescription || 'Check out our latest deals!'],
                null,
                correlationId
              );
            }
            sent++;
            sentViaTemplate++;
            successContacts.push({ phone: contact.phone, method: 'template', name: contact.name });
            logger.info('Message sent via template', {
              event: 'template_sent_success',
              phone: contact.phone,
              name: contact.name || 'Unknown'
            });
            
          } else {
            // Customer is within 24h window, try sending interactive message directly
            if (offerImageUrl) {
              await whatsapp.sendImageWithCtaUrlOriginal(
                contact.phone, 
                offerImageUrl, 
                message, 
                'View Offer', 
                websiteUrl,
                'Tap to order now!',
                correlationId
              );
            } else {
              await whatsapp.sendCtaUrl(
                contact.phone, 
                message, 
                'View Offer', 
                websiteUrl,
                'Tap to order now!',
                correlationId
              );
            }
            sent++;
            sentViaInteractive++;
            successContacts.push({ phone: contact.phone, method: 'interactive', name: contact.name });
            logger.info('Interactive message sent successfully', {
              event: 'interactive_sent',
              phone: contact.phone,
              name: contact.name || 'Unknown'
            });
          }
        } catch (error) {
          const errorMessage = error.response?.data?.error?.message || error.message || '';
          const errorCode = error.response?.data?.error?.code;
          
          // Check if error is due to 24-hour window (error code 131047 or message contains relevant text)
          // Also check for test number recipient restrictions (error code 131030)
          const is24HourError = errorCode === 131047 || 
                               errorMessage.includes('24 hour') || 
                               errorMessage.includes('re-engage') ||
                               errorMessage.includes('outside the allowed window');
          
          const isTemplateRequiredError = errorMessage.includes('template') && !errorMessage.includes('not found');
          
          // Test number restriction - can only send to test recipients
          const isTestRecipientError = errorCode === 131030 || 
                                       errorMessage.includes('test') ||
                                       errorMessage.includes('recipient') ||
                                       errorMessage.includes('not a valid');
          
          // For test numbers, if recipient is not added, try template method
          if (isTestRecipientError && OFFER_TEMPLATE_NAME) {
            // Try sending via template (templates work even for non-test recipients on test numbers)
            try {
              logger.info('Test recipient restriction, trying template', {
                event: 'test_recipient_template_retry',
                phone: contact.phone,
                name: contact.name || 'Unknown',
                template: OFFER_TEMPLATE_NAME
              });
              
              if (OFFER_TEMPLATE_NAME === 'hello_world') {
                // Use the pre-approved hello_world template first to re-open the conversation
                await whatsapp.sendSimpleTemplate(contact.phone, 'hello_world', 'en_US', correlationId);
                
                // Wait a moment then send the actual offer (now within 24h window)
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Now send the actual offer content
                if (offerImageUrl) {
                  await whatsapp.sendImageWithCtaUrlOriginal(
                    contact.phone, 
                    offerImageUrl, 
                    message, 
                    'View Offer', 
                    websiteUrl,
                    'Tap to order now!',
                    correlationId
                  );
                } else {
                  await whatsapp.sendCtaUrl(
                    contact.phone, 
                    message, 
                    'View Offer', 
                    websiteUrl,
                    'Tap to order now!',
                    correlationId
                  );
                }
              } else {
                // Send using custom marketing template
                await whatsapp.sendMarketingTemplate(
                  contact.phone,
                  OFFER_TEMPLATE_NAME,
                  offerImageUrl,
                  [offerTitle || 'Special Offer', offerDescription || 'Check out our latest deals!'],
                  null,
                  correlationId
                );
              }
              sent++;
              sentViaTemplate++;
              successContacts.push({ phone: contact.phone, method: 'template', name: contact.name });
              logger.info('Message sent via template', {
              event: 'template_sent_success',
              phone: contact.phone,
              name: contact.name || 'Unknown'
            });
            } catch (templateError) {
              failed++;
              const templateErrorMsg = templateError.response?.data?.error?.message || templateError.message;
              failedContacts.push({ 
                phone: contact.phone,
                name: contact.name,
                error: templateErrorMsg,
                reason: 'test_recipient_template_failed'
              });
              logger.error('Template also failed for test recipient', {
                event: 'test_recipient_template_failed',
                phone: contact.phone,
                name: contact.name || 'Unknown',
                error: templateErrorMsg
              });
            }
          } else if ((is24HourError || isTemplateRequiredError) && OFFER_TEMPLATE_NAME) {
            // Try sending via template (works outside 24-hour window)
            try {
              logger.info('24h window expired, trying template', {
                event: 'window_expired_template_retry',
                phone: contact.phone,
                name: contact.name || 'Unknown',
                template: OFFER_TEMPLATE_NAME
              });
              
              if (OFFER_TEMPLATE_NAME === 'hello_world') {
                // Use the pre-approved hello_world template first to re-open the conversation
                await whatsapp.sendSimpleTemplate(contact.phone, 'hello_world', 'en_US', correlationId);
                
                // Wait a moment then send the actual offer (now within 24h window)
                await new Promise(resolve => setTimeout(resolve, 1500));
                
                // Now send the actual offer content
                if (offerImageUrl) {
                  await whatsapp.sendImageWithCtaUrlOriginal(
                    contact.phone, 
                    offerImageUrl, 
                    message, 
                    'View Offer', 
                    websiteUrl,
                    'Tap to order now!',
                    correlationId
                  );
                } else {
                  await whatsapp.sendCtaUrl(
                    contact.phone, 
                    message, 
                    'View Offer', 
                    websiteUrl,
                    'Tap to order now!',
                    correlationId
                  );
                }
              } else {
                // Send using custom marketing template
                // Template should have: header image, body with {{1}} for title, {{2}} for description
                await whatsapp.sendMarketingTemplate(
                  contact.phone,
                  OFFER_TEMPLATE_NAME,
                  offerImageUrl,
                  [offerTitle || 'Special Offer', offerDescription || 'Check out our latest deals!'],
                  null,
                  correlationId
                );
              }
              sent++;
              sentViaTemplate++;
              successContacts.push({ phone: contact.phone, method: 'template', name: contact.name });
              logger.info('Message sent via template', {
              event: 'template_sent_success',
              phone: contact.phone,
              name: contact.name || 'Unknown'
            });
            } catch (templateError) {
              failed++;
              const templateErrorMsg = templateError.response?.data?.error?.message || templateError.message;
              failedContacts.push({ 
                phone: contact.phone,
                name: contact.name,
                error: templateErrorMsg,
                reason: 'template_failed'
              });
              logger.error('Template also failed for test recipient', {
                event: 'test_recipient_template_failed',
                phone: contact.phone,
                name: contact.name || 'Unknown',
                error: templateErrorMsg
              });
            }
          } else if ((is24HourError || isTemplateRequiredError) && !OFFER_TEMPLATE_NAME) {
            // No template configured, log the 24-hour issue
            failed++;
            failedContacts.push({ 
              phone: contact.phone,
              name: contact.name,
              error: '24-hour window expired and no template configured. Set WHATSAPP_OFFER_TEMPLATE env var with your approved template name.',
              reason: '24h_no_template'
            });
            logger.warn('24h window expired, no template configured', {
              event: 'window_expired_no_template',
              phone: contact.phone,
              name: contact.name || 'Unknown'
            });
          } else if (isTestRecipientError && !OFFER_TEMPLATE_NAME) {
            // Test number restriction and no template to try
            failed++;
            failedContacts.push({ 
              phone: contact.phone,
              name: contact.name,
              error: 'Test number restriction: Can only send to registered test recipients. Add this number as a test recipient in Meta Business Manager or switch to a production WhatsApp number.',
              reason: 'test_recipient_restriction'
            });
            logger.warn('Test recipient restriction, no template to try', {
              event: 'test_recipient_no_template',
              phone: contact.phone,
              name: contact.name || 'Unknown'
            });
          } else {
            // Other error
            failed++;
            failedContacts.push({ 
              phone: contact.phone,
              name: contact.name,
              error: errorMessage,
              reason: 'other_error'
            });
            logger.error('Failed to send to customer', {
              event: 'send_failed',
              phone: contact.phone,
              name: contact.name || 'Unknown',
              error: errorMessage
            });
          }
        }
        
        // Add delay to avoid rate limiting (500ms between messages)
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      logger.info('Broadcast summary', {
        event: 'broadcast_summary',
        totalContacts: contacts.length,
        sent,
        sentViaInteractive,
        sentViaTemplate,
        failed,
        templateConfigured: OFFER_TEMPLATE_NAME || 'None'
      });
      
      return {
        success: true,
        total: contacts.length,
        sent,
        sentViaInteractive,
        sentViaTemplate,
        failed,
        failedContacts,
        successContacts,
        templateConfigured: !!OFFER_TEMPLATE_NAME
      };
    } catch (error) {
      logger.error('Error sending offer', {
        event: 'broadcast_error',
        error: error.message
      });
      return { success: false, error: error.message, sent: 0, failed: 0 };
    }
  },

  // Get contact statistics
  async getStats(correlationId = null, messageId = null) {
    try {
      const total = await WhatsAppContact.countDocuments({ isActive: true });
      const totalInactive = await WhatsAppContact.countDocuments({ isActive: false });
      
      return {
        total,
        active: total,
        inactive: totalInactive
      };
    } catch (error) {
      logger.error('Error getting stats', {
        event: 'stats_error',
        error: error.message
      });
      return { total: 0, active: 0, inactive: 0 };
    }
  },

  // Send offer to a single phone number (for testing)
  async sendOfferToSingle(phone, offerImageUrl, offerTitle, offerDescription, offerType, correlationId = null, messageId = null) {
    try {
      // Build message
      let message = `🎉 *New Offer!*\n\n`;
      if (offerType) {
        message += `🏷️ *${offerType}*\n\n`;
      }
      if (offerTitle) {
        message += `*${offerTitle}*\n\n`;
      }
      if (offerDescription) {
        message += `${offerDescription}\n\n`;
      }
      message += `Order now and enjoy this amazing deal! 🍽️`;

      const websiteUrl = 'https://restarunt-bot.vercel.app/offers';

      logger.info('Testing send to phone', {
        event: 'test_send_start',
        phone
      });

      try {
        // Try sending interactive message first
        if (offerImageUrl) {
          await whatsapp.sendImageWithCtaUrlOriginal(
            phone, 
            offerImageUrl, 
            message, 
            'View Offer', 
            websiteUrl,
            'Tap to order now!',
            correlationId
          );
        } else {
          await whatsapp.sendCtaUrl(
            phone, 
            message, 
            'View Offer', 
            websiteUrl,
            'Tap to order now!',
            correlationId
          );
        }
        
        logger.info('Test send successful', {
          event: 'test_send_success',
          phone
        });
        return {
          success: true,
          message: 'Offer sent successfully',
          phone,
          method: 'interactive'
        };
      } catch (error) {
        const errorMessage = error.response?.data?.error?.message || error.message || '';
        const errorCode = error.response?.data?.error?.code;
        
        logger.error('Test send failed', {
          event: 'test_send_failed',
          phone,
          errorCode,
          errorMessage
        });

        // Check specific error types
        const is24HourError = errorCode === 131047 || 
                             errorMessage.includes('24 hour') || 
                             errorMessage.includes('re-engage') ||
                             errorMessage.includes('outside the allowed window');
        
        const isTemplateRequiredError = errorMessage.includes('template') && !errorMessage.includes('not found');
        
        let reason = 'unknown';
        let suggestion = '';
        
        if (is24HourError || isTemplateRequiredError) {
          // Try using hello_world template to re-open conversation
          logger.info('24h window expired, trying hello_world template', {
            event: 'test_window_expired_template_retry',
            phone
          });
          
          try {
            // Send hello_world template first
            await whatsapp.sendSimpleTemplate(phone, 'hello_world', 'en_US', correlationId);
            
            // Wait then send the actual offer
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            if (offerImageUrl) {
              await whatsapp.sendImageWithCtaUrlOriginal(
                phone, 
                offerImageUrl, 
                message, 
                'View Offer', 
                websiteUrl,
                'Tap to order now!',
                correlationId
              );
            } else {
              await whatsapp.sendCtaUrl(
                phone, 
                message, 
                'View Offer', 
                websiteUrl,
                'Tap to order now!',
                correlationId
              );
            }
            
            logger.info('Test send successful via template', {
              event: 'test_send_template_success',
              phone
            });
            return {
              success: true,
              message: 'Offer sent successfully using hello_world template',
              phone,
              method: 'template_then_interactive'
            };
          } catch (templateErr) {
            reason = '24_hour_window';
            suggestion = 'Failed to send via template. The hello_world template may not be available or there is another issue. Check Meta Business Manager for approved templates.';
            return {
              success: false,
              message: 'Failed to send offer',
              phone,
              error: templateErr.response?.data?.error?.message || templateErr.message,
              errorCode: templateErr.response?.data?.error?.code,
              reason,
              suggestion
            };
          }
        } else if (errorCode === 131030 || errorMessage.includes('not a valid')) {
          reason = 'invalid_recipient';
          suggestion = 'This phone number is not a valid WhatsApp number or not registered on WhatsApp.';
        } else if (errorMessage.includes('test')) {
          reason = 'test_number_restriction';
          suggestion = 'You are using a test WhatsApp number. Test numbers can only send messages to phone numbers registered as test recipients in Meta Business Manager.';
        }

        return {
          success: false,
          message: 'Failed to send offer',
          phone,
          error: errorMessage,
          errorCode,
          reason,
          suggestion
        };
      }
    } catch (error) {
      logger.error('Test send error', {
        event: 'test_send_error',
        phone,
        error: error.message
      });
      return { success: false, error: error.message, phone };
    }
  }
};

module.exports = whatsappBroadcast;
