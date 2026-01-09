# COVRD Backend API

**"We've Got You COVRD"**

Backend API server for the COVRD quote engine, lead management, and integrations.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        COVRD Frontend                           │
│                    (Landing Page + Quote Tool)                  │
└─────────────────────────────┬───────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      COVRD Backend API                          │
│                     (Node.js + Express)                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐         │
│  │  /api/quote  │  │  /api/leads  │  │  /webhooks   │         │
│  │              │  │              │  │              │         │
│  │ • Instant    │  │ • Create     │  │ • EagleView  │         │
│  │ • Full       │  │ • List       │  │ • JobNimbus  │         │
│  │ • Pricing    │  │ • Update     │  │ • AccuLynx   │         │
│  │ • Status     │  │ • Sync       │  │              │         │
│  └──────┬───────┘  └──────┬───────┘  └──────────────┘         │
│         │                 │                                    │
│         ▼                 ▼                                    │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                     SERVICES                             │  │
│  ├──────────────┬──────────────┬──────────────────────────┤  │
│  │  EagleView   │    Quote     │        Leads             │  │
│  │  Service     │   Service    │       Service            │  │
│  │              │              │                          │  │
│  │ • Auth       │ • Calculate  │ • CRUD                   │  │
│  │ • Order      │ • Pricing    │ • CRM Sync               │  │
│  │ • Status     │ • Materials  │ • History                │  │
│  │ • Report     │              │                          │  │
│  └──────┬───────┴──────────────┴─────────────┬────────────┘  │
│         │                                     │               │
└─────────┼─────────────────────────────────────┼───────────────┘
          │                                     │
          ▼                                     ▼
┌─────────────────────┐               ┌─────────────────────┐
│     EagleView       │               │    CRM System       │
│        API          │               │ (JobNimbus/AccuLynx)│
│                     │               │                     │
│ • Roof measurements │               │ • Contact mgmt      │
│ • Satellite imagery │               │ • Job tracking      │
│ • Property data     │               │ • Pipeline          │
└─────────────────────┘               └─────────────────────┘
```

---

## Quick Start

### 1. Install Dependencies

```bash
cd covrd-backend
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your API keys
```

### 3. Run Development Server

```bash
npm run dev
```

Server starts at `http://localhost:3001`

### 4. Test Health Check

```bash
curl http://localhost:3001/api/health
```

---

## API Endpoints

### Quote Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/quote/pricing` | Get pricing info for all materials |
| `POST` | `/api/quote/instant` | Quick quote with address (uses cached data) |
| `POST` | `/api/quote/full` | Full quote submission (orders EagleView report) |
| `GET` | `/api/quote/:leadId` | Get quote status and details |

### Lead Endpoints (Protected - requires `X-API-Key` header)

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/leads` | List all leads |
| `GET` | `/api/leads/stats` | Get lead statistics |
| `GET` | `/api/leads/:id` | Get single lead |
| `PUT` | `/api/leads/:id/status` | Update lead status |
| `POST` | `/api/leads/:id/sync` | Force CRM sync |

### Webhook Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/webhooks/eagleview` | EagleView order callbacks |
| `POST` | `/webhooks/jobnimbus` | JobNimbus events |
| `POST` | `/webhooks/acculynx` | AccuLynx events |

### Health Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Basic health check |
| `GET` | `/api/health/detailed` | Detailed with service status |
| `GET` | `/api/health/ready` | Readiness probe |
| `GET` | `/api/health/live` | Liveness probe |

---

## API Examples

### Get Instant Quote

```bash
curl -X POST http://localhost:3001/api/quote/instant \
  -H "Content-Type: application/json" \
  -d '{
    "address": "123 Main St, Naples, FL 34102",
    "serviceType": "roofing"
  }'
```

**Response:**
```json
{
  "success": true,
  "dataSource": "estimate",
  "measurements": {
    "roofArea": 2200,
    "pitch": "standard",
    "facets": 4,
    "confidence": "low"
  },
  "quotes": [
    {
      "material": "shingle",
      "quote": {
        "material": "Architectural Shingles",
        "pricing": {
          "redlineCost": 8470,
          "covrdMarkup": 2118,
          "subtotal": 10588,
          "tax": 741,
          "total": 11329
        }
      }
    }
  ]
}
```

### Submit Full Quote Request

```bash
curl -X POST http://localhost:3001/api/quote/full \
  -H "Content-Type: application/json" \
  -d '{
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
    "requestedDates": ["2025-01-15", "2025-01-16"]
  }'
```

---

## Pricing Configuration

Pricing is configured in `src/services/quote.js`:

### Roofing (per sq ft)
| Material | EPC Redline | + 25% Markup | + 7% Tax | Display Price |
|----------|-------------|--------------|----------|---------------|
| Shingle | $3.50 | $4.38 | $4.68 | ~$4.70/sqft |
| Metal | $7.00 | $8.75 | $9.36 | ~$9.40/sqft |
| Tile | $9.50 | $11.88 | $12.71 | ~$12.70/sqft |

### Solar (per sq ft)
| Package | EPC Redline | + 25% Markup | + 7% Tax | Display Price |
|---------|-------------|--------------|----------|---------------|
| Standard | $2.00 | $2.50 | $2.68 | ~$2.70/sqft |
| Premium | $2.75 | $3.44 | $3.68 | ~$3.70/sqft |
| Premium + Battery | $3.50 | $4.38 | $4.68 | ~$4.70/sqft |

### Complexity Multipliers
- **Pitch:** Low (1.0x), Standard (1.0x), Steep (1.15x), Very Steep (1.30x)
- **Facets:** 1-4 (1.0x), 5-8 (1.05x), 9-12 (1.10x), 13+ (1.15x)

---

## Deployment

### Option 1: Netlify Functions (Recommended)

Convert to serverless functions for Netlify deployment.

### Option 2: Railway / Render

```bash
# Railway
railway login
railway init
railway up

# Render
# Connect GitHub repo in Render dashboard
```

### Option 3: Docker

```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3001
CMD ["npm", "start"]
```

### Environment Variables for Production

```
NODE_ENV=production
PORT=3001
EAGLEVIEW_CLIENT_ID=xxx
EAGLEVIEW_CLIENT_SECRET=xxx
EAGLEVIEW_BASE_URL=https://apicenter.eagleview.com
EAGLEVIEW_WEBHOOK_URL=https://api.covrd.com/webhooks/eagleview
GOOGLE_MAPS_API_KEY=xxx
JOBNIMBUS_API_KEY=xxx
API_SECRET_KEY=xxx
CORS_ORIGIN=https://covrd.com
```

**Note:** EagleView uses the same base URL for sandbox and production. Your credentials determine which environment you access.

---

## Integration Checklist

- [ ] EagleView developer account created
- [ ] EagleView API credentials obtained
- [ ] EagleView sandbox testing complete
- [ ] Google Maps API key with Places API enabled
- [ ] CRM selected (JobNimbus or AccuLynx)
- [ ] CRM API key obtained
- [ ] Webhook URLs configured in CRM
- [ ] Frontend quote tool connected to API
- [ ] Production deployment complete
- [ ] SSL/HTTPS configured
- [ ] Domain connected (api.covrd.com)

---

## File Structure

```
covrd-backend/
├── src/
│   ├── index.js           # Server entry point
│   ├── routes/
│   │   ├── quote.js       # Quote endpoints
│   │   ├── leads.js       # Lead management
│   │   ├── webhooks.js    # External callbacks
│   │   └── health.js      # Health checks
│   ├── services/
│   │   ├── eagleview.js   # EagleView API integration
│   │   ├── quote.js       # Pricing calculations
│   │   └── leads.js       # Lead storage & CRM sync
│   ├── middleware/        # (future: auth, logging)
│   ├── models/            # (future: database models)
│   ├── config/            # (future: config files)
│   └── utils/             # (future: helpers)
├── package.json
├── .env.example
└── README.md
```

---

## Next Steps

1. **Get EagleView credentials** → Update `.env`
2. **Test sandbox** → Run `npm run dev` and test endpoints
3. **Connect frontend** → Update landing page API calls
4. **Choose CRM** → Configure JobNimbus or AccuLynx
5. **Deploy** → Push to Railway/Render/Netlify

---

*Built for Main Street Group by Aurelius Koda*

**CHRIST IS KING 👑**
