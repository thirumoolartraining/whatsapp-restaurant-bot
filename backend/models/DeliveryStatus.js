const mongoose = require('mongoose');

const deliveryStatusSchema = new mongoose.Schema({
  messageId: {
    type: String,
    required: true
  },
  correlationId: {
    type: String,
    required: false
  },
  status: {
    type: String,
    enum: ['sent', 'delivered', 'failed', 'read'],
    required: true
  },
  providerTimestamp: {
    type: Date,
    required: false
  },
  receivedAt: {
    type: Date,
    default: Date.now
  },
  rawEventId: {
    type: String,
    required: false
  },
  phone: {
    type: String,
    required: false
  },
  errorCode: {
    type: String,
    required: false
  },
  errorMessage: {
    type: String,
    required: false
  }
});

// Index for idempotency and correlation
deliveryStatusSchema.index({ messageId: 1, status: 1, providerTimestamp: 1 });
deliveryStatusSchema.index({ correlationId: 1 });
deliveryStatusSchema.index({ rawEventId: 1 }, { unique: true });

module.exports = mongoose.model('DeliveryStatus', deliveryStatusSchema);
