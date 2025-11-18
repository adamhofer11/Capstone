const axios = require('axios');
const { GDELT_API_KEY } = require('../config/apiKeys');

// GDELT API documentation: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
// Free tier doesn't require API key, but rate limits apply
const GDELT_BASE_URL = 'https://api.gdeltproject.org/api/v2/doc/doc';

/**
 * Fetches articles from GDELT API
 * GDELT provides news articles from various sources
 * @param {Object} params - Query parameters
 * @param {string} params.query - Search term/topic
 * @param {string} [params.country] - Country code (e.g., 'us')
 * @param {string} [params.category] - Category (not directly supported, but can filter)
 * @returns {Promise<Array>} Array of raw GDELT articles
 */
async function fetchGdeltArticles({ query, country, category }) {
  try {
    // GDELT API documentation: https://blog.gdeltproject.org/gdelt-doc-2-0-api-debuts/
    // Free tier doesn't require API key, but rate limits apply
    
    const params = {
      query: query || '*', // Default to all if no query
      mode: 'artlist', // Return article list
      maxrecords: 50,
      format: 'json',
      sort: 'date'
    };

    // Add country filter if provided
    // GDELT uses country codes in query format: sourcecountry:US
    if (country) {
      const countryCode = country.toUpperCase();
      params.query = params.query === '*' 
        ? `sourcecountry:${countryCode}`
        : `${params.query} sourcecountry:${countryCode}`;
    }

    // Category filtering - GDELT uses themes, but we'll keep it simple
    // You can extend this with GDELT theme codes if needed
    if (category && category !== '*') {
      // For now, just add category to query terms
      params.query = params.query === '*' 
        ? category
        : `${params.query} ${category}`;
    }

    console.log('[GDELT] Fetching articles:', { query, country, category, params });

    const response = await axios.get(GDELT_BASE_URL, { 
      params,
      timeout: 15000 // 15 second timeout
    });

    // GDELT response structure varies - handle multiple formats
    let articleList = [];
    
    // Check if response.data is an array
    if (Array.isArray(response.data)) {
      articleList = response.data;
    }
    // Check if response.data.articles exists
    else if (response.data?.articles && Array.isArray(response.data.articles)) {
      articleList = response.data.articles;
    }
    // Check if response.data has article-like objects at root
    else if (response.data && typeof response.data === 'object') {
      // Try to find array of articles in response
      const keys = Object.keys(response.data);
      for (const key of keys) {
        if (Array.isArray(response.data[key]) && response.data[key].length > 0) {
          // Check if first item looks like an article (has url or title)
          const firstItem = response.data[key][0];
          if (firstItem && (firstItem.url || firstItem.title || firstItem.articleurl)) {
            articleList = response.data[key];
            break;
          }
        }
      }
    }

    console.log(`[GDELT] Returned ${articleList.length} articles`);
    
    // Verify we have real article data
    if (articleList.length > 0) {
      console.log('[GDELT] Sample article structure:', {
        hasTitle: !!articleList[0].title,
        hasUrl: !!articleList[0].url,
        hasDescription: !!articleList[0].snippet,
        fields: Object.keys(articleList[0]).slice(0, 5)
      });
    } else {
      console.warn('[GDELT] No articles found in response. Response structure:', {
        isArray: Array.isArray(response.data),
        hasArticles: !!response.data?.articles,
        topLevelKeys: response.data ? Object.keys(response.data).slice(0, 5) : []
      });
    }
    
    return articleList;

  } catch (error) {
    console.error('[GDELT] Error fetching articles:', error.message);
    // GDELT can be unreliable, return empty array instead of throwing
    // This allows other sources to still work
    console.warn('[GDELT] Returning empty array due to error');
    return [];
  }
}

module.exports = { fetchGdeltArticles };

