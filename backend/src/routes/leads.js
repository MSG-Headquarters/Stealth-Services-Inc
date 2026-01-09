/**
 * Lead Management Routes
 * 
 * Endpoints for managing leads and CRM sync
 */

const express = require('express');
const { query, param, validationResult } = require('express-validator');
const router = express.Router();

const leadService = require('../services/leads');

// Simple API key auth middleware
const apiKeyAuth = (req, res, next) => {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== process.env.API_SECRET_KEY) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

// ===========================================
// GET /api/leads
// List all leads (protected)
// ===========================================
router.get('/', apiKeyAuth, [
  query('status').optional().isString(),
  query('serviceType').optional().isIn(['roofing', 'solar', 'storm', 'maintenance']),
  query('since').optional().isISO8601()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const leads = await leadService.getLeads({
      status: req.query.status,
      serviceType: req.query.serviceType,
      since: req.query.since
    });

    res.json({
      count: leads.length,
      leads: leads.map(l => ({
        id: l.id,
        status: l.status,
        contact: {
          name: `${l.contact.firstName} ${l.contact.lastName}`,
          email: l.contact.email
        },
        property: {
          address: l.property.address,
          city: l.property.city
        },
        service: l.service.type,
        quoteTotal: l.quote?.pricing?.total,
        crmSynced: l.crm.synced,
        createdAt: l.createdAt
      }))
    });

  } catch (error) {
    console.error('[Leads] List error:', error);
    res.status(500).json({ error: 'Failed to list leads' });
  }
});

// ===========================================
// GET /api/leads/stats
// Get lead statistics (protected)
// ===========================================
router.get('/stats', apiKeyAuth, async (req, res) => {
  try {
    const stats = await leadService.getStats();
    res.json(stats);
  } catch (error) {
    console.error('[Leads] Stats error:', error);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

// ===========================================
// GET /api/leads/:id
// Get single lead details (protected)
// ===========================================
router.get('/:id', apiKeyAuth, [
  param('id').isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const lead = await leadService.getLead(req.params.id);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json(lead);

  } catch (error) {
    console.error('[Leads] Get error:', error);
    res.status(500).json({ error: 'Failed to get lead' });
  }
});

// ===========================================
// PUT /api/leads/:id/status
// Update lead status (protected)
// ===========================================
router.put('/:id/status', apiKeyAuth, [
  param('id').isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { status, note } = req.body;
    
    const lead = await leadService.updateStatus(req.params.id, status, note);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    res.json({
      success: true,
      leadId: lead.id,
      status: lead.status
    });

  } catch (error) {
    console.error('[Leads] Status update error:', error);
    res.status(500).json({ error: 'Failed to update status' });
  }
});

// ===========================================
// POST /api/leads/:id/sync
// Force CRM sync for a lead (protected)
// ===========================================
router.post('/:id/sync', apiKeyAuth, [
  param('id').isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const lead = await leadService.getLead(req.params.id);
    
    if (!lead) {
      return res.status(404).json({ error: 'Lead not found' });
    }

    const synced = await leadService.syncToCRM(lead);

    res.json({
      success: synced,
      leadId: lead.id,
      crmId: lead.crm.crmId,
      message: synced ? 'Lead synced to CRM' : 'CRM sync failed or not configured'
    });

  } catch (error) {
    console.error('[Leads] Sync error:', error);
    res.status(500).json({ error: 'Failed to sync lead' });
  }
});

module.exports = router;
