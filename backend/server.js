require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const dataEvents = require('./services/eventEmitter');
const corsConfig = require('./config/corsConfig');
const { authLimiter, adminLimiter, webhookLimiter } = require('./middleware/rateLimit');
const authMiddleware = require('./middleware/auth');
const Logger = require('./services/logger');

const logger = new Logger('server');

// Validate environment variables before starting
const validateEnv = require('./config/validateEnv');
validateEnv();

const authRoutes = require('./routes/auth');
const menuRoutes = require('./routes/menu');
const orderRoutes = require('./routes/order');
const webhookRoutes = require('./routes/webhook');
const paymentRoutes = require('./routes/payment');
const customerRoutes = require('./routes/customer');
const analyticsRoutes = require('./routes/analytics');
const aiRoutes = require('./routes/ai');
const categoryRoutes = require('./routes/category');
const publicRoutes = require('./routes/public');
const chatbotImagesRoutes = require('./routes/chatbotImages');
const deliveryBoyRoutes = require('./routes/deliveryboy');
const heroSectionRoutes = require('./routes/heroSection');
const offersRoutes = require('./routes/offers');
const whatsappBroadcastRoutes = require('./routes/whatsappBroadcast');
const settingsRoutes = require('./routes/settings');
const observabilityRoutes = require('./routes/observability');
const orderScheduler = require('./services/orderScheduler');
const dailyCleanup = require('./services/dailyCleanup');
const categoryScheduler = require('./services/categoryScheduler');
const orderCleanup = require('./services/orderCleanup');
const cartCleanup = require('./services/cartCleanup');
const googleSheets = require('./services/googleSheets');
const errorHandler = require('./middleware/errorHandler');
const { initializeEventSource } = require('./observability/eventSource');

const app = express();

// CORS configuration using explicit config
app.options('*', cors(corsConfig));
app.use(cors(corsConfig));
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Log all API requests for debugging
app.use('/api', (req, res, next) => {
  next();
});

mongoose.connect(process.env.MONGODB_URI)
  .then(async () => {
    logger.info('mongodb_connected', {
      component: 'server',
      event: 'mongodb_connected',
      timestamp: new Date().toISOString()
    });
    // Start schedulers after DB connection
    orderScheduler.start();
    dailyCleanup.start();
    categoryScheduler.start();
    orderCleanup.start();
    cartCleanup.startCartCleanupScheduler();
    
    // Initialize Google Sheets (cost-saving sheets)
    await googleSheets.initializeWhatsAppContactsSheet();
    await googleSheets.initializeDailyReportsSheet();
    await googleSheets.initializeDashboardStatsSheet();
    await googleSheets.initializeCustomersSheet();
    
    // Initialize event source for observability
    await initializeEventSource();
    
    logger.info('google_sheets_initialized', {
      component: 'server',
      event: 'google_sheets_initialized',
      timestamp: new Date().toISOString()
    });
  })
  .catch(err => {
    logger.error('mongodb_connection_failed', {
      errorCategory: 'infrastructure',
      origin: 'server',
      finality: 'terminal',
      errorMessage: err.message
    });
  });

app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/menu', menuRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/webhook', webhookRoutes);
app.use('/api/payment', paymentRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/analytics', adminLimiter, analyticsRoutes);
app.use('/api/ai', adminLimiter, aiRoutes);
app.use('/api/categories', adminLimiter, categoryRoutes);
app.use('/api/public', publicRoutes);
app.use('/api/chatbot-images', adminLimiter, chatbotImagesRoutes);
app.use('/api/delivery', adminLimiter, deliveryBoyRoutes);
app.use('/api/hero-sections', adminLimiter, heroSectionRoutes);
app.use('/api/offers', adminLimiter, offersRoutes);
app.use('/api/whatsapp-broadcast', adminLimiter, whatsappBroadcastRoutes);
app.use('/api/settings', adminLimiter, settingsRoutes);
app.use('/api/observability', adminLimiter, authMiddleware, observabilityRoutes);

// Global error handler
app.use(errorHandler);

app.get('/health', (req, res) => res.json({ status: 'ok' }));

// Root route - API status
app.get('/', (req, res) => res.json({ 
  status: 'ok', 
  message: 'FoodAdmin API is running',
  version: '1.0.0'
}));

// SSE endpoint for real-time updates
const sseClients = new Set();

app.get('/api/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  sseClients.add(res);
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 30000);

  req.on('close', () => {
    clearInterval(keepAlive);
    sseClients.delete(res);
  });
});

// Broadcast to all SSE clients
const broadcast = (type) => sseClients.forEach(c => c.write(`data: ${JSON.stringify({ type })}\n\n`));

dataEvents.on('orders', () => broadcast('orders'));
dataEvents.on('dashboard', () => broadcast('dashboard'));
dataEvents.on('customers', () => broadcast('customers'));
dataEvents.on('menu', () => broadcast('menu'));
dataEvents.on('deliveryboys', () => broadcast('deliveryboys'));

// Test endpoint for Google Sheets sync
app.get('/api/test-sheets/:orderId/:status', async (req, res) => {
  const googleSheets = require('./services/googleSheets');
  const { orderId, status } = req.params;
  try {
    const result = await googleSheets.updateOrderStatus(orderId, status, status === 'cancelled' ? 'cancelled' : null);
    res.json({ success: result, orderId, status });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync all cancelled orders to Google Sheets
app.get('/api/sync-cancelled', async (req, res) => {
  const Order = require('./models/Order');
  const googleSheets = require('./services/googleSheets');
  try {
    const cancelledOrders = await Order.find({ status: 'cancelled' });
    let synced = 0;
    for (const order of cancelledOrders) {
      const result = await googleSheets.updateOrderStatus(order.orderId, 'cancelled', order.paymentStatus);
      if (result) synced++;
    }
    res.json({ success: true, total: cancelledOrders.length, synced });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Sync pending refund orders to refundprocessing sheet
app.get('/api/sync-pending-refunds', async (req, res) => {
  const googleSheets = require('./services/googleSheets');
  try {
    const result = await googleSheets.syncPendingRefunds();
    res.json({ success: result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info('server_started', {
    component: 'server',
    event: 'server_started',
    port: PORT,
    timestamp: new Date().toISOString()
  });
});
