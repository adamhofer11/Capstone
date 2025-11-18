const axios = require('axios');
const { CURRENTS_API_KEY } = require('../config/apiKeys');

const CURRENTS_BASE_URL = 'https://api.currentsapi.services/v1';

/**
 * Fetches articles from Currents API
 * Currents API documentation: https://currentsapi.services/en/docs
 * @param {Object} params - Query parameters
 * @param {string} params.query - Search term/topic
 * @param {string} [params.country] - Country code (e.g., 'us')
 * @param {string} [params.category] - Category (e.g., 'sports', 'business')
 * @returns {Promise<Array>} Array of raw Currents articles
 */
async function fetchCurrentsArticles({ query, country, category }) {
  try {
    if (!CURRENTS_API_KEY) {
      console.warn('[Currents] No API key provided, returning empty array');
      return [];
    }

    const params = {
      apiKey: CURRENTS_API_KEY,
      language: 'en',
      pageSize: 50
    };

    // Add keywords/search query
    if (query) {
      params.keywords = query;
    }

    // Add country filter (Currents uses country code)
    if (country) {
      params.country = country.toLowerCase();
    }

    // Add category filter
    if (category) {
      // Map common categories to Currents categories
      const categoryMap = {
        'sports': 'sports',
        'business': 'business',
        'technology': 'technology',
        'politics': 'politics',
        'health': 'health',
        'science': 'science',
        'entertainment': 'entertainment',
        'general': 'general'
      };
      const currentsCategory = categoryMap[category] || category;
      params.category = currentsCategory;
    }

    console.log('[Currents] Fetching articles:', { query, country, category, params: { ...params, apiKey: '***' } });

    // Currents API endpoint: /latest-news or /search
    // Use /latest-news if no query, /search if query provided
    const endpoint = query ? `${CURRENTS_BASE_URL}/search` : `${CURRENTS_BASE_URL}/latest-news`;
    
    console.log('[Currents] Calling endpoint:', endpoint);
    
    const response = await axios.get(endpoint, { 
      params,
      timeout: 15000
    });

    // Currents API response structure: { status: 'ok', news: [...] }
    // Check for error status
    if (response.data.status && response.data.status !== 'ok') {
      throw new Error(`Currents API error: ${response.data.message || 'Unknown error'}`);
    }

    // Currents API returns articles in news array
    const articles = response.data?.news || [];
    
    // If no articles in news, check for data array (some endpoints use this)
    if (articles.length === 0 && Array.isArray(response.data?.data)) {
      return response.data.data;
    }
    console.log(`[Currents] Returned ${articles.length} articles`);
    
    // Verify we have real article data
    if (articles.length > 0) {
      console.log('[Currents] Sample article structure:', {
        hasTitle: !!articles[0].title,
        hasUrl: !!articles[0].url,
        hasDescription: !!articles[0].description,
        fields: Object.keys(articles[0]).slice(0, 5)
      });
    }
    
    return articles;

  } catch (error) {
    console.error('[Currents] Error fetching articles:', error.message);
    if (error.response) {
      console.error('[Currents] API response status:', error.response.status);
      console.error('[Currents] API response data:', error.response.data);
    }
    // Return empty array to allow other sources to work
    console.warn('[Currents] Returning empty array due to error');
    return [];
  }
}

module.exports = { fetchCurrentsArticles };

