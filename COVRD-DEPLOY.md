# COVRD Deployment Guide

**"We've Got You COVRD"** - Roofing + Solar Quote Platform

---

## Quick Start (Go Live Today)

### Step 1: Deploy Frontend to SSI GitHub Pages

```bash
# In your stealth-services-inc.github.io repo
mkdir covrd
cp frontend/index.html covrd/index.html
git add .
git commit -m "Add COVRD landing page"
git push
```

**Live URL:** `https://stealth-services-inc.github.io/covrd/`

### Step 2: Verify CRM Integration

The frontend is pre-configured to send leads to Zenith CRM:
- **Endpoint:** `https://zenith-crm-production.up.railway.app/api/leads/covrd`
- **API Key:** `covrd-api-key-2025`

Test by submitting a quote through the wizard.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    COVRD FRONTEND                           │
│              (SSI GitHub Pages - PWA)                       │
│                                                             │
│  Features:                                                  │
│  • Hurricane intro animation                                │
│  • Multi-step quote wizard                                  │
│  • Material selection & pricing                             │
│  • Calendar date picker                                     │
│  • Installable PWA                                          │
└─────────────────────────┬───────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    ZENITH CRM (MVP)                         │
│           Railway: zenith-crm-production                    │
│                                                             │
│  Receives:                                                  │
│  • Contact info (name, email, phone, address)               │
│  • Service type (roofing, solar, storm, maintenance)        │
│  • Material selection                                       │
│  • Roof area estimate                                       │
│  • Quote total                                              │
│  • Preferred inspection dates                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Frontend Features

### Hurricane Animation
- 8-arm rotating spiral with shield logo reveal
- 5.2 second intro → fades to landing page
- Creates memorable brand experience

### Quote Wizard (5 Steps)
1. **Service Selection:** Roofing, Solar, Storm Damage, Maintenance
2. **Contact Info:** Name, email, phone, address
3. **Materials:** Dynamic pricing based on service type
4. **Scheduling:** Calendar with multi-date selection (up to 3)
5. **Confirmation:** Quote summary with CRM submission

### PWA Features
- Installable on mobile/desktop
- Offline-capable (service worker)
- Native app feel
- Install banner on first visit

### Pricing Calculator
| Roofing Material | Price/sqft |
|------------------|------------|
| Architectural Shingles | $4.50 |
| Standing Seam Metal | $8.50 |
| Concrete Tile | $12.00 |
| Flat/Modified | $6.50 |

| Solar Package | Price/sqft |
|---------------|------------|
| Standard Panels | $3.00 |
| Premium + Battery | $4.50 |
| Premium + Inverter | $5.00 |

*All prices + 7% FL sales tax*

---

## File Structure

```
covrd/
├── index.html          # Main PWA (single file, self-contained)
└── (optional assets)
```

The frontend is a **single HTML file** with embedded:
- CSS (responsive design, animations)
- JavaScript (state management, API calls)
- SVG graphics (shield logo, icons)
- PWA manifest (inline)
- Service worker (inline)

---

## CRM Integration Details

### Payload Structure
```json
{
  "firstName": "John",
  "lastName": "Smith",
  "email": "john@example.com",
  "phone": "239-555-1234",
  "address": "123 Main St",
  "city": "Naples",
  "state": "FL",
  "zip": "34102",
  "serviceType": "roofing",
  "material": "metal",
  "roofArea": 2500,
  "quoteTotal": 22737,
  "requestedDates": ["2025-01-15", "2025-01-16", "2025-01-17"],
  "quote": {
    "pricing": {
      "total": 22737,
      "roofSize": 2500,
      "material": "metal"
    }
  }
}
```

### API Headers
```
Content-Type: application/json
X-API-Key: covrd-api-key-2025
```

---

## Future Enhancement: COVRD Backend

When ready for EagleView integration:

### Deploy Backend to Railway

```bash
cd backend
railway login
railway init --name covrd-backend
railway up
```

### Configure Environment

```env
NODE_ENV=production
PORT=3001
EAGLEVIEW_CLIENT_ID=xxx
EAGLEVIEW_CLIENT_SECRET=xxx
ZENITH_CRM_URL=https://zenith-crm-production.up.railway.app
CORS_ORIGIN=https://stealth-services-inc.github.io
```

### Update Frontend API

```javascript
// Change from:
const API_BASE_URL = 'https://zenith-crm-production.up.railway.app';
// To:
const API_BASE_URL = 'https://covrd-backend-production.up.railway.app';
```

### Backend Features
- `/api/quote/instant` - Quick quote with address lookup
- `/api/quote/full` - Full quote with EagleView order
- `/api/leads` - Lead management
- `/webhooks/eagleview` - EagleView callbacks

---

## EagleView Integration (Future)

### Get Credentials
1. Create account at https://developer.eagleview.com
2. Generate Client ID + Secret
3. Add to backend `.env`

### Pricing Tiers
| Report Type | Delivery | Est. Cost |
|-------------|----------|-----------|
| Bid Perfect™ | Fast | ~$12-15 |
| Premium Report | 3 days | ~$25-35 |
| Premium Express | 1 day | ~$35-45 |

### Data Received
- Total roof area (sq ft)
- Number of facets
- Roof pitch
- Material type
- 3D visualization

---

## Testing Checklist

- [ ] Hurricane animation plays on load
- [ ] Animation fades to landing page
- [ ] Quote wizard opens on CTA click
- [ ] All 5 steps navigate correctly
- [ ] Material prices calculate correctly
- [ ] Calendar allows date selection
- [ ] Form validation works
- [ ] Quote submits to CRM
- [ ] Success screen displays
- [ ] PWA install prompt appears (mobile)
- [ ] Offline mode works

---

## Troubleshooting

### CORS Errors
If seeing CORS errors, verify Zenith CRM has COVRD origin allowed:
```
CORS_ORIGIN=https://stealth-services-inc.github.io
```

### Quote Not Submitting
1. Check browser console for errors
2. Verify API endpoint is reachable
3. Check API key is correct

### Animation Not Playing
Clear browser cache and reload. Animation uses CSS keyframes.

---

## Support

**Technical:** Claude (Lio)
**Business:** Jim Gallagher

---

*Built for Main Street Group*
**CHRIST IS KING 👑**
