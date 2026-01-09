/**
 * EagleView API Service
 * 
 * Handles all interactions with EagleView's roof measurement API:
 * - OAuth2 authentication (client_credentials + refresh_token flows)
 * - Order submission
 * - Status checking
 * - Report retrieval
 * 
 * API Docs: https://developer.eagleview.com
 * Base URL: https://apicenter.eagleview.com (same for sandbox & production)
 */

const axios = require('axios');

class EagleViewService {
  constructor() {
    // Base URL is the same for sandbox and production
    // Sandbox vs production is determined by your credentials
    this.baseUrl = process.env.EAGLEVIEW_BASE_URL || 'https://apicenter.eagleview.com';
    this.clientId = process.env.EAGLEVIEW_CLIENT_ID;
    this.clientSecret = process.env.EAGLEVIEW_CLIENT_SECRET;
    this.accessToken = null;
    this.refreshToken = null;
    this.tokenExpiry = null;
  }

  // ===========================================
  // AUTHENTICATION
  // ===========================================

  /**
   * Generate Basic Auth header
   * Base64 encoded ClientID:ClientSecret
   */
  getBasicAuthHeader() {
    const credentials = Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64');
    return `Basic ${credentials}`;
  }

  /**
   * Get OAuth2 access token using client_credentials grant
   * Access tokens expire after 24 hours (86400 seconds) per API docs
   */
  async authenticate() {
    try {
      const response = await axios.post(
        `${this.baseUrl}/oauth2/v1/token`,
        new URLSearchParams({
          grant_type: 'client_credentials'
        }).toString(),
        {
          headers: {
            'Authorization': this.getBasicAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token || null;
      // expires_in is in seconds, default to 86400 (24 hours) per API example
      const expiresIn = response.data.expires_in || 86400;
      this.tokenExpiry = Date.now() + (expiresIn * 1000);

      console.log(`[EagleView] Authentication successful. Token expires in ${Math.round(expiresIn / 3600)}h`);
      return true;
    } catch (error) {
      const errorData = error.response?.data;
      console.error('[EagleView] Authentication failed:', errorData || error.message);
      
      if (error.response?.status === 429) {
        throw new Error('EagleView rate limit exceeded. Please try again later.');
      }
      
      throw new Error(`EagleView authentication failed: ${errorData?.errorDescription || error.message}`);
    }
  }

  /**
   * Refresh access token using refresh_token grant
   */
  async refreshAccessToken() {
    if (!this.refreshToken) {
      return this.authenticate();
    }

    try {
      const response = await axios.post(
        `${this.baseUrl}/oauth2/v1/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.refreshToken
        }).toString(),
        {
          headers: {
            'Authorization': this.getBasicAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );

      this.accessToken = response.data.access_token;
      this.refreshToken = response.data.refresh_token || this.refreshToken;
      const expiresIn = response.data.expires_in || 86400;
      this.tokenExpiry = Date.now() + (expiresIn * 1000);

      console.log('[EagleView] Token refreshed successfully');
      return true;
    } catch (error) {
      console.log('[EagleView] Refresh failed, re-authenticating...');
      // Refresh failed, need full re-auth
      this.refreshToken = null;
      return this.authenticate();
    }
  }

  /**
   * Revoke a refresh token (invalidate it)
   */
  async revokeToken(token) {
    try {
      await axios.post(
        `${this.baseUrl}/oauth2/v1/revoke`,
        new URLSearchParams({
          token: token,
          token_type_hint: 'refresh_token'
        }).toString(),
        {
          headers: {
            'Authorization': this.getBasicAuthHeader(),
            'Content-Type': 'application/x-www-form-urlencoded'
          }
        }
      );
      console.log('[EagleView] Token revoked successfully');
      return true;
    } catch (error) {
      console.error('[EagleView] Token revocation failed:', error.response?.data || error.message);
      return false;
    }
  }

  /**
   * Ensure we have a valid token before making requests
   * Refreshes 5 minutes before expiry to avoid edge cases
   */
  async ensureAuthenticated() {
    const bufferMs = 5 * 60 * 1000; // 5 minutes buffer
    
    if (!this.accessToken || Date.now() >= (this.tokenExpiry - bufferMs)) {
      if (this.refreshToken) {
        await this.refreshAccessToken();
      } else {
        await this.authenticate();
      }
    }
  }

  /**
   * Get configured axios instance with Bearer token auth
   */
  async getClient() {
    await this.ensureAuthenticated();
    return axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      }
    });
  }

  // ===========================================
  // ORDERING
  // ===========================================

  /**
   * Submit a roof measurement order
   * @param {Object} params - Order parameters
   * @param {string} params.address - Full street address
   * @param {string} params.city - City
   * @param {string} params.state - State (2-letter code)
   * @param {string} params.zip - ZIP code
   * @param {string} params.reportType - 'BidPerfect' | 'Premium' | 'PremiumExpress'
   * @param {string} params.referenceId - Your internal reference ID
   */
  async submitOrder(params) {
    try {
      const client = await this.getClient();
      
      const orderPayload = {
        address: {
          streetAddress: params.address,
          city: params.city,
          state: params.state,
          zip: params.zip,
          country: 'US'
        },
        productType: this.mapReportType(params.reportType || 'BidPerfect'),
        referenceId: params.referenceId,
        // Optional: webhook for status updates
        callbackUrl: params.callbackUrl || process.env.EAGLEVIEW_WEBHOOK_URL,
        // Structure selection
        measurementInstructions: {
          structureType: 'PrimaryStructure', // or 'AllStructures'
          includeOutbuildings: false
        }
      };

      const response = await client.post('/v2/order', orderPayload);

      console.log(`[EagleView] Order submitted: ${response.data.orderId}`);

      return {
        success: true,
        orderId: response.data.orderId,
        status: response.data.status,
        estimatedDelivery: response.data.estimatedDeliveryDate
      };
    } catch (error) {
      console.error('[EagleView] Order failed:', error.response?.data || error.message);
      throw new Error(`EagleView order failed: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Map friendly report type names to EagleView product codes
   */
  mapReportType(type) {
    const types = {
      'BidPerfect': 'BID_PERFECT',
      'Premium': 'PREMIUM_REPORT',
      'PremiumExpress': 'PREMIUM_EXPRESS',
      'Premium3Hour': 'PREMIUM_3HOUR'
    };
    return types[type] || 'BID_PERFECT';
  }

  // ===========================================
  // ORDER STATUS
  // ===========================================

  /**
   * Check the status of an order
   * @param {string} orderId - EagleView order ID
   */
  async getOrderStatus(orderId) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/v2/order/${orderId}/status`);

      return {
        orderId: orderId,
        status: response.data.status,
        statusMessage: response.data.statusMessage,
        percentComplete: response.data.percentComplete,
        estimatedDelivery: response.data.estimatedDeliveryDate
      };
    } catch (error) {
      console.error('[EagleView] Status check failed:', error.response?.data || error.message);
      throw new Error('Failed to get order status');
    }
  }

  // ===========================================
  // REPORT RETRIEVAL
  // ===========================================

  /**
   * Get completed report data
   * @param {string} orderId - EagleView order ID
   */
  async getReport(orderId) {
    try {
      const client = await this.getClient();
      const response = await client.get(`/v2/order/${orderId}/report`);

      // Extract the key measurements we need
      const report = response.data;

      return {
        orderId: orderId,
        measurements: {
          totalRoofArea: report.roofMeasurements?.totalArea || 0,
          totalSquares: Math.ceil((report.roofMeasurements?.totalArea || 0) / 100),
          predominantPitch: report.roofMeasurements?.predominantPitch || 'Unknown',
          numberOfFacets: report.roofMeasurements?.facetCount || 0,
          ridgeLength: report.roofMeasurements?.ridgeLength || 0,
          hipLength: report.roofMeasurements?.hipLength || 0,
          valleyLength: report.roofMeasurements?.valleyLength || 0,
          eaveLength: report.roofMeasurements?.eaveLength || 0,
          rakeLength: report.roofMeasurements?.rakeLength || 0
        },
        property: {
          address: report.propertyAddress,
          roofType: report.roofType,
          stories: report.stories,
          yearBuilt: report.yearBuilt
        },
        files: {
          pdfUrl: report.files?.pdf,
          xmlUrl: report.files?.xml,
          jsonUrl: report.files?.json
        },
        raw: report // Keep raw data for debugging
      };
    } catch (error) {
      console.error('[EagleView] Report retrieval failed:', error.response?.data || error.message);
      throw new Error('Failed to retrieve report');
    }
  }

  /**
   * Get instant property data (if available in EagleView's cache)
   * This is faster than ordering a new report
   * @param {string} address - Full address string
   */
  async getInstantData(address) {
    try {
      const client = await this.getClient();
      const response = await client.get('/v2/property/instant', {
        params: { address }
      });

      if (response.data && response.data.available) {
        return {
          available: true,
          data: {
            totalRoofArea: response.data.roofArea,
            predominantPitch: response.data.pitch,
            facetCount: response.data.facets,
            roofType: response.data.material,
            confidence: response.data.confidence
          }
        };
      }

      return { available: false };
    } catch (error) {
      // Instant data not available - not an error, just means we need to order
      return { available: false };
    }
  }
}

// Export singleton instance
module.exports = new EagleViewService();
