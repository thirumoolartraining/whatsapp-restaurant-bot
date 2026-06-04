/*
 Phase 2 Step 4:
 Environment validation schema.
 Ensures required configuration is present.
 No defaults for secrets.
*/

const envSchema = {
  // Required environment variables
  required: {
    server: [
      'PORT',
      'NODE_ENV'
    ],
    database: [
      'MONGODB_URI'
    ],
    auth: [
      'JWT_SECRET'
    ],
    // WhatsApp/Meta variables required in production
    production: {
      meta: [
        'META_ACCESS_TOKEN',
        'META_PHONE_NUMBER_ID',
        'META_BUSINESS_ID',
        'META_APP_SECRET'
      ]
    }
  },

  // Optional environment variables (listed for completeness)
  optional: {
    meta: [
      'META_VERIFY_TOKEN'
    ],
    payments: [
      'RAZORPAY_KEY_ID',
      'RAZORPAY_KEY_SECRET'
    ],
    email: [
      'BREVO_API_KEY',
      'BREVO_EMAIL_SENDER'
    ],
    media: [
      'CLOUDINARY_CLOUD_NAME',
      'CLOUDINARY_API_KEY',
      'CLOUDINARY_API_SECRET'
    ],
    ai: [
      'GROQ_API_KEY'
    ],
    sheets: [
      'GOOGLE_SHEETS_CLIENT_EMAIL',
      'GOOGLE_SHEETS_PRIVATE_KEY',
      'GOOGLE_SHEETS_SPREADSHEET_ID',
      'GOOGLE_SHEET_ID',
      'GOOGLE_SERVICE_ACCOUNT_KEY'
    ],
    queue: [
      'REDIS_HOST',
      'REDIS_PORT',
      'REDIS_PASSWORD',
      'REDIS_DB',
      'QUEUE_FALLBACK_ALLOWED'
    ],
    abuse: [
      'ABUSE_INBOUND_PER_PHONE_PER_MINUTE',
      'ABUSE_OUTBOUND_PER_PHONE_PER_MINUTE',
      'ABUSE_INTERVENTIONS_PER_CORRELATION',
      'ABUSE_MESSAGE_REPLAYS_PER_CORRELATION',
      'ABUSE_STATE_REPAIRS_PER_CORRELATION',
      'ABUSE_RETRY_OVERRIDES_PER_CORRELATION',
      'ABUSE_INBOUND_VIOLATIONS_FOR_LOCKOUT',
      'ABUSE_LOCKOUT_DURATION_MINUTES'
    ]
  }
};

module.exports = envSchema;
