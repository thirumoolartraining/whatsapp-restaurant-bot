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
      'GOOGLE_SHEETS_SPREADSHEET_ID'
    ]
  }
};

module.exports = envSchema;
