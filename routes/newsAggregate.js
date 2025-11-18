const express = require('express');
const router = express.Router();

const { fetchGuardianArticles } = require('../services/guardianClient');
const { fetchGdeltArticles } = require('../services/gdeltClient');
const { fetchCurrentsArticles } = require('../services/currentsClient');
const { normalizeArticles } = require('../services/normalize');
const { groupSimilarArticles } = require('../services/articleGrouper');
const { summarizeArticleGroup, generateNeutralTitle } = require('../services/llmSummarizer');

/**
 * Aggregation endpoint that:
 * 1. Fetches articles from Guardian, GDELT, and Currents in parallel
 * 2. Normalizes them to common shape
 * 3. Groups similar articles
 * 4. Generates summaries and comparisons for each group
 * 
 * GET /api/news/aggregate?query=...&country=...&category=...
 */
router.get('/aggregate', async (req, res) => {
  try {
    const { query, country, category, page } = req.query;
    const pageNum = page ? parseInt(page, 10) : 1;
    const isSearch = query && query.trim().length > 0;
    const isCategory = category && category.trim().length > 0 && !isSearch;
    
    console.log('[Aggregate] Request:', { query, country, category, page: pageNum, isSearch, isCategory });

    // Parse query parameters
    const newsQuery = {
      query: query || '',
      country: country || undefined,
      category: category || undefined
    };

    const warnings = [];

    // Fetch from all sources in parallel
    console.log('[Aggregate] Fetching from all sources (Guardian, GDELT, Currents)...');
    const [guardianResults, gdeltResults, currentsResults] = await Promise.allSettled([
      fetchGuardianArticles(newsQuery).catch(err => {
        console.error('[Aggregate] Guardian failed:', err.message);
        warnings.push(`Guardian API: ${err.message}`);
        return [];
      }),
      fetchGdeltArticles(newsQuery).catch(err => {
        console.error('[Aggregate] GDELT failed:', err.message);
        warnings.push(`GDELT API: ${err.message}`);
        return [];
      }),
      fetchCurrentsArticles(newsQuery).catch(err => {
        console.error('[Aggregate] Currents failed:', err.message);
        warnings.push(`Currents API: ${err.message}`);
        return [];
      })
    ]);

    // Extract results (handle Promise.allSettled structure)
    const guardianArticles = guardianResults.status === 'fulfilled' ? guardianResults.value : [];
    const gdeltArticles = gdeltResults.status === 'fulfilled' ? gdeltResults.value : [];
    const currentsArticles = currentsResults.status === 'fulfilled' ? currentsResults.value : [];

    // Verify results are arrays
    if (!Array.isArray(guardianArticles)) {
      console.warn('[Aggregate] Guardian returned non-array:', typeof guardianArticles);
    }
    if (!Array.isArray(gdeltArticles)) {
      console.warn('[Aggregate] GDELT returned non-array:', typeof gdeltArticles);
    }
    if (!Array.isArray(currentsArticles)) {
      console.warn('[Aggregate] Currents returned non-array:', typeof currentsArticles);
    }

    console.log('\n[Aggregate] Raw articles fetched from each source:');
    console.log(`   Guardian: ${Array.isArray(guardianArticles) ? guardianArticles.length : 0} articles`);
    console.log(`   GDELT: ${Array.isArray(gdeltArticles) ? gdeltArticles.length : 0} articles`);
    console.log(`   Currents: ${Array.isArray(currentsArticles) ? currentsArticles.length : 0} articles`);
    const totalRaw = (Array.isArray(guardianArticles) ? guardianArticles.length : 0) +
                     (Array.isArray(gdeltArticles) ? gdeltArticles.length : 0) +
                     (Array.isArray(currentsArticles) ? currentsArticles.length : 0);
    console.log(`   Total raw: ${totalRaw} articles\n`);

    // Normalize all articles from each source
    const normalizedGuardian = normalizeArticles(guardianArticles, 'guardian');
    const normalizedGdelt = normalizeArticles(gdeltArticles, 'gdelt');
    const normalizedCurrents = normalizeArticles(currentsArticles, 'currents');

    // CRITICAL: Combine all normalized articles into ONE pool before grouping
    // This ensures cross-source grouping - articles from Guardian, GDELT, and Currents
    // are compared together, not grouped separately by source
    const allArticles = [
      ...normalizedGuardian,
      ...normalizedGdelt,
      ...normalizedCurrents
    ];

    console.log('[Aggregate] Normalized articles by source:');
    console.log(`   Guardian: ${normalizedGuardian.length} articles`);
    console.log(`   GDELT: ${normalizedGdelt.length} articles`);
    console.log(`   Currents: ${normalizedCurrents.length} articles`);
    console.log(`   Total normalized: ${allArticles.length} articles\n`);
    
    // Log source breakdown for verification
    const sourceBreakdown = {
      guardian: normalizedGuardian.length,
      gdelt: normalizedGdelt.length,
      currents: normalizedCurrents.length
    };
    console.log('[Aggregate] Source verification:', sourceBreakdown);
    
    // Verify non-Guardian sources are working
    const nonGuardianCount = normalizedGdelt.length + normalizedCurrents.length;
    if (nonGuardianCount === 0 && allArticles.length > 0) {
      console.warn('[Aggregate] WARNING: Only Guardian articles found. GDELT and Currents may not be working.');
    } else {
      console.log(`[Aggregate] Non-Guardian articles: ${nonGuardianCount} (GDELT: ${normalizedGdelt.length}, Currents: ${normalizedCurrents.length})`);
    }

    if (allArticles.length === 0) {
      return res.json({
        query: query || '',
        country: country || undefined,
        category: category || undefined,
        groups: [],
        warnings: warnings.length > 0 ? warnings : ['No articles found from any source.']
      });
    }

    // Group similar articles ACROSS ALL SOURCES
    // The grouping algorithm compares articles from all sources together,
    // not separately by source. This ensures cross-source grouping.
    // 
    // SIMILARITY THRESHOLD: Adjust this value to control grouping strictness
    // - Lower values (0.2-0.3): Stricter grouping = more groups, articles must be very similar
    // - Higher values (0.4-0.5): Looser grouping = fewer groups, more articles per group
    // - Default: 0.3 (moderate grouping)
    // 
    // The grouping algorithm uses:
    // 1. Jaccard similarity on key terms from title + description
    // 2. Publish time proximity (within 7 days = +0.1 bonus)
    // 3. URL domain similarity (same domain = +0.05 bonus)
    // 
    // Edit this line to adjust:
    const similarityThreshold = 0.3;
    const groups = groupSimilarArticles(allArticles, similarityThreshold);

    console.log(`\n[Aggregate] Grouped ${allArticles.length} articles into ${groups.length} groups (cross-source grouping)`);
    
    // Log group composition by source to verify cross-source grouping
    groups.forEach((group, idx) => {
      const sources = {};
      group.articles.forEach(article => {
        sources[article.source] = (sources[article.source] || 0) + 1;
      });
      const sourceStr = Object.entries(sources).map(([s, c]) => `${s}:${c}`).join(', ');
      console.log(`   Group ${idx + 1}: ${group.articles.length} articles from ${Object.keys(sources).length} source(s) [${sourceStr}]`);
    });
    console.log('');

    // CRITICAL: Filter groups to only show multi-source stories
    // Remove groups that:
    // 1. Have only one source (must have at least 2 distinct sources)
    // 2. Have identical titles across all articles
    const filteredGroups = groups.filter(group => {
      // Get unique sources in this group
      const uniqueSources = [...new Set(group.articles.map(a => a.source))];
      
      // Rule 1: Must have at least 2 distinct sources
      if (uniqueSources.length < 2) {
        console.log(`[Aggregate] Filtering out group ${group.groupId} - only has ${uniqueSources.length} source(s): ${uniqueSources.join(', ')}`);
        return false;
      }
      
      // Rule 2: If multiple articles, check if all titles are identical
      if (group.articles.length > 1) {
        const normalizedTitles = group.articles.map(a => 
          (a.title || '').toLowerCase().trim()
        );
        
        const firstTitle = normalizedTitles[0];
        const allIdentical = normalizedTitles.every(title => title === firstTitle && title.length > 0);
        
        if (allIdentical) {
          console.log(`[Aggregate] Filtering out group ${group.groupId} - all ${group.articles.length} articles have identical title: "${firstTitle.substring(0, 50)}..."`);
          return false;
        }
      }
      
      return true;
    });

    console.log(`[Aggregate] After filtering (multi-source + identical-title): ${filteredGroups.length} groups (removed ${groups.length - filteredGroups.length} groups)`);

    // Sort groups by most recent publish date (for consistent ordering)
    filteredGroups.sort((a, b) => {
      const getLatestDate = (group) => {
        const dates = group.articles
          .map(article => {
            try {
              return article.publishedAt ? new Date(article.publishedAt).getTime() : 0;
            } catch {
              return 0;
            }
          })
          .filter(d => d > 0);
        return dates.length > 0 ? Math.max(...dates) : 0;
      };
      return getLatestDate(b) - getLatestDate(a); // Most recent first
    });

    // Summarize each group (with concurrency limit)
    // Use filteredGroups (after identical-title filter and sorting)
    const MAX_CONCURRENT_SUMMARIES = 3; // Process 3 groups at a time
    const summarizedGroups = [];

    for (let i = 0; i < filteredGroups.length; i += MAX_CONCURRENT_SUMMARIES) {
      const batch = filteredGroups.slice(i, i + MAX_CONCURRENT_SUMMARIES);
      const summaries = await Promise.allSettled(
        batch.map(group => summarizeArticleGroup(group))
      );

      summaries.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const summary = result.value.summary || 'Summary not available.';
          // CRITICAL: Always generate title from summary, never use generic fallback
          let groupTitle = result.value.groupTitle;
          // Check for generic titles (case-insensitive)
          const genericPatterns = ['news story', 'story 1', 'story 2', 'story 3', 'latest news', 'news coverage', 'story from'];
          const isGeneric = !groupTitle || 
                           genericPatterns.some(pattern => groupTitle.toLowerCase().includes(pattern)) ||
                           /^story\s+\d+$/i.test(groupTitle) ||
                           groupTitle.length < 10;
          
          if (isGeneric) {
            // Generate title from summary if LLM didn't provide a good one
            groupTitle = generateNeutralTitle(
              batch[index].articles[0]?.title,
              batch[index].articles[0]?.description,
              summary
            );
          }
          
          summarizedGroups.push({
            groupId: result.value.groupId,
            groupTitle: groupTitle,
            summary: summary,
            detailedComparison: result.value.detailedComparison || result.value.differences?.join(' ') || 'Comparison not available.',
            simpleComparison: result.value.simpleComparison || result.value.differences?.[0] || 'Articles differ in their focus and emphasis.',
            differences: result.value.differences || [],
            articles: batch[index].articles
          });
        } else {
          // If summarization fails, return raw articles
          console.error('[Aggregate] Summarization failed for group:', batch[index].groupId, result.reason);
          warnings.push(`Failed to summarize group ${batch[index].groupId}`);
          const sources = [...new Set(batch[index].articles.map(a => a.source))];
          const firstArticle = batch[index].articles[0];
          // Create a more descriptive summary from article titles
          const articleTitles = batch[index].articles.map(a => a.title).filter(Boolean).join('; ');
          const fallbackSummary = articleTitles || 'Summary unavailable. Please review the articles below.';
          // CRITICAL: Always generate title from summary, never use generic fallback
          const groupTitle = generateNeutralTitle(
            firstArticle?.title,
            firstArticle?.description,
            fallbackSummary
          );
          summarizedGroups.push({
            groupId: batch[index].groupId,
            groupTitle: groupTitle,
            summary: fallbackSummary,
            detailedComparison: `This story was covered by ${sources.join(', ')}. Each source provides its own perspective.`,
            simpleComparison: `Covered by ${sources.join(', ')} with different perspectives.`,
            differences: [],
            articles: batch[index].articles
          });
        }
      });
    }

    // CRITICAL: Apply universal pagination - ALL views paginate at 9 groups per page
    // This applies to: custom search, ALL categories, home/default, location views
    let finalGroups = summarizedGroups;
    let totalGroups = summarizedGroups.length;
    let totalPages = 1;
    let currentPage = 1;
    const GROUPS_PER_PAGE = 9; // UNIVERSAL: All views use 9 groups per page

    // ALL views (search, categories, home, location) use the same pagination
    const groupsPerPage = GROUPS_PER_PAGE;
    totalPages = Math.max(1, Math.ceil(summarizedGroups.length / groupsPerPage));
    currentPage = Math.max(1, Math.min(pageNum, totalPages)); // Clamp to valid range
    const startIndex = (currentPage - 1) * groupsPerPage;
    const endIndex = startIndex + groupsPerPage;
    finalGroups = summarizedGroups.slice(startIndex, endIndex);
    
    const viewType = isSearch ? 'search' : isCategory ? 'category' : 'other';
    console.log(`[Aggregate] ${viewType} view: UNIVERSAL PAGINATION - page ${currentPage} of ${totalPages}`);
    console.log(`[Aggregate] ${viewType} view: ${summarizedGroups.length} total groups, showing groups ${startIndex + 1}-${Math.min(endIndex, summarizedGroups.length)} (max ${groupsPerPage} per page)`);
    
    // Verify limit is enforced
    if (finalGroups.length > groupsPerPage) {
      console.error(`[Aggregate] ERROR: Pagination limit violated! Showing ${finalGroups.length} groups, max is ${groupsPerPage}`);
      finalGroups = finalGroups.slice(0, groupsPerPage);
    }
    
    // Final verification: ensure we never return more than the limit
    if (finalGroups.length > GROUPS_PER_PAGE) {
      console.error(`[Aggregate] CRITICAL: Pagination limit still violated after enforcement!`);
      finalGroups = finalGroups.slice(0, GROUPS_PER_PAGE);
    }

    // Return aggregated response
    const response = {
      query: query || '',
      country: country || undefined,
      category: category || undefined,
      groups: finalGroups,
      // ALL views return pagination info (search, categories, home, location)
      pagination: {
        currentPage: currentPage,
        totalPages: totalPages,
        totalGroups: totalGroups,
        groupsPerPage: GROUPS_PER_PAGE
      },
      ...(warnings.length > 0 && { warnings })
    };

    console.log('[Aggregate] Returning', finalGroups.length, 'summarized groups');
    res.json(response);

  } catch (error) {
    console.error('[Aggregate] Error:', error);
    res.status(500).json({
      error: error.message || 'Failed to aggregate news',
      groups: []
    });
  }
});

module.exports = router;

