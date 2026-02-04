const mongoose = require('mongoose');

const inboundMessageSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true
  },
  providerMessageId: {
    type: String,
    required: true
  },
  fromPhone: {
    type: String,
    required: true
  },
  receivedAt: {
    type: Date,
    default: Date.now
  }
});

// UNIQUE compound index on (provider, providerMessageId)
inboundMessageSchema.index(
  { provider: 1, providerMessageId: 1 }, 
  { unique: true }
);

module.exports = mongoose.model('InboundMessage', inboundMessageSchema);
