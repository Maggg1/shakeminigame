# 📈 TradingShake - Trading App Mini Game

A full-screen responsive trading app mini game with **phone number authentication** that rewards users with cash based on their trading performance. Shake your device to claim daily trading rewards!

## 🔐 **NEW: Authentication System**

### 📱 **Phone Number Login Required**
- **Secure Access**: Users must enter their phone number to access the app
- **Real-time Validation**: Automatic phone number format validation
- **Auto-formatting**: Supports (555) 123-4567, +1 555 123 4567, and more
- **24-Hour Sessions**: Stay logged in for a full day with auto-logout
- **Demo Mode**: Enter any valid phone format for testing

### 🔒 **Session Management**
- Persistent login across browser sessions
- Automatic session expiry after 24 hours
- Secure logout with session cleanup
- User phone display in header with logout button

## 🚀 Key Features

### 💰 **Trade-Based Rewards System**
- Rewards calculated based on your trading volume and weekly profit/loss
- Higher trading volume = bigger shake rewards
- Profitable trading = bonus multipliers
- Base rewards scale with your trader level

## Backend Integration

The frontend expects a backend at `http://localhost:3001` by default. You can change this by setting the `VITE_BACKEND_URL` environment variable before starting the dev server.

Create a `.env` file in the project root (Vite will load it) and add:

```env
VITE_BACKEND_URL=http://localhost:3001
```

Required public endpoints (CORS must be enabled):
- `POST /register` { email }
- `POST /trade` { email }
- `POST /share` { email }
- `POST /shake` { email }  — claims unclaimed points
- `GET  /rewards?email=you@example.com` — returns `{ availablePoints, totalPoints, ... }`
- `GET  /rewards/definitions` — optional list of reward definitions

Enable CORS on the backend to allow requests from the frontend (e.g., Access-Control-Allow-Origin: * for development).

Mock-first development
----------------------
This project can run in "mock-first" mode so no remote backend (Firestore, MongoDB, etc.) is contacted during development. By default mock mode is enabled.

To explicitly enable mock mode, set environment variable:

```env
VITE_USE_MOCK=true
```

To connect to a real backend instead, set `VITE_USE_MOCK=false` and configure `VITE_BACKEND_URL` to your backend URL.

### 📱 **Daily Shake Limits**
- **5 shakes per day** to encourage regular engagement
- Daily limits reset at midnight
- Progress tracking with visual indicators

### 🖥️ **Full-Screen Responsive Design**
- **Laptop**: Optimized full-screen layout with grid system
- **Mobile**: Touch-friendly full-screen mobile interface
- **Tablet**: Adaptive layout for medium screens
- True full-screen experience on all devices

### 📊 **Trading Dashboard**
- Real-time trading volume tracking
- Weekly profit/loss display
- Trader level progression system
- Trade simulation for demo purposes

## 🎯 How It Works

### **Trading Performance Affects Rewards:**
1. **Trading Volume**: Higher volume = better reward multipliers (up to 5x)
2. **Weekly Profit**: Profitable trading = bonus multipliers (up to 3x)
3. **Trader Level**: Levels increase with volume, boosting base rewards
4. **Daily Progression**: First shakes of the day give better rewards

### **Reward Calculation:**
```
Final Reward = Base Reward × Volume Multiplier × Profit Multiplier × Daily Bonus
- Base Reward: Trader Level × 10
- Volume Multiplier: 1 + (Volume / $10,000) [Max 5x]
- Profit Multiplier: 1 + (Weekly Profit / $1,000) [Max 3x]
- Daily Bonus: Decreases with each shake (0.5x - 1x)
- Minimum: $5 per shake
```

## 🎮 Game Flow

1. **Execute Trades**: Use "Execute Trade" button to simulate trading
2. **Build Volume**: Higher trading volume increases reward potential
3. **Shake for Rewards**: Use your daily shakes to claim trading bonuses
4. **Level Up**: Reach new trader levels for better base rewards
5. **Track Progress**: Monitor your daily shake usage and next rewards

## 📱 Device Support

### **Mobile Devices** (Primary Experience)
- Native shake detection using device motion sensors
- Full-screen mobile-optimized interface
- Touch-friendly buttons and interactions

### **Desktop/Laptop** (Fallback)
- Click-based "shake" button when motion isn't supported
- Full-screen desktop layout with larger displays
- Keyboard and mouse optimized

## 🎨 Trading App Design

- **Dark Theme**: Professional trading app aesthetic
- **Gradient Backgrounds**: Modern financial app styling
- **Real-time Animations**: Smooth transitions and feedback
- **Trading Colors**: Green for profits, red for losses, blue for neutrals

## 🛠️ Technical Features

- **React 19** with modern hooks
- **Shake.js** for device motion detection
- **LocalStorage** for persistence across sessions
- **CSS Grid & Flexbox** for responsive layouts
- **Trading Simulation** with realistic volume/profit scenarios

## 📊 Stats Tracking

- Total coins earned (cumulative trading rewards)
- Daily shake usage (5 per day limit)
- Trading volume (affects reward multipliers)
- Weekly profit/loss (affects reward bonuses)
- Trader level progression
- Automatic daily reset at midnight

## 🚀 Getting Started

```bash
# Install dependencies
npm install

# Start development server
npm run dev

# Open http://localhost:5173/
```

## 🔐 Firebase Email Link (Passwordless) Setup

If you use Firebase Email Link sign-in (passwordless links) for authentication, enable the feature and add your development origin to the project's Authorized domains. Otherwise you'll see errors like `auth/operation-not-allowed`.

Steps:

- Open the Firebase Console for your project: https://console.firebase.google.com/
- Navigate to **Authentication → Sign-in method**.
- Enable **Email/Password** and then click **Email link (passwordless sign-in)** (toggle "Enable" for Email Link).
- Under **Authorized domains**, add your development origin (for example `http://localhost:5173` or the port Vite uses). If Vite picks another port, add `http://localhost:<port>`.
- Save changes.

Dev testing tip:

- If email delivery is unreliable during development, you can temporarily enable a dev mode that prints the sign-in link in the browser console. See `src/services/auth.js` for where the send function returns `devCode` when available.


## � Perfect For

- **Trading App Integration**: Drop into existing trading platforms
- **User Engagement**: Daily interaction mechanics
- **Gamification**: Reward active traders
- **Mobile-First**: Optimized for smartphone usage
- **Demo/Marketing**: Showcase trading app features

## 📱 Full-Screen Experience

The app automatically adapts to provide a true full-screen experience:
- **Mobile**: Takes full viewport height/width
- **Laptop**: Maximizes screen real estate
- **Tablet**: Balanced layout for touch interaction

## 🎮 Trading Simulation

Click "Execute Trade" to simulate trading activity:
- Random volumes: $1K - $10K
- Random P&L: -$200 to +$750
- Affects your shake reward calculations
- Demonstrates how trading performance impacts rewards

Start trading and shaking for rewards! 📈💰+ Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.
