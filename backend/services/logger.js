/**
 * Structured Logging Utility
 * Phase 4.0: Observability Baseline
 * 
 * Provides standardized JSON logging with required base fields:
 * - timestamp (ISO)
 * - level (info | warn | error)
 * - component
 * - correlationId (if available, else null)
 * - messageId (inbound provider message id if available)
 */

const crypto = require('crypto');

class Logger {
  constructor(component = 'unknown') {
    this.component = component;
  }

  // Generate correlation ID if not provided
  generateCorrelationId() {
    return crypto.randomUUID();
  }

  // Base log structure
  createLogEntry(level, message, additionalFields = {}) {
    return {
      timestamp: new Date().toISOString(),
      level,
      component: this.component,
      correlationId: additionalFields.correlationId || null,
      messageId: additionalFields.messageId || null,
      message,
      ...additionalFields
    };
  }

  // Log methods
  info(message, additionalFields = {}) {
    const logEntry = this.createLogEntry('info', message, additionalFields);
    console.log(JSON.stringify(logEntry));
  }

  warn(message, additionalFields = {}) {
    const logEntry = this.createLogEntry('warn', message, additionalFields);
    console.warn(JSON.stringify(logEntry));
  }

  error(message, additionalFields = {}) {
    const logEntry = this.createLogEntry('error', message, additionalFields);
    console.error(JSON.stringify(logEntry));
  }

  // Convenience method for message processing
  logMessageProcessing(provider, providerMessageId, fromPhone, messageType, correlationId = null) {
    this.info('Inbound message received', {
      provider,
      providerMessageId,
      fromPhone,
      messageType,
      correlationId
    });
  }

  // Convenience method for routing decisions
  logRouting(detectedIntent, selectedDomain, selectedHandler, correlationId = null, messageId = null) {
    this.info('Routing decision made', {
      detectedIntent,
      selectedDomain,
      selectedHandler,
      correlationId,
      messageId
    });
  }

  // Convenience method for domain handler execution
  logDomainHandlerEntry(domainName, handlerName, stateKeys, correlationId = null, messageId = null) {
    this.info(`Domain handler entry: ${domainName}`, {
      domainName,
      handlerName,
      stateKeys,
      correlationId,
      messageId
    });
  }

  logDomainHandlerExit(domainName, handlerName, success, nextState = null, correlationId = null, messageId = null) {
    this.info(`Domain handler exit: ${domainName}`, {
      domainName,
      handlerName,
      success,
      nextState,
      correlationId,
      messageId
    });
  }

  // Convenience method for outbound messages
  logOutboundAttempt(outboundMessageId, messageType, toPhone, correlationId = null) {
    this.info('Outbound message attempt', {
      outboundMessageId,
      messageType,
      toPhone,
      status: 'attempt',
      correlationId
    });
  }

  logOutboundResult(outboundMessageId, status, errorCategory = null, correlationId = null) {
    this.info('Outbound message result', {
      outboundMessageId,
      status,
      errorCategory,
      correlationId
    });
  }

  // Convenience method for errors
  logError(error, component = null, errorCategory = null, errorCode = null, correlationId = null, messageId = null) {
    this.error('Error occurred', {
      component: component || this.component,
      errorCategory,
      errorCode,
      errorMessage: error.message || error.toString(),
      correlationId,
      messageId
    });
  }
}

module.exports = Logger;
