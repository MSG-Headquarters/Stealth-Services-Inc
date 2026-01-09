/**
 * Lead Management Service
 * 
 * Handles:
 * - Lead creation and storage
 * - CRM integration (JobNimbus / AccuLynx)
 * - Lead status tracking
 */

const { v4: uuidv4 } = require('uuid');
const axios = require('axios');

// In-memory storage (replace with database in production)
const leads = new Map();

class LeadService {
  
  /**
   * Create a new lead
   * @param {Object} data - Lead data
   */
  async createLead(data) {
    const lead = {
      id: uuidv4(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      status: 'new',
      source: data.source || 'website',
      
      // Contact info
      contact: {
        firstName: data.firstName,
        lastName: data.lastName,
        email: data.email,
        phone: data.phone
      },
      
      // Property info
      property: {
        address: data.address,
        city: data.city,
        state: data.state,
        zip: data.zip,
        roofArea: data.roofArea,
        pitch: data.pitch,
        facets: data.facets
      },
      
      // Service request
      service: {
        type: data.serviceType,
        material: data.material,
        requestedDates: data.requestedDates || []
      },
      
      // Quote data
      quote: data.quote || null,
      
      // EagleView
      eagleview: {
        orderId: data.eagleviewOrderId || null,
        status: data.eagleviewOrderId ? 'ordered' : 'not_ordered'
      },
      
      // CRM sync
      crm: {
        synced: false,
        crmId: null,
        lastSyncAt: null
      },
      
      // Notes and history
      notes: [],
      history: [{
        action: 'created',
        timestamp: new Date().toISOString(),
        details: 'Lead created from website'
      }]
    };

    // Store lead
    leads.set(lead.id, lead);

    // Attempt CRM sync
    await this.syncToCRM(lead);

    console.log(`[Lead] Created: ${lead.id} - ${lead.contact.email}`);
    
    return lead;
  }

  /**
   * Get lead by ID
   */
  async getLead(id) {
    return leads.get(id) || null;
  }

  /**
   * Update lead
   */
  async updateLead(id, updates) {
    const lead = leads.get(id);
    if (!lead) return null;

    const updated = {
      ...lead,
      ...updates,
      updatedAt: new Date().toISOString(),
      history: [
        ...lead.history,
        {
          action: 'updated',
          timestamp: new Date().toISOString(),
          details: `Updated: ${Object.keys(updates).join(', ')}`
        }
      ]
    };

    leads.set(id, updated);
    return updated;
  }

  /**
   * Update lead status
   */
  async updateStatus(id, status, note = '') {
    const lead = leads.get(id);
    if (!lead) return null;

    lead.status = status;
    lead.updatedAt = new Date().toISOString();
    lead.history.push({
      action: 'status_change',
      timestamp: new Date().toISOString(),
      details: `Status changed to: ${status}${note ? ` - ${note}` : ''}`
    });

    leads.set(id, lead);
    return lead;
  }

  /**
   * Get all leads (with optional filters)
   */
  async getLeads(filters = {}) {
    let results = Array.from(leads.values());

    if (filters.status) {
      results = results.filter(l => l.status === filters.status);
    }
    if (filters.serviceType) {
      results = results.filter(l => l.service.type === filters.serviceType);
    }
    if (filters.since) {
      const since = new Date(filters.since);
      results = results.filter(l => new Date(l.createdAt) >= since);
    }

    // Sort by newest first
    results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

    return results;
  }

  // ===========================================
  // CRM INTEGRATION
  // ===========================================

  /**
   * Sync lead to CRM (JobNimbus or AccuLynx)
   */
  async syncToCRM(lead) {
    const crmType = this.detectCRM();
    
    if (!crmType) {
      console.log('[CRM] No CRM configured, skipping sync');
      return false;
    }

    try {
      let crmId;
      
      if (crmType === 'jobnimbus') {
        crmId = await this.syncToJobNimbus(lead);
      } else if (crmType === 'acculynx') {
        crmId = await this.syncToAccuLynx(lead);
      }

      if (crmId) {
        lead.crm.synced = true;
        lead.crm.crmId = crmId;
        lead.crm.lastSyncAt = new Date().toISOString();
        leads.set(lead.id, lead);
        
        console.log(`[CRM] Lead ${lead.id} synced to ${crmType}: ${crmId}`);
        return true;
      }
    } catch (error) {
      console.error(`[CRM] Sync failed for lead ${lead.id}:`, error.message);
      lead.history.push({
        action: 'crm_sync_failed',
        timestamp: new Date().toISOString(),
        details: error.message
      });
    }

    return false;
  }

  /**
   * Detect which CRM is configured
   */
  detectCRM() {
    if (process.env.JOBNIMBUS_API_KEY) return 'jobnimbus';
    if (process.env.ACCULYNX_API_KEY) return 'acculynx';
    return null;
  }

  /**
   * Sync to JobNimbus
   */
  async syncToJobNimbus(lead) {
    const apiKey = process.env.JOBNIMBUS_API_KEY;
    const baseUrl = process.env.JOBNIMBUS_BASE_URL || 'https://app.jobnimbus.com/api1';

    // Create contact
    const contactResponse = await axios.post(`${baseUrl}/contacts`, {
      first_name: lead.contact.firstName,
      last_name: lead.contact.lastName,
      email: lead.contact.email,
      home_phone: lead.contact.phone,
      address_line1: lead.property.address,
      city: lead.property.city,
      state_text: lead.property.state,
      zip: lead.property.zip
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    const contactId = contactResponse.data.jnid;

    // Create job/estimate
    const jobResponse = await axios.post(`${baseUrl}/jobs`, {
      primary_contact_id: contactId,
      name: `${lead.service.type} - ${lead.property.address}`,
      status_name: 'Lead',
      job_type: lead.service.type === 'roofing' ? 'Roof Replacement' : 'Solar Installation',
      description: `Service: ${lead.service.type}\nMaterial: ${lead.service.material}\nRoof Area: ${lead.property.roofArea} sq ft\n\nGenerated by COVRD`,
      estimated_amount: lead.quote?.pricing?.total || 0
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return jobResponse.data.jnid;
  }

  /**
   * Sync to AccuLynx
   */
  async syncToAccuLynx(lead) {
    const apiKey = process.env.ACCULYNX_API_KEY;
    const baseUrl = process.env.ACCULYNX_BASE_URL || 'https://api.acculynx.com';

    const response = await axios.post(`${baseUrl}/api/v2/leads`, {
      firstName: lead.contact.firstName,
      lastName: lead.contact.lastName,
      email: lead.contact.email,
      phoneNumber: lead.contact.phone,
      address: {
        street: lead.property.address,
        city: lead.property.city,
        state: lead.property.state,
        zip: lead.property.zip
      },
      leadSource: 'COVRD Website',
      jobType: lead.service.type === 'roofing' ? 'Roofing' : 'Solar',
      notes: `Material: ${lead.service.material}\nRoof Area: ${lead.property.roofArea} sq ft\nQuote Total: $${lead.quote?.pricing?.total || 'N/A'}`
    }, {
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      }
    });

    return response.data.id;
  }

  // ===========================================
  // STATISTICS
  // ===========================================

  /**
   * Get lead statistics
   */
  async getStats() {
    const allLeads = Array.from(leads.values());
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const thisWeek = new Date(today);
    thisWeek.setDate(thisWeek.getDate() - 7);

    return {
      total: allLeads.length,
      today: allLeads.filter(l => new Date(l.createdAt) >= today).length,
      thisWeek: allLeads.filter(l => new Date(l.createdAt) >= thisWeek).length,
      byStatus: this.groupBy(allLeads, 'status'),
      byService: this.groupBy(allLeads, l => l.service.type),
      crmSynced: allLeads.filter(l => l.crm.synced).length,
      avgQuoteValue: this.calculateAvgQuote(allLeads)
    };
  }

  groupBy(array, key) {
    return array.reduce((acc, item) => {
      const value = typeof key === 'function' ? key(item) : item[key];
      acc[value] = (acc[value] || 0) + 1;
      return acc;
    }, {});
  }

  calculateAvgQuote(leads) {
    const quotedLeads = leads.filter(l => l.quote?.pricing?.total);
    if (quotedLeads.length === 0) return 0;
    
    const total = quotedLeads.reduce((sum, l) => sum + l.quote.pricing.total, 0);
    return Math.round(total / quotedLeads.length);
  }
}

module.exports = new LeadService();
