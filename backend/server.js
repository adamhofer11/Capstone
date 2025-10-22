const express = require('express');
const axios = require('axios');
const cors = require('cors');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 4000;

// Middleware
app.use(cors());
app.use(express.json());

// Serve static files from frontend directory
app.use(express.static('../frontend'));

// In-memory cache with TTL
const cache = new Map();
const CACHE_TTL = 60 * 1000; // 60 seconds

// Cache helper functions
function getCacheKey(url, params) {
  return `${url}?${new URLSearchParams(params).toString()}`;
}

function getFromCache(key) {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }
  if (cached) {
    cache.delete(key); // Remove expired cache
  }
  return null;
}

function setCache(key, data) {
  cache.set(key, {
    data,
    timestamp: Date.now()
  });
}

// Guardian API configuration
const GUARDIAN_API_KEY = process.env.GUARDIAN_API_KEY;
const GUARDIAN_BASE_URL = 'https://content.guardianapis.com';
const MOCK_MODE = !GUARDIAN_API_KEY;

// OpenAI configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

// Mock data for when no API key is provided
const mockData = {
  topics: [
    'world', 'us-news', 'business', 'technology', 
    'sport', 'culture', 'science', 'health', 'politics'
  ],
  articles: [
    {
      id: 'mock-1',
      title: 'Sample World News Article',
      url: 'https://example.com/world-news',
      sectionId: 'world',
      sectionName: 'World news',
      publishedAt: new Date().toISOString()
    },
    {
      id: 'mock-2', 
      title: 'Sample Technology Article',
      url: 'https://example.com/tech-news',
      sectionId: 'technology',
      sectionName: 'Technology',
      publishedAt: new Date().toISOString()
    }
  ]
};

// Helper function to transform Guardian API response
function transformArticle(article) {
  return {
    id: article.id,
    title: article.webTitle,
    url: article.webUrl,
    sectionId: article.sectionId,
    sectionName: article.sectionName,
    publishedAt: article.webPublicationDate
  };
}

// Guardian articles endpoint
app.get('/api/guardian', async (req, res) => {
  try {
    const { section, q, limit = 6 } = req.query;
    
    if (MOCK_MODE) {
      // Return mock data when no API key
      const mockArticles = [
        {
          id: 'mock-1',
          title: 'Sample Technology Article',
          url: 'https://example.com/tech-news',
          sectionId: 'technology',
          sectionName: 'Technology',
          date: new Date().toISOString(),
          trailText: 'This is a sample article about technology trends.',
          bodyText: 'This is the full body text of the sample article. It contains detailed information about the topic.'
        }
      ];
      
      return res.json({ items: mockArticles });
    }

    // Build Guardian API URL
    const params = {
      'api-key': GUARDIAN_API_KEY,
      'show-fields': 'trailText,bodyText',
      'page-size': limit,
      'order-by': 'newest'
    };

    if (section) params.section = section;
    if (q) params.q = q;

    const cacheKey = getCacheKey(`${GUARDIAN_BASE_URL}/search`, params);
    const cachedResult = getFromCache(cacheKey);
    
    if (cachedResult) {
      return res.json(cachedResult);
    }

    // Call Guardian API
    const response = await axios.get(`${GUARDIAN_BASE_URL}/search`, { params });
    
    if (response.data.response.status !== 'ok') {
      throw new Error(`Guardian API error: ${response.data.response.message}`);
    }

    const transformedResults = {
      items: response.data.response.results.map(article => ({
        id: article.id,
        title: article.webTitle,
        url: article.webUrl,
        sectionId: article.sectionId,
        sectionName: article.sectionName,
        date: article.webPublicationDate,
        trailText: article.fields?.trailText || '',
        bodyText: article.fields?.bodyText || ''
      }))
    };

    // Cache the result
    setCache(cacheKey, transformedResults);
    
    res.json(transformedResults);

  } catch (error) {
    console.error('Guardian API error:', error.message);
    res.status(500).json({ error: error.message || 'Failed to fetch articles' });
  }
});

    // AI Summarization endpoint
    app.post('/api/summarize', async (req, res) => {
      try {
        const { text, title } = req.body;
        
        if (!text || !title) {
          return res.status(400).json({ error: 'Text and title are required' });
        }

        // Debug: Log the content being sent to AI
        console.log('AI Input - Title:', title);
        console.log('AI Input - Text length:', text.length);
        console.log('AI Input - Text preview:', text.substring(0, 200) + '...');

        if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_openai_api_key_here') {
          // Create a basic summary from the article content
          const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 20);
          const keySentences = sentences.slice(0, 3); // Take first 3 meaningful sentences
          const summary = keySentences.join('. ').trim() + '.';
          
          return res.json({ 
            summary: summary || 'Summary not available. Please read the full article for details.'
          });
        }

    // Call OpenAI API
    const response = await axios.post('https://api.openai.com/v1/chat/completions', {
      model: 'gpt-3.5-turbo',
      messages: [
        {
          role: 'system',
          content: 'You are a news fact extractor. Read the entire article and extract the specific facts, events, and details. Do NOT summarize or paraphrase. Extract the actual information from the article. Include specific names, dates, locations, numbers, quotes, and events mentioned in the article.'
        },
        {
          role: 'user',
          content: `Read this news article and extract the specific facts and details. Include names, dates, locations, numbers, quotes, and events mentioned in the article. Do not summarize - extract the actual information:\n\nTitle: "${title}"\n\nArticle Content:\n${text}`
        }
      ],
      max_tokens: 400,
      temperature: 0.7
    }, {
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    const summary = response.data.choices[0].message.content;
    res.json({ summary });

  } catch (error) {
    console.error('OpenAI API error:', error.message);
    res.status(500).json({ error: 'Failed to generate summary' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ ok: true });
});

// Topics endpoint
app.get('/api/topics', (req, res) => {
  res.json(mockData.topics);
});

// Search endpoint
app.get('/api/search', async (req, res) => {
  try {
    const { q, section, page = 1 } = req.query;
    
    if (MOCK_MODE) {
      // Return mock data when no API key
      const filteredArticles = mockData.articles.filter(article => {
        if (section && article.sectionId !== section) return false;
        if (q && !article.title.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
      });
      
      return res.json({
        results: filteredArticles,
        total: filteredArticles.length,
        page: parseInt(page),
        mockMode: true
      });
    }

    // Build Guardian API URL
    const params = {
      'api-key': GUARDIAN_API_KEY,
      'show-fields': 'headline,trailText',
      'page-size': 10,
      'page': page
    };

    if (q) params.q = q;
    if (section) params.section = section;

    const cacheKey = getCacheKey(`${GUARDIAN_BASE_URL}/search`, params);
    const cachedResult = getFromCache(cacheKey);
    
    if (cachedResult) {
      return res.json(cachedResult);
    }

    // Call Guardian API
    const response = await axios.get(`${GUARDIAN_BASE_URL}/search`, { params });
    
    if (response.data.response.status !== 'ok') {
      throw new Error(`Guardian API error: ${response.data.response.message}`);
    }

    const transformedResults = {
      results: response.data.response.results.map(transformArticle),
      total: response.data.response.total,
      page: response.data.response.currentPage,
      mockMode: false
    };

    // Cache the result
    setCache(cacheKey, transformedResults);
    
    res.json(transformedResults);

  } catch (error) {
    console.error('Search error:', error.message);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

// Section endpoint
app.get('/api/section/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1 } = req.query;

    if (MOCK_MODE) {
      // Return mock data for the section
      const sectionArticles = mockData.articles.filter(article => article.sectionId === id);
      
      return res.json({
        results: sectionArticles,
        total: sectionArticles.length,
        page: parseInt(page),
        sectionId: id,
        mockMode: true
      });
    }

    const params = {
      'api-key': GUARDIAN_API_KEY,
      'section': id,
      'show-fields': 'headline,trailText',
      'page-size': 10,
      'page': page
    };

    const cacheKey = getCacheKey(`${GUARDIAN_BASE_URL}/search`, params);
    const cachedResult = getFromCache(cacheKey);
    
    if (cachedResult) {
      return res.json(cachedResult);
    }

    // Call Guardian API
    const response = await axios.get(`${GUARDIAN_BASE_URL}/search`, { params });
    
    if (response.data.response.status !== 'ok') {
      throw new Error(`Guardian API error: ${response.data.response.message}`);
    }

    const transformedResults = {
      results: response.data.response.results.map(transformArticle),
      total: response.data.response.total,
      page: response.data.response.currentPage,
      sectionId: id,
      mockMode: false
    };

    // Cache the result
    setCache(cacheKey, transformedResults);
    
    res.json(transformedResults);

  } catch (error) {
    console.error('Section error:', error.message);
    res.status(500).json({ 
      error: error.message || 'Internal server error' 
    });
  }
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Guardian API Proxy Server running on port ${PORT}`);
  console.log(`API Key configured: ${GUARDIAN_API_KEY ? 'Yes' : 'No (Mock Mode)'}`);
  console.log(`Health check: http://localhost:${PORT}/api/health`);
  console.log(`Available topics: http://localhost:${PORT}/api/topics`);
  console.log(`Search: http://localhost:${PORT}/api/search?q=technology`);
  console.log(`Section: http://localhost:${PORT}/api/section/technology`);
});
