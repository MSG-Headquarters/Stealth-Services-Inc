/**
 * Quote Calculation Service
 * 
 * Takes roof measurements and calculates pricing for:
 * - Roofing (shingle, metal, tile)
 * - Solar (standard, premium, premium + battery)
 * 
 * Uses EPC redline pricing + COVRD markup
 */

// ===========================================
// PRICING CONFIGURATION
// ===========================================

// Base prices per square foot (EPC Redline Pricing)
// These should be updated based on EPC agreement
const REDLINE_PRICING = {
  roofing: {
    shingle: {
      name: 'Architectural Shingles',
      pricePerSqFt: 3.50,      // EPC cost
      wasteFactor: 1.10,       // 10% waste
      minPrice: 5000
    },
    metal: {
      name: 'Standing Seam Metal',
      pricePerSqFt: 7.00,
      wasteFactor: 1.05,
      minPrice: 10000
    },
    tile: {
      name: 'Concrete Tile',
      pricePerSqFt: 9.50,
      wasteFactor: 1.08,
      minPrice: 15000
    }
  },
  solar: {
    standard: {
      name: 'Standard Solar Panels',
      pricePerSqFt: 2.00,
      minPrice: 8000
    },
    premium: {
      name: 'Premium Solar Panels',
      pricePerSqFt: 2.75,
      minPrice: 10000
    },
    premiumBattery: {
      name: 'Premium + Battery Storage',
      pricePerSqFt: 3.50,
      minPrice: 15000
    }
  }
};

// COVRD markup percentage (profit margin)
const COVRD_MARKUP = 0.25; // 25%

// Florida sales tax
const FL_SALES_TAX = 0.07;

// Pitch complexity multipliers
const PITCH_MULTIPLIERS = {
  'low': 1.0,      // 0-4/12
  'standard': 1.0,  // 5-7/12
  'steep': 1.15,    // 8-10/12
  'verysteep': 1.30 // 11+/12
};

// ===========================================
// CALCULATION FUNCTIONS
// ===========================================

class QuoteService {
  
  /**
   * Calculate a complete quote
   * @param {Object} params
   * @param {string} params.serviceType - 'roofing' | 'solar'
   * @param {string} params.material - Material selection key
   * @param {number} params.roofArea - Total roof area in sq ft
   * @param {string} params.pitch - Roof pitch category
   * @param {number} params.facets - Number of roof facets (complexity)
   */
  calculateQuote(params) {
    const { serviceType, material, roofArea, pitch = 'standard', facets = 1 } = params;

    // Get base pricing
    const pricing = REDLINE_PRICING[serviceType]?.[material];
    if (!pricing) {
      throw new Error(`Invalid service type or material: ${serviceType}/${material}`);
    }

    // Calculate base cost
    let baseCost = roofArea * pricing.pricePerSqFt;

    // Apply waste factor (roofing only)
    if (pricing.wasteFactor) {
      baseCost *= pricing.wasteFactor;
    }

    // Apply pitch complexity multiplier
    const pitchMultiplier = PITCH_MULTIPLIERS[pitch] || 1.0;
    baseCost *= pitchMultiplier;

    // Apply facet complexity (more facets = more labor)
    const facetMultiplier = this.getFacetMultiplier(facets);
    baseCost *= facetMultiplier;

    // Ensure minimum price
    baseCost = Math.max(baseCost, pricing.minPrice);

    // Calculate COVRD markup
    const markup = baseCost * COVRD_MARKUP;
    const subtotal = baseCost + markup;

    // Calculate tax
    const tax = subtotal * FL_SALES_TAX;
    const total = subtotal + tax;

    // Calculate monthly financing (assuming 12-year term, 6.99% APR)
    const monthlyPayment = this.calculateMonthlyPayment(total, 0.0699, 144);

    return {
      serviceType,
      material: pricing.name,
      measurements: {
        roofArea,
        pitch,
        facets
      },
      pricing: {
        redlineCost: Math.round(baseCost),
        covrdMarkup: Math.round(markup),
        subtotal: Math.round(subtotal),
        taxRate: FL_SALES_TAX,
        tax: Math.round(tax),
        total: Math.round(total)
      },
      financing: {
        monthlyPayment: Math.round(monthlyPayment),
        term: '144 months',
        apr: '6.99%',
        downPayment: 0
      },
      confidence: this.getConfidenceLevel(params),
      disclaimer: 'Estimate based on satellite measurements. Final price may vary after on-site inspection.',
      generatedAt: new Date().toISOString()
    };
  }

  /**
   * Get complexity multiplier based on number of facets
   */
  getFacetMultiplier(facets) {
    if (facets <= 4) return 1.0;
    if (facets <= 8) return 1.05;
    if (facets <= 12) return 1.10;
    return 1.15; // 13+ facets
  }

  /**
   * Calculate monthly payment (standard amortization)
   */
  calculateMonthlyPayment(principal, annualRate, months) {
    const monthlyRate = annualRate / 12;
    if (monthlyRate === 0) return principal / months;
    
    return principal * (monthlyRate * Math.pow(1 + monthlyRate, months)) / 
           (Math.pow(1 + monthlyRate, months) - 1);
  }

  /**
   * Determine quote confidence level based on data quality
   */
  getConfidenceLevel(params) {
    // High confidence if we have good EagleView data
    if (params.dataSource === 'eagleview' && params.roofArea > 0) {
      return { level: 'high', percentage: 95 };
    }
    // Medium if using cached/instant data
    if (params.dataSource === 'instant') {
      return { level: 'medium', percentage: 85 };
    }
    // Low if using estimates
    return { level: 'estimate', percentage: 70 };
  }

  /**
   * Generate quotes for all material options
   */
  generateAllQuotes(params) {
    const { serviceType, roofArea, pitch, facets } = params;
    
    const materials = Object.keys(REDLINE_PRICING[serviceType] || {});
    
    return materials.map(material => ({
      material,
      quote: this.calculateQuote({
        serviceType,
        material,
        roofArea,
        pitch,
        facets,
        dataSource: params.dataSource
      })
    }));
  }

  /**
   * Get pricing info for display (without calculation)
   */
  getPricingInfo() {
    const formatPricing = (category) => {
      return Object.entries(REDLINE_PRICING[category]).map(([key, value]) => ({
        id: key,
        name: value.name,
        displayPrice: `$${(value.pricePerSqFt * (1 + COVRD_MARKUP) * 1.07).toFixed(2)}/sq ft`,
        pricePerSqFt: value.pricePerSqFt * (1 + COVRD_MARKUP) * 1.07
      }));
    };

    return {
      roofing: formatPricing('roofing'),
      solar: formatPricing('solar'),
      markup: `${COVRD_MARKUP * 100}%`,
      taxRate: `${FL_SALES_TAX * 100}%`
    };
  }
}

module.exports = new QuoteService();
