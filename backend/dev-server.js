require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Simple logger for development
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`)
};

const app = express();
const PORT = process.env.PORT || 5000;

// Basic middleware
app.use(cors());
app.use(express.json());

// Basic routes
app.get('/', (req, res) => {
  res.json({ 
    message: 'WhatsApp Restaurant Bot - Development Server',
    status: 'running',
    timestamp: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Mock API endpoints for development
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  
  // Check credentials from environment
  if (username === process.env.ADMIN_USERNAME && password === process.env.ADMIN_PASSWORD) {
    const mockUser = {
      id: '1',
      username: process.env.ADMIN_USERNAME,
      role: 'admin',
      name: 'Administrator'
    };
    
    // Generate a simple mock token (in production, use JWT)
    const mockToken = Buffer.from(JSON.stringify(mockUser)).toString('base64');
    
    res.json({
      success: true,
      token: mockToken,
      user: mockUser
    });
  } else {
    res.status(401).json({
      error: 'Invalid credentials'
    });
  }
});

app.get('/api/auth/verify', (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (token) {
    try {
      const user = JSON.parse(Buffer.from(token, 'base64').toString());
      res.json({ user });
    } catch (error) {
      res.status(401).json({ error: 'Invalid token' });
    }
  } else {
    res.status(401).json({ error: 'No token provided' });
  }
});

app.get('/api/menu', (req, res) => {
  res.json([
    {
      _id: '1',
      name: 'Sample Dish',
      description: 'A delicious sample dish for testing',
      price: 299,
      category: ['Main Course'],
      available: true,
      isVeg: true,
      foodType: 'veg',
      image: 'https://via.placeholder.com/300x200',
      unit: 'piece',
      quantity: 1,
      preparationTime: 15,
      tags: ['popular', 'spicy'],
      isPaused: false
    },
    {
      _id: '2',
      name: 'Sample Beverage',
      description: 'A refreshing sample beverage',
      price: 99,
      category: ['Beverages'],
      available: true,
      isVeg: true,
      foodType: 'veg',
      image: 'https://via.placeholder.com/300x200',
      unit: 'glass',
      quantity: 1,
      preparationTime: 5,
      tags: ['cold', 'refreshing'],
      isPaused: false
    }
  ]);
});

app.get('/api/categories', (req, res) => {
  res.json([
    {
      _id: '1',
      name: 'Main Course',
      description: 'Main course dishes',
      image: 'https://via.placeholder.com/100x100',
      isPaused: false
    },
    {
      _id: '2',
      name: 'Beverages',
      description: 'Cold and hot beverages',
      image: 'https://via.placeholder.com/100x100',
      isPaused: false
    },
    {
      _id: '3',
      name: 'Starters',
      description: 'Appetizers and starters',
      image: 'https://via.placeholder.com/100x100',
      isPaused: false
    }
  ]);
});

app.post('/api/categories', (req, res) => {
  const newCategory = {
    _id: Date.now().toString(),
    name: req.body.name || 'New Category',
    description: req.body.description || '',
    image: req.body.image || 'https://via.placeholder.com/100x100',
    isPaused: false
  };
  res.json({ success: true, data: newCategory });
});

app.put('/api/categories/:id', (req, res) => {
  const updatedCategory = {
    _id: req.params.id,
    name: req.body.name || 'Updated Category',
    description: req.body.description || '',
    image: req.body.image || 'https://via.placeholder.com/100x100',
    isPaused: false
  };
  res.json({ success: true, data: updatedCategory });
});

app.patch('/api/categories/:id/toggle-pause', (req, res) => {
  res.json({ success: true, message: 'Category pause status toggled' });
});

app.delete('/api/categories/:id', (req, res) => {
  res.json({ success: true, message: 'Category deleted successfully' });
});

app.post('/api/ai/generate-description', (req, res) => {
  const { name, category } = req.body;
  res.json({
    description: `A delicious ${category.join(' and ')} dish featuring ${name}. Perfectly prepared with fresh ingredients and authentic spices to give you an unforgettable dining experience.`
  });
});

app.post('/api/menu', (req, res) => {
  const newItem = {
    _id: Date.now().toString(),
    name: req.body.name || 'New Item',
    description: req.body.description || 'Description for new item',
    price: req.body.price || 299,
    category: JSON.parse(req.body.category || '[]'),
    available: req.body.available === 'true',
    foodType: req.body.foodType || 'veg',
    image: req.body.image || 'https://via.placeholder.com/300x200',
    unit: req.body.unit || 'piece',
    quantity: req.body.quantity || 1,
    preparationTime: req.body.preparationTime || 15,
    tags: req.body.tags ? req.body.tags.split(',').map(t => t.trim()) : [],
    isPaused: false
  };
  res.json({ success: true, data: newItem });
});

app.put('/api/menu/:id', (req, res) => {
  const updatedItem = {
    _id: req.params.id,
    name: req.body.name || 'Updated Item',
    description: req.body.description || 'Updated description',
    price: req.body.price || 299,
    category: req.body.category || ['Main Course'],
    available: req.body.available !== false,
    foodType: req.body.foodType || 'veg',
    image: req.body.image || 'https://via.placeholder.com/300x200',
    unit: req.body.unit || 'piece',
    quantity: req.body.quantity || 1,
    preparationTime: req.body.preparationTime || 15,
    tags: req.body.tags ? req.body.tags.split(',').map(t => t.trim()) : [],
    isPaused: false
  };
  res.json({ success: true, data: updatedItem });
});

app.delete('/api/menu/:id', (req, res) => {
  res.json({ success: true, message: 'Menu item deleted successfully' });
});

app.get('/api/orders', (req, res) => {
  res.json({
    success: true,
    data: []
  });
});

app.get('/api/analytics/report', (req, res) => {
  const type = req.query.type || 'weekly';
  res.json({
    success: true,
    data: {
      type: type,
      totalRevenue: type === 'weekly' ? 15000 : 60000,
      totalOrders: type === 'weekly' ? 150 : 600,
      averageOrderValue: 100,
      topItems: [
        { name: 'Sample Dish', orders: 45, revenue: 13455 },
        { name: 'Sample Beverage', orders: 30, revenue: 2970 }
      ],
      dailyData: type === 'weekly' ? [
        { date: '2024-01-01', revenue: 2000, orders: 20 },
        { date: '2024-01-02', revenue: 2500, orders: 25 },
        { date: '2024-01-03', revenue: 1800, orders: 18 },
        { date: '2024-01-04', revenue: 2200, orders: 22 },
        { date: '2024-01-05', revenue: 3000, orders: 30 },
        { date: '2024-01-06', revenue: 2800, orders: 28 },
        { date: '2024-01-07', revenue: 2700, orders: 27 }
      ] : [
        { date: '2024-01-01', revenue: 8000, orders: 80 },
        { date: '2024-01-02', revenue: 9200, orders: 92 },
        { date: '2024-01-03', revenue: 7600, orders: 76 },
        { date: '2024-01-04', revenue: 8800, orders: 88 }
      ]
    }
  });
});

app.get('/api/analytics', (req, res) => {
  res.json({
    success: true,
    data: {
      totalRevenue: 60000,
      totalOrders: 600,
      averageOrderValue: 100,
      totalCustomers: 450,
      popularItems: [
        { name: 'Sample Dish', orders: 150, revenue: 44700 },
        { name: 'Sample Beverage', orders: 100, revenue: 9900 }
      ],
      recentOrders: [
        {
          _id: '1',
          orderId: 'ORD001',
          customer: { name: 'John Doe', phone: '+1234567890' },
          items: [{ name: 'Sample Dish', quantity: 2, price: 299 }],
          totalAmount: 598,
          status: 'delivered',
          createdAt: '2024-01-07T10:30:00Z'
        },
        {
          _id: '2',
          orderId: 'ORD002',
          customer: { name: 'Jane Smith', phone: '+0987654321' },
          items: [{ name: 'Sample Beverage', quantity: 1, price: 99 }],
          totalAmount: 99,
          status: 'pending',
          createdAt: '2024-01-07T11:15:00Z'
        }
      ]
    }
  });
});

// Start server
app.listen(PORT, () => {
  logger.info(`Development server running on port ${PORT}`);
  logger.info(`Frontend URL: ${process.env.WEBSITE_URL || 'http://localhost:5173'}`);
  logger.info('API endpoints available:');
  logger.info('  GET  /           - Server info');
  logger.info('  GET  /health     - Health check');
  logger.info('  GET  /api/menu   - Mock menu data');
  logger.info('  GET  /api/orders - Mock orders data');
});

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down development server...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down development server...');
  process.exit(0);
});
