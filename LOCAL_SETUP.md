# 🚀 Local Development Setup Guide

## Quick Start (3 Steps)

### Step 1: Install MongoDB
Choose one option:

**Option A: Local MongoDB**
- Download from https://www.mongodb.com/try/download/community
- Install and start MongoDB service
- Default connection: `mongodb://localhost:27017`

**Option B: MongoDB Atlas (Cloud - Free)**
- Sign up at https://www.mongodb.com/cloud/atlas
- Create a free cluster
- Get connection string and update `backend/.env`

### Step 2: Backend Setup
```bash
cd backend
npm install
npm run dev
```

Backend will run on: http://localhost:5000

### Step 3: Mobile App Setup
```bash
cd app
npm install
npx expo start
```

Then:
- Press `a` for Android emulator
- Press `i` for iOS simulator
- Scan QR code with Expo Go app on your phone

## 📱 Login Credentials

### Admin
- Username: `admin`
- Password: `admin123`

### Delivery Partner
Create delivery partners through the admin panel first.

## 🔧 Configuration

### Update API URL in Mobile App
Edit `app/src/config/api.js`:

```javascript
// For physical device testing
export const API_BASE_URL = 'http://YOUR_COMPUTER_IP:5000';

// For emulator
export const API_BASE_URL = 'http://localhost:5000';
```

To find your computer's IP:
- Windows: `ipconfig` (look for IPv4 Address)
- Mac/Linux: `ifconfig` or `ip addr`

## 🧪 Testing Without External Services

The app will work locally without:
- WhatsApp API (skip chatbot features)
- Razorpay (skip payment features)
- Cloudinary (images stored as base64)
- Google Sheets (skip analytics sync)
- Email service (skip email notifications)

Core features (orders, menu, delivery) work without these services.

## 📊 Project Structure

```
├── backend/          # Node.js + Express API
│   ├── models/       # MongoDB models
│   ├── routes/       # API endpoints
│   └── server.js     # Entry point
│
└── app/              # React Native Expo app
    ├── src/
    │   ├── screens/  # Admin & Delivery screens
    │   ├── navigation/
    │   └── config/
    └── App.js
```

## 🐛 Troubleshooting

### Backend won't start
- Check MongoDB is running: `mongosh` or `mongo`
- Check port 5000 is available
- Review `backend/.env` configuration

### Mobile app can't connect to backend
- Use your computer's IP address, not localhost
- Ensure phone and computer are on same WiFi
- Check firewall isn't blocking port 5000
- For Android emulator, use `10.0.2.2:5000` instead of `localhost:5000`

### MongoDB connection error
- Verify MongoDB service is running
- Check connection string in `.env`
- For Atlas, whitelist your IP address

## 🎯 Next Steps

1. Start backend: `cd backend && npm run dev`
2. Start mobile app: `cd app && npx expo start`
3. Login as admin and explore features
4. Create menu items and test ordering flow
5. Add delivery partners and test delivery features

## 📚 Additional Resources

- [Expo Documentation](https://docs.expo.dev/)
- [MongoDB Setup Guide](https://www.mongodb.com/docs/manual/installation/)
- [React Native Docs](https://reactnative.dev/)

---

**Need help?** Check the main README.md for detailed documentation.
