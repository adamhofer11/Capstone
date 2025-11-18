/**
 * Groups similar articles across sources that cover the same story
 * Uses text similarity, publish time, and URL patterns
 */

/**
 * @typedef {Object} ArticleGroup
 * @property {string} groupId - Unique group identifier
 * @property {Array<NormalizedArticle>} articles - Articles in this group
 */

/**
 * Normalizes text for comparison (lowercase, remove punctuation, trim)
 */
function normalizeText(text) {
  if (!text) return '';
  return text
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ') // Remove punctuation
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();
}

/**
 * Extracts key terms from text (simple word extraction)
 */
function extractKeyTerms(text, maxTerms = 10) {
  const normalized = normalizeText(text);
  const words = normalized.split(/\s+/).filter(word => word.length > 3); // Filter short words
  const wordCounts = {};
  
  words.forEach(word => {
    wordCounts[word] = (wordCounts[word] || 0) + 1;
  });
  
  // Sort by frequency and take top terms
  return Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTerms)
    .map(([word]) => word);
}

/**
 * Calculates Jaccard similarity between two sets
 * Jaccard = intersection size / union size
 */
function jaccardSimilarity(set1, set2) {
  if (set1.size === 0 && set2.size === 0) return 1;
  if (set1.size === 0 || set2.size === 0) return 0;
  
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  const union = new Set([...set1, ...set2]);
  
  return intersection.size / union.size;
}

/**
 * Calculates text similarity between two articles
 * Combines title, description similarity and publish time proximity
 */
function calculateSimilarity(article1, article2) {
  // Extract key terms from title and description
  const text1 = `${article1.title} ${article1.description || ''}`;
  const text2 = `${article2.title} ${article2.description || ''}`;
  
  const terms1 = new Set(extractKeyTerms(text1));
  const terms2 = new Set(extractKeyTerms(text2));
  
  // Calculate Jaccard similarity
  const textSimilarity = jaccardSimilarity(terms1, terms2);
  
  // Check publish time proximity (within 7 days = bonus)
  let timeBonus = 0;
  if (article1.publishedAt && article2.publishedAt) {
    try {
      const date1 = new Date(article1.publishedAt);
      const date2 = new Date(article2.publishedAt);
      const daysDiff = Math.abs(date1 - date2) / (1000 * 60 * 60 * 24);
      
      if (daysDiff <= 7) {
        timeBonus = 0.1; // Small bonus for articles published close together
      }
    } catch (e) {
      // Invalid date, ignore
    }
  }
  
  // Check URL domain similarity (same domain = bonus)
  let urlBonus = 0;
  try {
    const url1 = new URL(article1.url);
    const url2 = new URL(article2.url);
    if (url1.hostname === url2.hostname) {
      urlBonus = 0.05; // Small bonus for same domain
    }
  } catch (e) {
    // Invalid URL, ignore
  }
  
  // Combined similarity score
  return Math.min(1, textSimilarity + timeBonus + urlBonus);
}

/**
 * Groups similar articles together ACROSS ALL SOURCES
 * 
 * IMPORTANT: This function groups articles from ALL sources together in a single pool.
 * It does NOT group by source first - it compares articles from Guardian, GDELT, and Currents
 * together to find stories that are covered by multiple sources.
 * 
 * The grouping algorithm:
 * 1. Takes all articles from all sources as one combined array
 * 2. Compares each article against all existing groups (regardless of source)
 * 3. Groups articles that are about the same story, even if they come from different sources
 * 
 * Result: If Guardian, GDELT, and Currents all cover the same event, they will be
 * grouped together in a single group with one combined summary.
 * 
 * @param {Array<NormalizedArticle>} articles - Array of normalized articles from ALL sources
 * @param {number} similarityThreshold - Minimum similarity to group (0-1), default 0.3
 * @returns {Array<ArticleGroup>}
 */
function groupSimilarArticles(articles, similarityThreshold = 0.3) {
  if (!articles || articles.length === 0) {
    return [];
  }

  const groups = [];
  const used = new Set();

  // For each article, try to find a group it belongs to
  // This compares articles from ALL sources together, not separately
  for (let i = 0; i < articles.length; i++) {
    if (used.has(i)) continue;

    const article = articles[i];
    let bestGroup = null;
    let bestSimilarity = 0;

    // Check against existing groups
    // Compare with articles from ANY source - this enables cross-source grouping
    for (const group of groups) {
      // Compare with first article in group (representative)
      // This article could be from any source (Guardian, GDELT, or Currents)
      const similarity = calculateSimilarity(article, group.articles[0]);
      
      if (similarity >= similarityThreshold && similarity > bestSimilarity) {
        bestGroup = group;
        bestSimilarity = similarity;
      }
    }

    if (bestGroup) {
      // Add to existing group (this group may already contain articles from other sources)
      bestGroup.articles.push(article);
      used.add(i);
    } else {
      // Create new group
      const groupId = `group-${groups.length + 1}`;
      groups.push({
        groupId,
        articles: [article]
      });
      used.add(i);
    }
  }

  // Sort groups by number of articles (larger groups first)
  groups.sort((a, b) => b.articles.length - a.articles.length);

  // Log grouping results with source breakdown
  console.log(`[ArticleGrouper] Grouped ${articles.length} articles into ${groups.length} groups`);
  groups.forEach((group, idx) => {
    const sourceCounts = {};
    group.articles.forEach(a => {
      sourceCounts[a.source] = (sourceCounts[a.source] || 0) + 1;
    });
    const sourceStr = Object.entries(sourceCounts).map(([s, c]) => `${s}:${c}`).join(', ');
    console.log(`   Group ${idx + 1} (${group.groupId}): ${group.articles.length} articles [${sourceStr}]`);
  });

  return groups;
}

module.exports = {
  groupSimilarArticles,
  calculateSimilarity,
  // Export for testing
  normalizeText,
  extractKeyTerms,
  jaccardSimilarity
};

