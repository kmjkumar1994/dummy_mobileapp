to start and open mobile app:

npx expo run:android
npx expo start --dev-client


# 🚀 Full-Stack Mobile App Starter

A production-ready monorepo starter with:
- **Backend**: Node.js + Express + MongoDB Atlas + JWT Auth
- **Mobile**: React Native + Expo + Expo Router

---

## 📁 Project Structure

```
fullstack-app/
├── package.json              ← Root (concurrently scripts)
├── README.md
│
├── backend/
│   ├── server.js             ← Entry point
│   ├── app.js                ← Express app setup
│   ├── .env                  ← Environment variables
│   ├── package.json
│   ├── config/
│   │   ├── db.js             ← MongoDB connection
│   │   └── jwt.js            ← JWT helpers
│   ├── controllers/
│   │   └── authController.js ← Register, login, profile
│   ├── middleware/
│   │   ├── auth.js           ← JWT protect middleware
│   │   ├── errorHandler.js   ← Global error handler
│   │   ├── logger.js         ← Morgan request logger
│   │   ├── rateLimiter.js    ← Express rate limiting
│   │   └── validate.js       ← express-validator helper
│   ├── models/
│   │   └── User.js           ← Mongoose User model
│   ├── routes/
│   │   ├── index.js          ← Route aggregator
│   │   └── authRoutes.js     ← /api/auth routes
│   └── utils/
│       └── response.js       ← Standardized responses
│
└── mobile/
    ├── app.json              ← Expo config
    ├── package.json
    ├── babel.config.js
    ├── .env                  ← EXPO_PUBLIC_API_URL
    ├── assets/               ← App icons & splash
    ├── app/
    │   ├── _layout.js        ← Root layout + AuthProvider
    │   ├── index.js          ← Auth redirect entry
    │   ├── auth/
    │   │   ├── _layout.js    ← Auth stack layout
    │   │   ├── login.js      ← Login screen
    │   │   └── register.js   ← Register screen
    │   └── tabs/
    │       ├── _layout.js    ← Tab bar layout
    │       ├── home.js       ← Home screen
    │       └── profile.js    ← Profile screen
    ├── components/
    │   ├── Avatar.js
    │   ├── Button.js
    │   ├── Card.js
    │   ├── ErrorMessage.js
    │   └── LoadingScreen.js
    ├── constants/
    │   ├── colors.js
    │   └── index.js
    ├── context/
    │   └── AuthContext.js    ← Auth state + AsyncStorage
    ├── hooks/
    │   └── useApi.js         ← Generic API hook
    └── services/
        ├── api.js            ← Axios instance + interceptors
        └── authService.js    ← Auth API calls
```

---

## ⚡ Quick Start

### Step 1 — Install all dependencies

```bash
# From root
npm run install:all

# OR install individually
npm install
npm install --prefix backend
npm install --prefix mobile
```

### Step 2 — Configure environment

**Backend** `.env` is pre-configured with MongoDB Atlas. Just verify `JWT_SECRET`:

```
backend/.env
JWT_SECRET=your_super_secret_jwt_key_change_in_production_min_32_chars
```

**Mobile** — Set your API URL in `mobile/.env`:

```bash
# For Android emulator:
EXPO_PUBLIC_API_URL=http://10.0.2.2:5000/api

# For iOS simulator:
EXPO_PUBLIC_API_URL=http://localhost:5000/api

# For real physical device (replace with YOUR machine's local IP):
EXPO_PUBLIC_API_URL=http://192.168.1.100:5000/api
```

> 💡 **Find your local IP:**
> - Windows: Run `ipconfig` → look for "IPv4 Address"
> - Mac/Linux: Run `ifconfig | grep inet` or `ip addr`

### Step 3 — Start both servers

```bash
# From root — starts backend + mobile together
npm run dev
```

Or start separately:

```bash
# Backend only
npm run dev:backend

# Mobile only
npm run dev:mobile
```

---

## 🔌 API Reference

All endpoints are prefixed with `/api`.

### Health Check
```
GET /health
```

### Authentication

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/api/auth/register` | No | Register new user |
| POST | `/api/auth/login` | No | Login and get token |
| GET | `/api/auth/profile` | Yes | Get current user |
| PUT | `/api/auth/profile` | Yes | Update user name |

**Register request body:**
```json
{ "name": "John Doe", "email": "john@example.com", "password": "secret123" }
```

**Login request body:**
```json
{ "email": "john@example.com", "password": "secret123" }
```

**Protected request header:**
```
Authorization: Bearer <your_token>
```

---

## 📱 Mobile App Flow

```
App Start
    │
    ▼
index.js (redirect)
    ├── isLoading → LoadingScreen
    ├── isAuthenticated → /tabs/home
    └── not authenticated → /auth/login
         │
         ├── /auth/login   → fills token → /tabs/home
         └── /auth/register → fills token → /tabs/home

/tabs/home    ← Protected (redirects to login if no token)
/tabs/profile ← Protected (edit name, logout)
```

---

## 🛠 Tech Stack

### Backend
| Package | Version | Purpose |
|---------|---------|---------|
| express | ^4.19.2 | HTTP framework |
| mongoose | ^8.4.1 | MongoDB ODM |
| jsonwebtoken | ^9.0.2 | JWT auth |
| bcryptjs | ^2.4.3 | Password hashing |
| express-validator | ^7.1.0 | Input validation |
| helmet | ^7.1.0 | Security headers |
| cors | ^2.8.5 | Cross-origin requests |
| express-rate-limit | ^7.3.1 | Rate limiting |
| morgan | ^1.10.0 | Request logging |
| dotenv | ^16.4.5 | Environment variables |
| nodemon | ^3.1.3 | Dev auto-reload |

### Mobile
| Package | Version | Purpose |
|---------|---------|---------|
| expo | ~51.0.8 | SDK + tooling |
| expo-router | ~3.5.14 | File-based navigation |
| react-native | 0.74.1 | Mobile framework |
| axios | ^1.7.2 | HTTP client |
| @react-native-async-storage/async-storage | 1.23.1 | Token persistence |
| @expo/vector-icons | ^14.0.2 | Icon library |

---

## 🧪 Testing the API

Using curl:

```bash
# Health check
curl http://localhost:5000/health

# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@example.com","password":"test1234"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test1234"}'

# Get profile (replace TOKEN with login response token)
curl http://localhost:5000/api/auth/profile \
  -H "Authorization: Bearer TOKEN"
```

---

## 🐛 Troubleshooting

### "Network Error" on physical device
→ You're using `localhost` which doesn't work on real devices.
→ Set `EXPO_PUBLIC_API_URL` to your machine's local IP (e.g., `http://192.168.1.100:5000/api`).
→ Make sure your phone and PC are on the same WiFi network.

### MongoDB connection fails
→ Check your `MONGODB_URI` in `backend/.env`.
→ Ensure your IP is whitelisted in MongoDB Atlas → Network Access → Add IP Address.
→ Try adding `0.0.0.0/0` (allow all) temporarily for testing.

### Expo can't find modules after install
```bash
cd mobile
npx expo install --fix
```

### Port 5000 already in use
→ Change `PORT=5001` in `backend/.env`.
→ Update `EXPO_PUBLIC_API_URL` in `mobile/.env` accordingly.

### JWT token errors
→ Ensure `JWT_SECRET` in `.env` is at least 32 characters.
→ Clear AsyncStorage by uninstalling and reinstalling the Expo Go app.

### "Too many requests" error
→ Rate limiter is active. Wait 15 minutes or restart the backend.
→ Auth routes allow 20 requests per 15 minutes.

### Expo Go app shows blank screen
→ Run `npx expo start --clear` to clear the cache.
→ Shake device → Reload.

---

## 🔐 Security Notes

- Change `JWT_SECRET` to a strong random value in production
- Set `NODE_ENV=production` for production builds
- Update `CORS_ORIGIN` to your actual frontend domain
- Never commit `.env` files to version control
- MongoDB Atlas: restrict network access to your server's IP in production

---

## 📦 Build for Production

### Backend
Deploy to Railway, Render, Fly.io, or any Node.js host.
Set all environment variables in the platform dashboard.

### Mobile
```bash
# Install EAS CLI
npm install -g eas-cli

# Login to Expo account
eas login

# Configure build
eas build:configure

# Build for Android
eas build --platform android

# Build for iOS
eas build --platform ios
```

---

## 📝 License

MIT — use freely for personal and commercial projects.
