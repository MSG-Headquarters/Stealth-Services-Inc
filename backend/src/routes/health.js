/**
 * Health Check Routes
 * 
 * Endpoints for monitoring service health
 */

const express = require('express');
const router = express.Router();

const eagleviewService = require('../services/eagleview');

// ===========================================
// GET /api/health
// Basic health check
// ===========================================
router.get('/', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'COVRD API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ===========================================
// GET /api/health/detailed
// Detailed health check with service status
// ===========================================
router.get('/detailed', async (req, res) => {
  const health = {
    status: 'healthy',
    service: 'COVRD API',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV,
    services: {}
  };

  // Check EagleView
  health.services.eagleview = {
    configured: !!process.env.EAGLEVIEW_CLIENT_ID,
    status: 'unknown'
  };

  if (process.env.EAGLEVIEW_CLIENT_ID) {
    try {
      await eagleviewService.ensureAuthenticated();
      health.services.eagleview.status = 'connected';
    } catch (error) {
      health.services.eagleview.status = 'error';
      health.services.eagleview.error = error.message;
    }
  }

  // Check CRM configuration
  health.services.crm = {
    jobnimbus: !!process.env.JOBNIMBUS_API_KEY,
    acculynx: !!process.env.ACCULYNX_API_KEY,
    configured: !!(process.env.JOBNIMBUS_API_KEY || process.env.ACCULYNX_API_KEY)
  };

  // Check Google Maps
  health.services.googleMaps = {
    configured: !!process.env.GOOGLE_MAPS_API_KEY
  };

  // Overall status
  const criticalServices = ['eagleview'];
  const allCriticalHealthy = criticalServices.every(
    s => health.services[s]?.status === 'connected' || health.services[s]?.configured === false
  );

  if (!allCriticalHealthy) {
    health.status = 'degraded';
  }

  res.json(health);
});

// ===========================================
// GET /api/health/ready
// Kubernetes-style readiness probe
// ===========================================
router.get('/ready', (req, res) => {
  // Check if all critical services are ready
  const ready = true; // Add actual checks here
  
  if (ready) {
    res.json({ ready: true });
  } else {
    res.status(503).json({ ready: false });
  }
});

// ===========================================
// GET /api/health/live
// Kubernetes-style liveness probe
// ===========================================
router.get('/live', (req, res) => {
  res.json({ alive: true });
});

module.exports = router;
