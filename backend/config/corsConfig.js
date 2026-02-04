/*
 Phase 2 Step 5:
 Explicit CORS configuration.
 No wildcard origins in production.
*/

const cors = require('cors');

// Get allowed origins from environment
const getAllowedOrigins = () => {
  const env = process.env.NODE_ENV || 'development';
  
  if (env === 'production') {
    // In production, use explicit origins only
    const origins = [];
    
    if (process.env.WEBSITE_URL) {
      origins.push(process.env.WEBSITE_URL);
    }
    
    // Add frontend URL if specified
    if (process.env.FRONTEND_URL) {
      origins.push(process.env.FRONTEND_URL);
    }
    
    // Default production frontend URL if none specified
    if (origins.length === 0) {
      origins.push('https://restarunt-bot.vercel.app');
    }
    
    return origins;
  } else {
    // In development, allow localhost
    return [
      'http://localhost:3000',
      'http://localhost:5173',
      'http://localhost:5174',
      'http://127.0.0.1:3000',
      'http://127.0.0.1:5173',
      'http://127.0.0.1:5174'
    ];
  }
};

const corsOptions = {
  origin: (origin, callback) => {
    const allowedOrigins = getAllowedOrigins();
    
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) {
      return callback(null, true);
    }
    
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true, // Keep existing credential support
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  optionsSuccessStatus: 200 // Some legacy browsers choke on 204
};

module.exports = corsOptions;
