const mongoose = require('mongoose');

const outboundMessageSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true
  },
  toPhone: {
    type: String,
    required: true
  },
  messageType: {
    type: String,
    required: true
  },
  payload: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'sent', 'failed'],
    default: 'pending'
  },
  providerMessageId: {
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
  },
  errorCategory: {
    type: String,
    enum: ['policy', 'transient'],
    required: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Index on (provider, toPhone, createdAt)
outboundMessageSchema.index({ provider: 1, toPhone: 1, createdAt: 1 });

module.exports = mongoose.model('OutboundMessage', outboundMessageSchema);
