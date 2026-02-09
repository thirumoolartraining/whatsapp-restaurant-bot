const mongoose = require('mongoose');

const restaurantConfigSchema = new mongoose.Schema({
  restaurantId: { type: String, required: true, unique: true },
  name: { type: String, required: true },
  // Escalation routing configuration
  fallbackUserId: { 
    type: String, 
    required: true,
    validate: {
      validator: function(v) {
        return v && v.trim().length > 0;
      },
      message: 'fallbackUserId is required and cannot be empty'
    }
  }, // Owner/manager user ID for escalation routing
  // Additional restaurant settings can be added here
  timezone: { type: String, default: 'UTC' },
  currency: { type: String, default: 'INR' },
  contactPhone: { type: String },
  contactEmail: { type: String },
  address: { type: String },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  updatedBy: { type: String }
});

// Pre-save middleware to update timestamp
restaurantConfigSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Static method to get restaurant config
restaurantConfigSchema.statics.getConfig = async function(restaurantId) {
  const config = await this.findOne({ restaurantId, isActive: true });
  if (!config) {
    throw new Error(`Restaurant configuration not found for restaurantId: ${restaurantId}`);
  }
  return config;
};

// Static method to get fallback user ID
restaurantConfigSchema.statics.getFallbackUserId = async function(restaurantId) {
  const config = await this.getConfig(restaurantId);
  return config.fallbackUserId;
};

// Static method to set fallback user ID
restaurantConfigSchema.statics.setFallbackUserId = async function(restaurantId, fallbackUserId, updatedBy = null) {
  if (!fallbackUserId || fallbackUserId.trim().length === 0) {
    throw new Error('fallbackUserId is required and cannot be empty');
  }
  
  const config = await this.findOneAndUpdate(
    { restaurantId },
    { 
      fallbackUserId: fallbackUserId.trim(), 
      updatedAt: Date.now(), 
      updatedBy 
    },
    { upsert: true, new: true }
  );
  return config;
};

module.exports = mongoose.model('RestaurantConfig', restaurantConfigSchema);
