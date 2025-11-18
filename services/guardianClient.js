const axios = require('axios');
const { GUARDIAN_API_KEY } = require('../config/apiKeys');

const GUARDIAN_BASE_URL = 'https://content.guardianapis.com';

/**
 * Fetches articles from The Guardian API
 * @param {Object} params - Query parameters
 * @param {string} params.query - Search term/topic
 * @param {string} [params.country] - Country code (e.g., 'us')
 * @param {string} [params.category] - Category (e.g., 'sports', 'business')
 * @returns {Promise<Array>} Array of raw Guardian articles
 */
async function fetchGuardianArticles({ query, country, category }) {
  try {
    if (!GUARDIAN_API_KEY) {
      console.warn('[Guardian] No API key provided, returning empty array');
      return [];
    }

    const params = {
      'api-key': GUARDIAN_API_KEY,
      'show-fields': 'trailText,bodyText,thumbnail',
      'show-tags': 'all',
      'page-size': 50,
      'order-by': 'newest'
    };

    // Add section if category provided
    if (category) {
      // Map common categories to Guardian section IDs
      const categoryMap = {
        'sports': 'sport',
        'business': 'business',
        'technology': 'technology',
        'politics': 'politics',
        'health': 'health',
        'science': 'science',
        'entertainment': 'culture',
        'world': 'world',
        'us': 'us-news'
      };
      params.section = categoryMap[category] || category;
    }

    // Build query with country filter if provided
    let searchQuery = query || '';
    if (country) {
      const countryName = getCountryName(country);
      if (countryName) {
        const countryTerms = [countryName, country.toUpperCase()].map(term => `"${term}"`).join(' OR ');
        searchQuery = searchQuery 
          ? `(${searchQuery}) AND (${countryTerms})`
          : countryTerms;
      }
    }
    if (searchQuery) {
      params.q = searchQuery;
    }

    console.log('[Guardian] Fetching articles:', { query, country, category, params });

    const response = await axios.get(`${GUARDIAN_BASE_URL}/search`, { params });
    
    if (response.data.response.status !== 'ok') {
      throw new Error(`Guardian API error: ${response.data.response.message}`);
    }

    const articles = response.data.response.results || [];
    console.log(`[Guardian] Returned ${articles.length} articles`);
    
    // Verify we have real article data
    if (articles.length > 0) {
      console.log('[Guardian] Sample article structure:', {
        hasTitle: !!articles[0].webTitle,
        hasUrl: !!articles[0].webUrl,
        hasDescription: !!articles[0].fields?.trailText,
        fields: Object.keys(articles[0]).slice(0, 5)
      });
    }
    
    return articles;

  } catch (error) {
    console.error('[Guardian] Error fetching articles:', error.message);
    throw error;
  }
}

/**
 * Helper to get country name from code
 */
function getCountryName(countryCode) {
  const countryMap = {
    'us': 'United States',
    'gb': 'United Kingdom',
    'ca': 'Canada',
    'au': 'Australia',
    'de': 'Germany',
    'fr': 'France',
    'it': 'Italy',
    'es': 'Spain',
    'jp': 'Japan',
    'cn': 'China',
    'in': 'India',
    'br': 'Brazil',
    'mx': 'Mexico',
    'ru': 'Russia',
    'kr': 'South Korea'
  };
  return countryMap[countryCode?.toLowerCase()] || null;
}

module.exports = { fetchGuardianArticles };

