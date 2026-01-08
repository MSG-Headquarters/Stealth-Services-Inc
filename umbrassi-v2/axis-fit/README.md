# AXIS Fit PWA

Progressive Web App for AI-powered fitness tracking.

## Features
- 🎬 AI Video Workout Log (camera + Claude Vision)
- 📸 AI Food Scanner (photo recognition)
- 🤖 AI Quick Log (natural language parsing)
- 🔗 iAXIS Hub Sync (bidirectional)
- 📱 Works offline (Service Worker caching)
- 📲 Install as app on iOS/Android

## Deployment to www.umbrassi.com

### Option 1: Upload to hosting
1. Create folder `axis-fit` on your web server
2. Upload all files from this folder
3. Access at: `https://www.umbrassi.com/axis-fit/`

### Option 2: GitHub Pages
1. Create repo `axis-fit` on GitHub
2. Push these files to the repo
3. Enable GitHub Pages in Settings
4. Access at: `https://msg-headquarters.github.io/axis-fit/`

### File Structure
```
axis-fit/
├── index.html          # Main app
├── manifest.json       # PWA manifest
├── sw.js              # Service Worker
├── icons/
│   ├── icon.svg       # Source icon
│   ├── icon-16.png    # Favicon
│   ├── icon-32.png    # Favicon
│   ├── icon-72.png    # Android
│   ├── icon-96.png    # Android
│   ├── icon-128.png   # Chrome
│   ├── icon-144.png   # Windows
│   ├── icon-152.png   # iOS
│   ├── icon-167.png   # iOS iPad
│   ├── icon-180.png   # iOS
│   ├── icon-192.png   # Android/Chrome
│   ├── icon-384.png   # Android
│   ├── icon-512.png   # Android/Chrome
│   └── splash-*.png   # iOS splash screens
└── README.md          # This file
```

## HTTPS Required
PWA features (camera, service worker) require HTTPS.
- GitHub Pages provides HTTPS automatically
- Most hosting providers offer free SSL

## Installation Flow

### Android:
1. Visit the URL in Chrome
2. Banner appears: "Add AXIS Fit to Home Screen"
3. Tap "Install"
4. App icon appears on home screen

### iOS (Safari):
1. Visit the URL in Safari
2. Tap Share button (⎙)
3. Scroll down, tap "Add to Home Screen"
4. Name it and tap "Add"
5. App icon appears on home screen

## Version
- v1.3.0
- SENTINEL monitoring enabled
- API key pre-configured

## Support
Issues? Check SENTINEL dashboard for real-time telemetry.
