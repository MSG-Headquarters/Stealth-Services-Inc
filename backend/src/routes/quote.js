/**
 * Quote Routes
 * 
 * Endpoints for generating roof/solar quotes
 */

const express = require('express');
const { body, validationResult } = require('express-validator');
const router = express.Router();

const eagleviewService = require('../services/eagleview');
const quoteService = require('../services/quote');
const leadService = require('../services/leads');

// ===========================================
// GET /api/quote/pricing
// Get pricing info for display
// ===========================================
router.get('/pricing', (req, res) => {
  const pricing = quoteService.getPricingInfo();
  res.json(pricing);
});

// ===========================================
// POST /api/quote/instant
// Get instant quote with address (uses cached EagleView data if available)
// ===========================================
router.post('/instant', [
  body('address').notEmpty().trim(),
  body('serviceType').isIn(['roofing', 'solar']),
  body('material').optional()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const { address, serviceType, material } = req.body;

    // Try to get instant EagleView data
    let roofData = { available: false };
    
    if (process.env.EAGLEVIEW_CLIENT_ID) {
      roofData = await eagleviewService.getInstantData(address);
    }

    // Use instant data or fallback to estimate
    const roofArea = roofData.available ? roofData.data.totalRoofArea : 2200; // Default estimate
    const pitch = roofData.available ? roofData.data.predominantPitch : 'standard';
    const facets = roofData.available ? roofData.data.facetCount : 4;

    // Generate quotes
    let quotes;
    if (material) {
      // Single material quote
      quotes = quoteService.calculateQuote({
        serviceType,
        material,
        roofArea,
        pitch,
        facets,
        dataSource: roofData.available ? 'instant' : 'estimate'
      });
    } else {
      // All material options
      quotes = quoteService.generateAllQuotes({
        serviceType,
        roofArea,
        pitch,
        facets,
        dataSource: roofData.available ? 'instant' : 'estimate'
      });
    }

    res.json({
      success: true,
      dataSource: roofData.available ? 'eagleview_instant' : 'estimate',
      measurements: {
        roofArea,
        pitch,
        facets,
        confidence: roofData.available ? 'high' : 'low'
      },
      quotes
    });

  } catch (error) {
    console.error('[Quote] Instant quote error:', error);
    res.status(500).json({ 
      error: 'Failed to generate quote',
      message: error.message 
    });
  }
});

// ===========================================
// POST /api/quote/full
// Submit full quote request (orders EagleView report)
// ===========================================
router.post('/full', [
  body('firstName').notEmpty().trim(),
  body('lastName').notEmpty().trim(),
  body('email').isEmail(),
  body('phone').notEmpty(),
  body('address').notEmpty().trim(),
  body('city').notEmpty().trim(),
  body('state').isLength({ min: 2, max: 2 }),
  body('zip').isPostalCode('US'),
  body('serviceType').isIn(['roofing', 'solar', 'storm', 'maintenance']),
  body('material').optional(),
  body('requestedDates').optional().isArray()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const data = req.body;

    // Step 1: Try instant data first
    let roofData = { available: false };
    let eagleviewOrderId = null;

    if (process.env.EAGLEVIEW_CLIENT_ID) {
      const fullAddress = `${data.address}, ${data.city}, ${data.state} ${data.zip}`;
      roofData = await eagleviewService.getInstantData(fullAddress);

      // If no instant data and it's roofing/solar, order EagleView report
      if (!roofData.available && ['roofing', 'solar'].includes(data.serviceType)) {
        const order = await eagleviewService.submitOrder({
          address: data.address,
          city: data.city,
          state: data.state,
          zip: data.zip,
          reportType: 'BidPerfect',
          referenceId: `COVRD-${Date.now()}`
        });
        eagleviewOrderId = order.orderId;
      }
    }

    // Step 2: Calculate quote (estimate if no data yet)
    const roofArea = roofData.available ? roofData.data.totalRoofArea : 2200;
    const pitch = roofData.available ? roofData.data.predominantPitch : 'standard';
    const facets = roofData.available ? roofData.data.facetCount : 4;

    let quote = null;
    if (data.material && ['roofing', 'solar'].includes(data.serviceType)) {
      quote = quoteService.calculateQuote({
        serviceType: data.serviceType,
        material: data.material,
        roofArea,
        pitch,
        facets,
        dataSource: roofData.available ? 'eagleview' : 'estimate'
      });
    }

    // Step 3: Create lead
    const lead = await leadService.createLead({
      ...data,
      roofArea,
      pitch,
      facets,
      quote,
      eagleviewOrderId,
      source: 'website_quote_tool'
    });

    res.json({
      success: true,
      leadId: lead.id,
      status: 'submitted',
      quote: quote || {
        message: 'Quote will be provided after site assessment',
        serviceType: data.serviceType
      },
      eagleview: {
        ordered: !!eagleviewOrderId,
        orderId: eagleviewOrderId,
        status: eagleviewOrderId ? 'processing' : 'not_required'
      },
      nextSteps: data.serviceType === 'storm' || data.serviceType === 'maintenance'
        ? 'A COVRD representative will contact you within 24 hours to schedule your free inspection.'
        : 'Your quote is ready! A COVRD representative will contact you to confirm your inspection dates.'
    });

  } catch (error) {
    console.error('[Quote] Full quote error:', error);
    res.status(500).json({
      error: 'Failed to submit quote request',
      message: error.message
    });
  }
});

// ===========================================
// GET /api/quote/:leadId
// Get quote status and details for a lead
// ===========================================
router.get('/:leadId', async (req, res) => {
  try {
    const lead = await leadService.getLead(req.params.leadId);
    
    if (!lead) {
      return res.status(404).json({ error: 'Quote not found' });
    }

    // If EagleView order pending, check status
    if (lead.eagleview.orderId && lead.eagleview.status === 'ordered') {
      try {
        const status = await eagleviewService.getOrderStatus(lead.eagleview.orderId);
        
        if (status.status === 'completed') {
          // Get the report and recalculate quote
          const report = await eagleviewService.getReport(lead.eagleview.orderId);
          
          // Update lead with real measurements
          lead.property.roofArea = report.measurements.totalRoofArea;
          lead.property.pitch = report.measurements.predominantPitch;
          lead.property.facets = report.measurements.numberOfFacets;
          lead.eagleview.status = 'completed';
          lead.eagleview.report = report;

          // Recalculate quote with real data
          if (lead.service.material) {
            lead.quote = quoteService.calculateQuote({
              serviceType: lead.service.type,
              material: lead.service.material,
              roofArea: report.measurements.totalRoofArea,
              pitch: report.measurements.predominantPitch,
              facets: report.measurements.numberOfFacets,
              dataSource: 'eagleview'
            });
          }

          await leadService.updateLead(lead.id, lead);
        } else {
          lead.eagleview.status = status.status;
          lead.eagleview.percentComplete = status.percentComplete;
        }
      } catch (err) {
        console.error('[Quote] EagleView status check failed:', err);
      }
    }

    res.json({
      leadId: lead.id,
      status: lead.status,
      quote: lead.quote,
      measurements: {
        roofArea: lead.property.roofArea,
        pitch: lead.property.pitch,
        facets: lead.property.facets
      },
      eagleview: lead.eagleview,
      service: lead.service,
      createdAt: lead.createdAt
    });

  } catch (error) {
    console.error('[Quote] Get quote error:', error);
    res.status(500).json({ error: 'Failed to get quote details' });
  }
});

module.exports = router;
