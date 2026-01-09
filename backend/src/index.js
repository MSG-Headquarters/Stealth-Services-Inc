/**
 * COVRD Backend API Server
 * "We've Got You COVRD"
 * 
 * Main entry point for the quote engine and lead management API
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

// Import routes
const quoteRoutes = require('./routes/quote');
const leadRoutes = require('./routes/leads');
const webhookRoutes = require('./routes/webhooks');
const healthRoutes = require('./routes/health');

const app = express();
const PORT = process.env.PORT || 3001;

// ===========================================
// MIDDLEWARE
// ===========================================

// Security headers
app.use(helmet());

// CORS configuration
const corsOptions = {
  origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
};
app.use(cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: { error: 'Too many requests, please try again later.' }
});
app.use('/api/', limiter);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging (dev only)
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} | ${req.method} ${req.path}`);
    next();
  });
}

// ===========================================
// ROUTES
// ===========================================

app.use('/api/health', healthRoutes);
app.use('/api/quote', quoteRoutes);
app.use('/api/leads', leadRoutes);
app.use('/webhooks', webhookRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    service: 'COVRD API',
    version: '1.0.0',
    tagline: "We've Got You COVRD",
    status: 'operational',
    endpoints: {
      health: '/api/health',
      quote: '/api/quote',
      leads: '/api/leads'
    }
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// ===========================================
// START SERVER
// ===========================================

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║           COVRD API SERVER                ║
║         "We've Got You COVRD"             ║
╠═══════════════════════════════════════════╣
║  Environment: ${process.env.NODE_ENV?.padEnd(26)}║
║  Port: ${PORT.toString().padEnd(33)}║
║  EagleView: ${process.env.EAGLEVIEW_CLIENT_ID ? 'Configured ✓' : 'Not Set ✗'}${' '.repeat(18)}║
╚═══════════════════════════════════════════╝
  `);
});

module.exports = app;
