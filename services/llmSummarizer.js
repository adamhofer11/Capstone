const axios = require('axios');
const { OPENAI_API_KEY, LLM_API_URL, LLM_MODEL } = require('../config/apiKeys');

/**
 * @typedef {Object} GroupSummary
 * @property {string} groupId - Group identifier
 * @property {string} groupTitle - Neutral, relative title for the story group (headline-style, not from any single source)
 * @property {string} summary - Combined neutral summary of all articles
 * @property {string} detailedComparison - Detailed explanation of how sources differ
 * @property {string} simpleComparison - Short, simple comparison (1-2 sentences)
 * @property {Array<string>} differences - Array of differences (for backward compatibility)
 */

/**
 * Summarizes a group of articles and compares how sources differ
 * @param {Object} group - Article group with groupId and articles array
 * @returns {Promise<GroupSummary>}
 */
async function summarizeArticleGroup(group) {
  try {
    if (!group.articles || group.articles.length === 0) {
      return {
        groupId: group.groupId,
        groupTitle: 'News Story',
        summary: 'No articles to summarize.',
        detailedComparison: 'No articles available for comparison.',
        simpleComparison: 'No articles available for comparison.',
        differences: []
      };
    }

    // If only one article, return simple summary
    if (group.articles.length === 1) {
      const article = group.articles[0];
      const summary = article.description || article.title;
      // Generate a neutral title from the article title/description (remove source-specific phrasing if possible)
      const neutralTitle = generateNeutralTitle(article.title, article.description, summary);
      return {
        groupId: group.groupId,
        groupTitle: neutralTitle,
        summary: summary,
        detailedComparison: `Only covered by ${article.source}.`,
        simpleComparison: `Only covered by ${article.source}.`,
        differences: [`Only covered by ${article.source}.`]
      };
    }

    // Build prompt with ALL articles in the group, regardless of source
    // IMPORTANT: The summarizer considers every article in the group, from all sources,
    // to create one combined summary and comparison. This ensures multi-source aggregation.
    const articlesText = group.articles.map((article, index) => {
      return `[${article.source.toUpperCase()} - Article ${index + 1}]
Title: ${article.title}
Description: ${article.description || 'No description'}
Content: ${article.content?.substring(0, 500) || article.description || 'No content available'}
URL: ${article.url}
Published: ${article.publishedAt || 'Unknown date'}
---`;
    }).join('\n\n');
    
    // Log source breakdown for this group
    const sourcesInGroup = [...new Set(group.articles.map(a => a.source))];
    console.log(`[LLM] Summarizing group ${group.groupId} with ${group.articles.length} articles from ${sourcesInGroup.length} source(s): ${sourcesInGroup.join(', ')}`);

    // Build source names list for the prompt
    const sourceNames = [...new Set(group.articles.map(a => a.source))].map(s => {
      const nameMap = { 'guardian': 'The Guardian', 'gdelt': 'GDELT', 'currents': 'Currents' };
      return nameMap[s] || s;
    }).join(', ');

    const prompt = `You are analyzing multiple news articles about the same story from different sources.

Here are the articles:

${articlesText}

CRITICAL REQUIREMENT: You must explicitly and directly state how these articles differ from each other. Do not just imply differences - state them clearly.

Please provide a JSON response with the following structure:
{
  "groupTitle": "A short, neutral headline-style title (5-12 words) that describes what the story is about as a whole. This should NOT be copied from any single source's headline. Instead, create a neutral, descriptive title based on the combined content. Examples: 'Government announces new climate targets', 'Local protests over tuition increases', 'Tech company reports quarterly earnings'. Make it clear and descriptive but neutral.",
  "summary": "A neutral summary (aim for approximately 250 words or less) that combines the key facts that all sources agree on. The summary should be comprehensive but concise, covering the main points of the story.",
  "detailedComparison": "A clear paragraph (3-5 sentences) that explicitly compares the sources. Name each source (The Guardian, GDELT, Currents, etc.) and state what each one emphasizes, what unique details each includes, and any differences in tone. Use direct language like 'The Guardian focuses on X, while GDELT emphasizes Y, and Currents mentions Z that the others do not discuss.'",
  "simpleComparison": "A very short comparison (1-2 sentences) that answers: 'What is the main way these articles are different from each other?' This should be concise and easy to read. Example: 'The Guardian emphasizes political reactions, while GDELT focuses on data and Currents highlights local community impact.'",
  "differences": [
    "The Guardian focuses on [specific aspect]...",
    "Currents emphasizes [different angle]...",
    "GDELT highlights [unique detail]..."
  ]
}

IMPORTANT INSTRUCTIONS:
1. The summary should be neutral and combine facts all sources agree on. Aim for approximately 250 words or less, but it can be longer if necessary to cover all key points.
2. The detailedComparison MUST explicitly name each source and state what makes each one different
3. The simpleComparison should be very brief (1-2 sentences) and capture the main difference
4. For each source, clearly state:
   - What facts or aspects it emphasizes more
   - What unique details it includes that others don't
   - Differences in tone (more critical, optimistic, data-focused, etc.)
5. Use direct, plain language. Examples of good phrasing:
   - "The Guardian focuses more on political reactions, while GDELT highlights data about protests and Currents mentions local community impact that the others do not discuss."
   - "Both articles describe the same event, but The Guardian spends more time on economic consequences, while Currents focuses on human interest stories."
   - "These sources agree on the main facts but differ in tone: The Guardian is more cautious while Currents is more optimistic about the outcome."

Return ONLY valid JSON, no other text.`;

    // Call LLM API
    // TODO: Replace this with your actual LLM endpoint
    // If using OpenAI-compatible API:
    let response;
    
    if (!OPENAI_API_KEY || OPENAI_API_KEY === 'your_api_key_here') {
      // Fallback: Generate basic summary without LLM
      console.warn('[LLM] No API key provided, generating basic summary');
      return generateBasicSummary(group);
    }

    try {
      response = await axios.post(LLM_API_URL, {
        model: LLM_MODEL,
        messages: [
          {
            role: 'system',
            content: 'You are a news analysis assistant. Always respond with valid JSON only.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 1200, // Increased for detailed and simple comparisons
        temperature: 0.7,
        response_format: { type: 'json_object' } // Request JSON format
      }, {
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 30000 // 30 second timeout
      });

      // Parse response
      const content = response.data.choices[0].message.content;
      let parsed;
      
      try {
        // Try to parse JSON directly
        parsed = JSON.parse(content);
      } catch (e) {
        // If parsing fails, try to extract JSON from markdown code blocks
        const jsonMatch = content.match(/```(?:json)?\s*(\{[\s\S]*\})\s*```/);
        if (jsonMatch) {
          parsed = JSON.parse(jsonMatch[1]);
        } else {
          throw new Error('Could not parse JSON from response');
        }
      }

      const summary = parsed.summary || 'Summary not available.';
      // CRITICAL: Always generate title from summary, never use generic fallback
      let groupTitle = parsed.groupTitle;
      // Check for generic titles (case-insensitive)
      const genericPatterns = ['news story', 'story 1', 'story 2', 'story 3', 'latest news', 'news coverage', 'story from'];
      const isGeneric = !groupTitle || 
                       genericPatterns.some(pattern => groupTitle.toLowerCase().includes(pattern)) ||
                       /^story\s+\d+$/i.test(groupTitle) ||
                       groupTitle.length < 10;
      
      if (isGeneric) {
        // Generate title from summary if LLM didn't provide a good one
        groupTitle = generateNeutralTitle(group.articles[0]?.title, group.articles[0]?.description, summary);
      }
      
      return {
        groupId: group.groupId,
        groupTitle: groupTitle,
        summary: summary,
        detailedComparison: parsed.detailedComparison || parsed.differences?.join(' ') || 'Comparison not available.',
        simpleComparison: parsed.simpleComparison || parsed.differences?.[0] || 'Articles differ in their focus and emphasis.',
        differences: Array.isArray(parsed.differences) ? parsed.differences : []
      };

    } catch (apiError) {
      console.error('[LLM] API error:', apiError.message);
      // Fallback to basic summary
      return generateBasicSummary(group);
    }

  } catch (error) {
    console.error('[LLM] Error summarizing group:', error.message);
    // Return fallback summary
    const sources = [...new Set(group.articles.map(a => a.source))];
    const sourceNames = sources.map(s => {
      const nameMap = { 'guardian': 'The Guardian', 'gdelt': 'GDELT', 'currents': 'Currents' };
      return nameMap[s] || s;
    }).join(', ');
    
    const summary = `Multiple sources (${sourceNames}) covered this story.`;
    // CRITICAL: Always generate title from summary, never use generic fallback
    const groupTitle = generateNeutralTitle(group.articles[0]?.title, group.articles[0]?.description, summary);
    return {
      groupId: group.groupId,
      groupTitle: groupTitle,
      summary: summary,
      detailedComparison: `This story was covered by ${sourceNames}. Each source provides its own perspective on the events.`,
      simpleComparison: `Covered by ${sourceNames} with different perspectives.`,
      differences: group.articles.map(a => `${a.source}: ${a.title}`)
    };
  }
}

/**
 * Generates a basic summary without LLM (fallback)
 */
function generateBasicSummary(group) {
  const sources = [...new Set(group.articles.map(a => a.source))];
  const sourceNames = sources.map(s => {
    const nameMap = { 'guardian': 'The Guardian', 'gdelt': 'GDELT', 'currents': 'Currents' };
    return nameMap[s] || s;
  });
  
  const titles = group.articles.map(a => a.title).join('; ');
  const descriptions = group.articles
    .map(a => a.description)
    .filter(Boolean)
    .slice(0, 2)
    .join(' ');

  // Generate basic comparisons
  let detailedComparison = `This story was covered by ${sourceNames.join(', ')}. `;
  if (sources.length === 2) {
    detailedComparison += `Each source provides its own perspective on the events.`;
  } else {
    detailedComparison += `Each source offers a different angle on the story.`;
  }

  let simpleComparison = '';
  if (sources.length === 2) {
    simpleComparison = `${sourceNames[0]} and ${sourceNames[1]} cover this story with different perspectives.`;
  } else {
    simpleComparison = `Covered by ${sourceNames.join(', ')} with varying perspectives.`;
  }

  const summary = descriptions || titles || 'Multiple sources covered this story.';
  // CRITICAL: Always generate title from summary, never use generic fallback
  const groupTitle = generateNeutralTitle(group.articles[0]?.title, group.articles[0]?.description, summary);
  return {
    groupId: group.groupId,
    groupTitle: groupTitle,
    summary: summary,
    detailedComparison: detailedComparison,
    simpleComparison: simpleComparison,
    differences: sources.map(source => {
      const sourceArticles = group.articles.filter(a => a.source === source);
      return `${source}: ${sourceArticles.length} article(s) - ${sourceArticles[0].title}`;
    })
  };
}

/**
 * Generates a neutral, relative title from article title/description/summary
 * Attempts to create a headline-style title that's not source-specific
 * @param {string} title - Article title
 * @param {string} description - Article description
 * @param {string} summary - Optional group summary to extract title from
 */
function generateNeutralTitle(title, description, summary) {
  // CRITICAL: Always extract title from summary - never return generic labels
  // The summary is the source of truth for what the story is about
  
  if (summary && summary.length > 10) {
    // Strategy 1: Try to extract key phrases with action verbs
    const actionPatterns = [
      /([A-Z][^.!?]{0,50}(?:announces|announced|approves|approved|rejects|rejected|proposes|proposed|implements|implemented|introduces|introduced|launches|launched|reveals|revealed|confirms|confirmed|denies|denied|reports|reported)[^.!?]{0,50})/i,
      /([A-Z][^.!?]{0,50}(?:protest|protests|protesting|strike|strikes|striking|election|elections|meeting|meetings|decision|decisions|policy|policies|law|laws|bill|bills|plan|plans)[^.!?]{0,40})/i,
      /([A-Z][^.!?]{0,50}(?:breaks|breaking|happens|happened|occurs|occurred|develops|developed|emerges|emerged)[^.!?]{0,40})/i
    ];
    
    for (const pattern of actionPatterns) {
      const match = summary.match(pattern);
      if (match && match[1]) {
        let phrase = match[1].trim();
        // Clean up the phrase
        phrase = phrase
          .replace(/^(This story|The story|This article|The article|According to|Reports indicate|Sources say|Multiple sources)/i, '')
          .trim();
        
        if (phrase.length >= 20 && phrase.length <= 100) {
          // Capitalize first letter
          phrase = phrase.charAt(0).toUpperCase() + phrase.slice(1);
          // Truncate if needed at word boundary
          if (phrase.length > 100) {
            const truncated = phrase.substring(0, 97);
            const lastSpace = truncated.lastIndexOf(' ');
            if (lastSpace > 50) {
              phrase = truncated.substring(0, lastSpace);
            } else {
              phrase = truncated;
            }
          }
          return phrase;
        }
      }
    }
    
    // Strategy 2: Extract first sentence and clean it up
    const firstSentence = summary.split(/[.!?]/)[0].trim();
    if (firstSentence.length > 15) {
      let neutral = firstSentence
        .replace(/^(This story|The story|This article|The article|According to|Reports indicate|Sources say|Multiple sources|The news|A story|In|On|At|The|A|An)\s+/i, '')
        .replace(/^(that|which|who|where|when|what|how)\s+/i, '')
        .trim();
      
      // Capitalize first letter
      if (neutral.length > 0) {
        neutral = neutral.charAt(0).toUpperCase() + neutral.slice(1);
      }
      
      // Check if it's a good length (headline style: 5-15 words, 20-100 chars)
      const wordCount = neutral.split(/\s+/).length;
      if (wordCount >= 3 && wordCount <= 15 && neutral.length >= 20 && neutral.length <= 100) {
        return neutral;
      }
      
      // If too long, truncate intelligently
      if (neutral.length > 100) {
        const truncated = neutral.substring(0, 97);
        const lastSpace = truncated.lastIndexOf(' ');
        if (lastSpace > 50) {
          neutral = truncated.substring(0, lastSpace);
        } else {
          neutral = truncated;
        }
        if (neutral.length >= 20) {
          return neutral;
        }
      }
    }
    
    // Strategy 3: Extract first meaningful chunk (first 60-80 chars, at word boundary)
    if (summary.length > 20) {
      let chunk = summary.substring(0, 80).trim();
      const lastSpace = chunk.lastIndexOf(' ');
      if (lastSpace > 30) {
        chunk = chunk.substring(0, lastSpace);
      }
      
      // Clean up
      chunk = chunk
        .replace(/^(This story|The story|This article|The article|According to|Reports indicate|Sources say|Multiple sources|The news|A story|In|On|At|The|A|An)\s+/i, '')
        .trim();
      
      if (chunk.length >= 20) {
        chunk = chunk.charAt(0).toUpperCase() + chunk.slice(1);
        return chunk;
      }
    }
    
    // Strategy 4: Last resort - use first part of summary, even if short
    // This ensures we NEVER return a generic label
    let finalFallback = summary.substring(0, 70).trim();
    const lastSpace = finalFallback.lastIndexOf(' ');
    if (lastSpace > 20) {
      finalFallback = finalFallback.substring(0, lastSpace);
    }
    finalFallback = finalFallback
      .replace(/^(This story|The story|This article|The article|According to|Reports indicate|Sources say|Multiple sources)/i, '')
      .trim();
    
    if (finalFallback.length >= 15) {
      return finalFallback.charAt(0).toUpperCase() + finalFallback.slice(1);
    }
  }
  
  // If summary is too short or missing, try title/description but clean it up
  if (title) {
    let neutral = title
      .replace(/^(BREAKING|EXCLUSIVE|UPDATE|LIVE):\s*/i, '')
      .replace(/\s*-\s*(The Guardian|Guardian|GDELT|Currents|Reuters|AP|BBC).*$/i, '')
      .trim();
    
    if (neutral.length >= 15 && neutral.length <= 100) {
      return neutral;
    }
    
    // Truncate if needed
    if (neutral.length > 100) {
      const truncated = neutral.substring(0, 97);
      const lastSpace = truncated.lastIndexOf(' ');
      if (lastSpace > 50) {
        neutral = truncated.substring(0, lastSpace);
      } else {
        neutral = truncated;
      }
    }
    
    if (neutral.length >= 15) {
      return neutral;
    }
  }
  
  // Absolute last resort: use description if available
  if (description && description.length > 20) {
    const firstSentence = description.split(/[.!?]/)[0].trim();
    if (firstSentence.length >= 15 && firstSentence.length <= 100) {
      return firstSentence.charAt(0).toUpperCase() + firstSentence.slice(1);
    }
  }
  
  // If we have ANY summary text, use a portion of it
  // This should never be reached if summary exists, but just in case
  if (summary && summary.length > 0) {
    const chunk = summary.substring(0, 60).trim();
    const lastSpace = chunk.lastIndexOf(' ');
    if (lastSpace > 15) {
      return chunk.substring(0, lastSpace).charAt(0).toUpperCase() + chunk.substring(0, lastSpace).slice(1);
    }
    return chunk.charAt(0).toUpperCase() + chunk.slice(1);
  }
  
  // This should never happen, but if it does, use title as-is
  return title ? title.substring(0, 80).trim() : 'Story from multiple sources';
}

module.exports = {
  summarizeArticleGroup,
  generateNeutralTitle
};

