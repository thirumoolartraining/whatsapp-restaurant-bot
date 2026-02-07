/**
 * Intervention Model
 * Phase 6.2: INTERVENTION AUTHORITY FRAMEWORK
 * 
 * Tracks intervention usage per correlationId, prevents repeat usage,
 * and provides audit trail beyond logs.
 */

const mongoose = require('mongoose');

const interventionSchema = new mongoose.Schema({
  correlationId: {
    type: String,
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['RETRY_OVERRIDE', 'STATE_REPAIR', 'MESSAGE_REPLAY']
  },
  actor: {
    type: String,
    required: true,
    enum: ['admin']
  },
  justification: {
    type: String,
    required: true
  },
  status: {
    type: String,
    required: true,
    enum: ['requested', 'denied', 'executed'],
    default: 'requested'
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true,
  // Prevent duplicate interventions of same type for same correlationId
  index: { correlationId: 1, type: 1 }, 
  unique: true
});

// Compound index to enforce one intervention per type per correlationId
interventionSchema.index({ correlationId: 1, type: 1 }, { unique: true });

// Static method to check if intervention exists and is unconsumed
interventionSchema.statics.findUnconsumed = function(correlationId, type) {
  return this.findOne({
    correlationId,
    type,
    status: 'executed'
  });
};

// Static method to check if intervention would exceed cap
interventionSchema.statics.wouldExceedCap = async function(correlationId, type, maxUses = 1) {
  const count = await this.countDocuments({
    correlationId,
    type,
    status: { $in: ['requested', 'executed'] }
  });
  return count >= maxUses;
};

// Pre-save middleware to enforce caps
interventionSchema.pre('save', async function() {
  if (this.isNew) {
    const Intervention = this.constructor;
    const wouldExceed = await Intervention.wouldExceedCap(
      this.correlationId, 
      this.type, 
      1 // maxUsesPerCorrelationId is always 1 for now
    );
    
    if (wouldExceed) {
      const error = new Error(`Intervention cap exceeded for ${this.type} on ${this.correlationId}`);
      error.code = 'INTERVENTION_CAP_EXCEEDED';
      throw error;
    }
  }
});

module.exports = mongoose.model('Intervention', interventionSchema);
