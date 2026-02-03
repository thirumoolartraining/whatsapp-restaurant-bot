# 🍕 WhatsApp Restaurant Bot

A comprehensive WhatsApp-based restaurant ordering system with AI-powered chatbot, real-time order management, and advanced analytics dashboard.

## 🚀 Features

### 📱 WhatsApp Ordering System
- **AI-Powered Chatbot**: Natural language processing with Groq AI
- **Rich Media Support**: Images, buttons, lists, and interactive messages
- **Order Management**: Complete order lifecycle from menu to delivery
- **Payment Integration**: Razorpay payment gateway with multiple payment methods
- **Real-time Updates**: Order status notifications via WhatsApp

### 🎛️ Admin Dashboard
- **React SPA**: Modern, responsive admin interface
- **Real-time Orders**: Live order updates with Server-Sent Events
- **Order Management**: View, update, and manage all orders
- **Customer Analytics**: Comprehensive customer insights and reporting
- **Menu Management**: Dynamic menu item management with images
- **Delivery Tracking**: Real-time delivery partner tracking

### 📊 Business Intelligence
- **Google Sheets Integration**: Automatic order synchronization
- **Advanced Analytics**: Sales reports, customer insights, and performance metrics
- **PDF Reports**: Automated report generation and email delivery
- **Dashboard Stats**: Real-time business metrics and KPIs

### 🔧 Advanced Features
- **Push Notifications**: Real-time alerts for delivery partners
- **Image Optimization**: Cloudinary integration for media handling
- **Scheduled Tasks**: Automated order cleanup and maintenance
- **Multi-service Support**: Delivery and pickup order types
- **Refund Processing**: Automated refund scheduling and processing

## 🛠️ Tech Stack

### Backend
- **Node.js** with **Express.js** - RESTful API server
- **MongoDB** with **Mongoose** - Database and ODM
- **JWT** - Authentication and authorization
- **Node-cron** - Scheduled task management

### Frontend
- **React 18** - Modern SPA framework
- **Vite** - Fast development and build tool
- **Tailwind CSS** - Utility-first CSS framework
- **GSAP** - Advanced animations and interactions

### External APIs
- **WhatsApp Meta Cloud API** - Business messaging
- **Razorpay** - Payment processing
- **Google Sheets API** - Business intelligence
- **Groq AI** - Chatbot intelligence
- **Cloudinary** - Image CDN and optimization
- **Sendinblue/Brevo** - Email notifications

### Deployment
- **Vercel** - Frontend hosting and CDN
- **Render** - Backend hosting and management
- **MongoDB Atlas** - Managed database service

## 📋 Prerequisites

- Node.js 18+ installed
- MongoDB database (local or Atlas)
- WhatsApp Business Account with Meta Cloud API
- Razorpay account for payment processing
- Google Cloud service account for Sheets integration

## 🚀 Quick Start

### 1. Clone the Repository
```bash
git clone https://github.com/thirumoolartraining/whatsapp-restaurant-bot.git
cd whatsapp-restaurant-bot
```

### 2. Backend Setup
```bash
cd backend
npm install

# Create environment file
cp .env.example .env
# Edit .env with your credentials
```

### 3. Frontend Setup
```bash
cd frontend
npm install
```

### 4. Start Development Servers
```bash
# Backend (Terminal 1)
cd backend
npm run dev

# Frontend (Terminal 2)
cd frontend
npm run dev
```

### 5. Access Applications
- **Frontend**: http://localhost:5173
- **Backend API**: http://localhost:5000
- **Admin Dashboard**: http://localhost:5173/admin

## ⚙️ Configuration

### Environment Variables

Create a `.env` file in the backend directory with the following variables:

```bash
# Database
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/restaurant_bot

# JWT Secret
JWT_SECRET=your_strong_jwt_secret_key

# Server
PORT=5000
BACKEND_URL=https://your-domain.onrender.com
WEBSITE_URL=https://your-domain.vercel.app

# WhatsApp Business API
META_ACCESS_TOKEN=your_meta_access_token
META_BUSINESS_ID=your_meta_business_id
META_PHONE_NUMBER_ID=your_phone_number_id
META_VERIFY_TOKEN=your_webhook_verify_token

# Payment Gateway
RAZORPAY_KEY_ID=your_razorpay_key_id
RAZORPAY_KEY_SECRET=your_razorpay_key_secret

# Cloudinary
CLOUDINARY_CLOUD_NAME=your_cloudinary_cloud_name
CLOUDINARY_API_KEY=your_cloudinary_api_key
CLOUDINARY_API_SECRET=your_cloudinary_api_secret

# Google Sheets
GOOGLE_SHEET_ID=your_google_sheet_id
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'

# Groq AI
GROQ_API_KEY=your_groq_api_key

# Email Service
BREVO_API_KEY=your_brevo_api_key
BREVO_FROM_EMAIL=your_email@example.com
```

## 📱 WhatsApp Setup

### 1. Meta Business Account
1. Create a Meta Business Account
2. Verify your business
3. Set up WhatsApp Business API

### 2. Webhook Configuration
```bash
# Set up webhook for development
ngrok http 5000
node setup-webhook.js https://your-ngrok-url.ngrok-free.app
```

### 3. Test WhatsApp Integration
```bash
# Send test message
node test-whatsapp.js
```

## 🏗️ Architecture

### System Overview
```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   WhatsApp      │    │   React Admin   │    │   Mobile App    │
│   Customers     │    │   Dashboard     │    │   (Optional)    │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                      │                      │
          └──────────────────────┼──────────────────────┘
                                 │
                    ┌─────────────┴─────────────┐
                    │     Express Backend      │
                    │   (Node.js + MongoDB)    │
                    └─────────────┬─────────────┘
                                 │
          ┌──────────────────────┼──────────────────────┐
          │                      │                      │
    ┌─────┴─────┐        ┌─────┴─────┐        ┌─────┴─────┐
    │   Meta    │        │  Razorpay │        │   Google  │
    │  WhatsApp │        │  Payment  │        │   Sheets  │
    │    API    │        │   Gateway │        │    API    │
    └───────────┘        └───────────┘        └───────────┘
```

### Database Schema
```
Orders Collection:
{
  orderId: String (unique)
  customer: { phone, name, email, address }
  items: [{ menuItem, name, quantity, price, image }]
  deliveryAddress: { address, latitude, longitude }
  totalAmount: Number
  status: String (pending → delivered)
  paymentMethod: String
  paymentStatus: String
  createdAt: Date
  updatedAt: Date
}

Customers Collection:
{
  phone: String (unique)
  name: String
  email: String
  conversationState: Object
  cart: Array
  orderHistory: Array
  lastInteraction: Date
}

MenuItems Collection:
{
  name: String
  description: String
  price: Number
  category: String
  image: String
  available: Boolean
  isVeg: Boolean
  customizations: Array
}
```

## 🚀 Deployment

### Production Deployment

#### 1. Frontend (Vercel)
```bash
cd frontend
npm run build
vercel --prod
```

#### 2. Backend (Render)
```bash
# Connect GitHub repository to Render
# Set environment variables in Render dashboard
# Deploy automatically on push to main branch
```

#### 3. Database (MongoDB Atlas)
1. Create MongoDB Atlas cluster
2. Configure network access
3. Create database user
4. Update connection string in environment variables

## 📊 API Documentation

### Core Endpoints

#### Authentication
```http
POST /api/auth/login
POST /api/auth/register
GET  /api/auth/profile
```

#### Orders
```http
GET    /api/orders
POST   /api/orders
GET    /api/orders/:id
PATCH  /api/orders/:id/status
DELETE /api/orders/:id
```

#### Menu
```http
GET    /api/menu
POST   /api/menu
GET    /api/menu/:id
PATCH  /api/menu/:id
DELETE /api/menu/:id
```

#### WhatsApp Webhooks
```http
POST /api/webhook/whatsapp
```

### Real-time Updates
```javascript
// Server-Sent Events for real-time order updates
const eventSource = new EventSource('/api/events');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  // Handle real-time updates
};
```

## 🧪 Testing

### Run Tests
```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test
```

### Test Coverage
- Unit tests for core business logic
- Integration tests for API endpoints
- E2E tests for critical user flows

## 🔧 Development

### Code Structure
```
backend/
├── models/          # Database models
├── routes/          # API routes
├── services/        # Business logic
├── middleware/      # Express middleware
├── utils/           # Utility functions
└── schedulers/      # Scheduled tasks

frontend/
├── src/
│   ├── components/  # React components
│   ├── pages/       # Page components
│   ├── hooks/       # Custom hooks
│   ├── utils/       # Utility functions
│   └── styles/      # CSS files
```

### Adding New Features
1. Create database model in `backend/models/`
2. Add API routes in `backend/routes/`
3. Implement business logic in `backend/services/`
4. Create frontend components in `frontend/src/components/`
5. Add pages in `frontend/src/pages/`

## 🐛 Troubleshooting

### Common Issues

#### WhatsApp API Not Working
- Check Meta Business verification status
- Verify webhook URL is accessible
- Ensure phone number is properly configured
- Check API credentials and permissions

#### Payment Gateway Issues
- Verify Razorpay API keys
- Check webhook configuration
- Ensure callback URLs are correct
- Test with Razorpay test mode first

#### Database Connection Issues
- Check MongoDB connection string
- Verify network access settings
- Ensure database user has proper permissions
- Check firewall and IP whitelist settings

### Debug Mode
```bash
# Enable debug logging
DEBUG=* npm run dev

# Check logs
tail -f logs/app.log
```

## 📈 Performance

### Optimization Tips
- Use Redis for caching frequently accessed data
- Implement database indexes for better query performance
- Optimize image sizes with Cloudinary transformations
- Use CDN for static assets
- Implement rate limiting for API endpoints

### Monitoring
- Set up application monitoring with tools like Sentry
- Monitor database performance with MongoDB Atlas
- Track API response times and error rates
- Set up alerts for critical failures

## 🔒 Security

### Security Measures
- JWT-based authentication
- Input validation and sanitization
- Rate limiting on API endpoints
- HTTPS enforcement in production
- Environment variable protection
- Regular security updates

### Security Best Practices
- Never commit secrets to version control
- Use strong, unique passwords
- Implement proper error handling
- Regular security audits
- Keep dependencies updated
- Use HTTPS everywhere

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 📞 Support

For support and questions:
- Create an issue in the GitHub repository
- Email: support@yourrestaurant.com
- WhatsApp: +1 (555) 123-4567

## 🙏 Acknowledgments

- Meta for WhatsApp Business API
- Razorpay for payment gateway
- MongoDB for database services
- Vercel for frontend hosting
- Render for backend hosting

---

**Built with ❤️ for the restaurant industry**
