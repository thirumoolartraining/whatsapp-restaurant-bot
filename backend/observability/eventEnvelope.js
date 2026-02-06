/**
 * Phase 5.1: Canonical Event Contract
 * 
 * This file defines the canonical event envelope and normalizer for the entire system.
 * It is a read-only formalization layer that does not change runtime behavior.
 */

/**
 * REQUIRED: Always present fields in canonical event envelope
 */
const REQUIRED_FIELDS = {
  eventName: 'string',      // snake_case, stable event name
  component: 'string',       // component that emitted the event
  timestamp: 'string',       // ISO string or epoch
  correlationId: 'string',   // correlation identifier
  level: 'string'           // 'info' | 'warn' | 'error'
};

/**
 * OPTIONAL: Present when applicable fields in canonical event envelope
 */
const OPTIONAL_FIELDS = {
  entityRefs: 'object',      // entity identifiers object
  messageId: 'string',       // message identifier
  jobId: 'string',          // job identifier
  orderId: 'string',        // order identifier
  phone: 'string',          // phone number
  payload: 'object'         // structured payload, no free text
};

/**
 * Canonical Event Envelope Interface
 * 
 * This is the source of truth for all events in the system.
 * No human sentences, no emojis, no ad-hoc top-level fields.
 * Payload is always nested.
 */
class CanonicalEvent {
  constructor(rawEvent) {
    this.eventName = rawEvent.eventName;
    this.component = rawEvent.component;
    this.timestamp = rawEvent.timestamp;
    this.correlationId = rawEvent.correlationId;
    this.level = rawEvent.level;
    
    // Optional fields - only set if present
    if (rawEvent.entityRefs) this.entityRefs = rawEvent.entityRefs;
    if (rawEvent.messageId) this.messageId = rawEvent.messageId;
    if (rawEvent.jobId) this.jobId = rawEvent.jobId;
    if (rawEvent.orderId) this.orderId = rawEvent.orderId;
    if (rawEvent.phone) this.phone = rawEvent.phone;
    if (rawEvent.payload) this.payload = rawEvent.payload;
  }

  /**
   * Validate that required fields are present
   */
  validate() {
    const missing = Object.keys(REQUIRED_FIELDS).filter(field => !this[field]);
    if (missing.length > 0) {
      throw new Error(`Missing required fields: ${missing.join(', ')}`);
    }
    
    if (!['info', 'warn', 'error'].includes(this.level)) {
      throw new Error(`Invalid level: ${this.level}. Must be 'info', 'warn', or 'error'`);
    }
    
    return true;
  }

  /**
   * Convert to plain object
   */
  toObject() {
    const result = {
      eventName: this.eventName,
      component: this.component,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      level: this.level
    };

    // Add optional fields only if present
    if (this.entityRefs) result.entityRefs = this.entityRefs;
    if (this.messageId) result.messageId = this.messageId;
    if (this.jobId) result.jobId = this.jobId;
    if (this.orderId) result.orderId = this.orderId;
    if (this.phone) result.phone = this.phone;
    if (this.payload) result.payload = this.payload;

    return result;
  }
}

/**
 * Normalizer Function (READ-ONLY)
 * 
 * Accepts existing structured log/event objects and maps them into the canonical envelope.
 * Preserves all information, never mutates input, never throws.
 * Missing optional fields are omitted, not invented. No inference, no guessing.
 * 
 * @param {Object} rawLogEvent - Existing structured log/event object
 * @returns {CanonicalEvent} Normalized canonical event
 */
function normalizeRawEvent(rawLogEvent) {
  try {
    // Extract required fields with fallbacks
    const eventName = rawLogEvent.event || rawLogEvent.eventName || 'unknown_event';
    const component = rawLogEvent.component || 'unknown';
    const timestamp = rawLogEvent.timestamp || new Date().toISOString();
    const correlationId = rawLogEvent.correlationId || rawLogEvent.correlation_id || null;
    const level = rawLogEvent.level || 'info';

    // Build entity references object from common entity identifiers
    const entityRefs = {};
    
    // Extract entity identifiers if present
    if (rawLogEvent.messageId) entityRefs.messageId = rawLogEvent.messageId;
    if (rawLogEvent.jobId) entityRefs.jobId = rawLogEvent.jobId;
    if (rawLogEvent.orderId) entityRefs.orderId = rawLogEvent.orderId;
    if (rawLogEvent.phone) entityRefs.phone = rawLogEvent.phone;
    
    // Add other common identifiers
    ['provider', 'providerMessageId', 'fromPhone', 'toPhone', 'outboundMessageId', 
     'domainName', 'handlerName', 'errorCategory', 'errorCode'].forEach(field => {
      if (rawLogEvent[field]) entityRefs[field] = rawLogEvent[field];
    });

    // Build payload from remaining fields that aren't part of the envelope
    const payload = {};
    const envelopeFields = [
      'event', 'eventName', 'component', 'timestamp', 'correlationId', 'correlation_id',
      'level', 'messageId', 'jobId', 'orderId', 'phone', 'message'
    ];
    
    Object.keys(rawLogEvent).forEach(key => {
      if (!envelopeFields.includes(key) && !key.startsWith('entity')) {
        payload[key] = rawLogEvent[key];
      }
    });

    // Create canonical event
    const canonical = new CanonicalEvent({
      eventName: eventName.toLowerCase().replace(/[^a-z0-9_]/g, '_'),
      component,
      timestamp,
      correlationId,
      level: level.toLowerCase(),
      entityRefs: Object.keys(entityRefs).length > 0 ? entityRefs : undefined,
      messageId: rawLogEvent.messageId,
      jobId: rawLogEvent.jobId,
      orderId: rawLogEvent.orderId,
      phone: rawLogEvent.phone,
      payload: Object.keys(payload).length > 0 ? payload : undefined
    });

    return canonical;
  } catch (error) {
    // Never throw - return a safe fallback event
    return new CanonicalEvent({
      eventName: 'normalization_failed',
      component: 'event_normalizer',
      timestamp: new Date().toISOString(),
      correlationId: rawLogEvent.correlationId || null,
      level: 'error',
      payload: {
        originalEvent: rawLogEvent,
        error: error.message
      }
    });
  }
}

/**
 * Allowed Event Naming Rules (LOCK)
 * 
 * Documentation + constants only. No enforcement yet.
 */

// Allowed naming format for eventName
const EVENT_NAMING_RULES = {
  format: 'snake_case',
  pattern: 'noun/verb-noun form',
  examples: [
    'customer_sync_start',
    'template_sent_success',
    'broadcast_completed',
    'order_created',
    'payment_initiated'
  ]
};

// Forbidden patterns
const FORBIDDEN_PATTERNS = {
  sentences: 'No human sentences or descriptions',
  emojis: 'No emojis or special characters',
  dynamic_strings: 'No dynamic values in event names',
  spaces: 'No spaces or camelCase',
  examples_forbidden: [
    'Customer started syncing',
    '🎉 Template sent!',
    'order_12345_created',
    'messageProcessed',
    'User clicked button'
  ]
};

// Event name validation regex (for future enforcement)
const EVENT_NAME_REGEX = /^[a-z][a-z0-9_]*[a-z0-9]$/;

/**
 * Predefined event name constants (optional but recommended)
 */
const EVENT_NAMES = {
  // Customer events
  CUSTOMER_SYNC_START: 'customer_sync_start',
  CUSTOMER_SYNC_COMPLETE: 'customer_sync_complete',
  CUSTOMER_SYNC_ERROR: 'customer_sync_error',
  
  // Message events
  MESSAGE_RECEIVED: 'message_received',
  MESSAGE_SENT: 'message_sent',
  MESSAGE_SEND_FAILED: 'message_send_failed',
  
  // Template events
  TEMPLATE_SEND_START: 'template_send_start',
  TEMPLATE_SENT: 'template_sent',
  TEMPLATE_SENT_SUCCESS: 'template_sent_success',
  TEMPLATE_SEND_FAILED: 'template_send_failed',
  
  // Broadcast events
  BROADCAST_START: 'broadcast_start',
  BROADCAST_COMPLETE: 'broadcast_complete',
  BROADCAST_ERROR: 'broadcast_error',
  BROADCAST_SUMMARY: 'broadcast_summary',
  
  // Order events
  ORDER_CREATED: 'order_created',
  ORDER_UPDATED: 'order_updated',
  ORDER_CANCELLED: 'order_cancelled',
  
  // Payment events
  PAYMENT_INITIATED: 'payment_initiated',
  PAYMENT_COMPLETED: 'payment_completed',
  PAYMENT_FAILED: 'payment_failed',
  
  // Error events
  ERROR_OCCURRED: 'error_occurred',
  VALIDATION_FAILED: 'validation_failed',
  PROCESSING_FAILED: 'processing_failed'
};

module.exports = {
  // Types and classes
  CanonicalEvent,
  
  // Constants
  REQUIRED_FIELDS,
  OPTIONAL_FIELDS,
  EVENT_NAMING_RULES,
  FORBIDDEN_PATTERNS,
  EVENT_NAME_REGEX,
  EVENT_NAMES,
  
  // Functions
  normalizeRawEvent
};
