/**
 * Webhook Routes
 * 
 * Handles incoming webhooks from:
 * - EagleView (order status updates)
 * - CRM systems
 * - Payment providers (future)
 */

const express = require('express');
const router = express.Router();

const eagleviewService = require('../services/eagleview');
const leadService = require('../services/leads');
const quoteService = require('../services/quote');

// ===========================================
// POST /webhooks/eagleview
// EagleView order status callback
// ===========================================
router.post('/eagleview', async (req, res) => {
  try {
    const { orderId, status, referenceId } = req.body;
    
    console.log(`[Webhook] EagleView: Order ${orderId} - Status: ${status}`);

    // Find lead by EagleView order ID
    const leads = await leadService.getLeads({});
    const lead = leads.find(l => l.eagleview.orderId === orderId);

    if (!lead) {
      console.log(`[Webhook] No lead found for EagleView order ${orderId}`);
      return res.json({ received: true, processed: false });
    }

    // Handle status updates
    if (status === 'Completed' || status === 'completed') {
      // Fetch the completed report
      const report = await eagleviewService.getReport(orderId);

      // Update lead with real measurements
      await leadService.updateLead(lead.id, {
        property: {
          ...lead.property,
          roofArea: report.measurements.totalRoofArea,
          pitch: report.measurements.predominantPitch,
          facets: report.measurements.numberOfFacets
        },
        eagleview: {
          ...lead.eagleview,
          status: 'completed',
          report: report,
          completedAt: new Date().toISOString()
        }
      });

      // Recalculate quote with real data if material was selected
      if (lead.service.material && ['roofing', 'solar'].includes(lead.service.type)) {
        const newQuote = quoteService.calculateQuote({
          serviceType: lead.service.type,
          material: lead.service.material,
          roofArea: report.measurements.totalRoofArea,
          pitch: report.measurements.predominantPitch,
          facets: report.measurements.numberOfFacets,
          dataSource: 'eagleview'
        });

        await leadService.updateLead(lead.id, { quote: newQuote });
        
        console.log(`[Webhook] Quote recalculated for lead ${lead.id}: $${newQuote.pricing.total}`);
      }

      // TODO: Trigger email notification to customer with updated quote
      // TODO: Update CRM with new quote amount

    } else if (status === 'Failed' || status === 'failed') {
      await leadService.updateLead(lead.id, {
        eagleview: {
          ...lead.eagleview,
          status: 'failed',
          error: req.body.errorMessage || 'Report generation failed'
        }
      });

      await leadService.updateStatus(lead.id, 'needs_review', 'EagleView report failed');
    }

    res.json({ received: true, processed: true });

  } catch (error) {
    console.error('[Webhook] EagleView error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ===========================================
// POST /webhooks/jobnimbus
// JobNimbus webhook (status updates from CRM)
// ===========================================
router.post('/jobnimbus', async (req, res) => {
  try {
    const { event, data } = req.body;
    
    console.log(`[Webhook] JobNimbus: ${event}`);

    // Handle different events
    switch (event) {
      case 'job.status_changed':
        // Find lead by CRM ID and update status
        const leads = await leadService.getLeads({});
        const lead = leads.find(l => l.crm.crmId === data.jnid);
        
        if (lead) {
          await leadService.updateStatus(lead.id, data.status_name, 'Updated from JobNimbus');
        }
        break;

      case 'job.won':
        // Mark as sold
        // TODO: Track conversion
        break;

      case 'job.lost':
        // Mark as lost
        // TODO: Track loss reason
        break;
    }

    res.json({ received: true });

  } catch (error) {
    console.error('[Webhook] JobNimbus error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ===========================================
// POST /webhooks/acculynx
// AccuLynx webhook
// ===========================================
router.post('/acculynx', async (req, res) => {
  try {
    console.log('[Webhook] AccuLynx:', req.body);
    
    // Similar handling as JobNimbus
    // TODO: Implement based on AccuLynx webhook spec

    res.json({ received: true });

  } catch (error) {
    console.error('[Webhook] AccuLynx error:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ===========================================
// Webhook verification endpoint
// Some services send GET to verify the endpoint
// ===========================================
router.get('/eagleview', (req, res) => {
  res.json({ status: 'active', service: 'COVRD EagleView Webhook' });
});

router.get('/jobnimbus', (req, res) => {
  res.json({ status: 'active', service: 'COVRD JobNimbus Webhook' });
});

router.get('/acculynx', (req, res) => {
  res.json({ status: 'active', service: 'COVRD AccuLynx Webhook' });
});

module.exports = router;
