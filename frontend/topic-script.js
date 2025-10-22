(function () {
  // Get topic from URL parameter
  function getTopicFromUrl() {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get('topic') || 'world';
  }

  // Update page title and content based on topic
  function updatePageForTopic(topic) {
    const topicNames = {
      'world': 'World News',
      'us-news': 'U.S. News', 
      'business': 'Business',
      'technology': 'Technology',
      'sport': 'Sports',
      'culture': 'Entertainment',
      'science': 'Science',
      'health': 'Health',
      'politics': 'Politics'
    };

    const topicName = topicNames[topic] || 'News';
    document.getElementById('page-title').textContent = topicName + ' | Multi-News Synthesizer';
    document.getElementById('topic-title').textContent = topicName;
  }

  // Mobile nav toggle
  var toggle = document.querySelector('.nav-toggle');
  var list = document.getElementById('nav-list');
  if (toggle && list) {
    toggle.addEventListener('click', function () {
      var expanded = this.getAttribute('aria-expanded') === 'true';
      this.setAttribute('aria-expanded', String(!expanded));
      list.classList.toggle('open');
    });
  }

  // Search filter for articles
  var searchForm = document.getElementById('searchForm');
  var searchInput = document.getElementById('searchInput');
  var allCards = [];

  function filterCards(query) {
    var q = (query || '').trim().toLowerCase();
    if (!q) {
      allCards.forEach(function (card) { card.style.display = ''; });
      return;
    }
    allCards.forEach(function (card) {
      var text = (card.textContent || '').toLowerCase();
      card.style.display = text.indexOf(q) !== -1 ? '' : 'none';
    });
  }

  if (searchInput) {
    searchInput.addEventListener('input', function () { filterCards(this.value); });
  }
  if (searchForm) {
    searchForm.addEventListener('submit', function (e) {
      e.preventDefault();
      filterCards(searchInput ? searchInput.value : '');
    });
  }

  // Inline summary functionality
  var activeSummary = null;

  function createSummaryBox(card, title, url, bodyText) {
    // Remove any existing summary box
    if (activeSummary) {
      activeSummary.remove();
    }
    
    // Create summary box HTML
    var summaryHTML = `
      <div class="summary-box show">
        <div class="summary-content">
          <div class="summary-header">
            <h4 class="summary-title">AI Summary</h4>
            <button class="summary-close" aria-label="Close summary">&times;</button>
          </div>
          <div class="summary-loading">Loading summary...</div>
          <div class="summary-text" style="display: none;"></div>
          <div class="summary-actions" style="display: none;">
            <a href="${url}" target="_blank" class="btn btn-primary">Read full article</a>
          </div>
        </div>
      </div>
    `;
    
    // Insert summary box into the card
    card.insertAdjacentHTML('beforeend', summaryHTML);
    activeSummary = card.querySelector('.summary-box');
    
    // Add event listeners
    activeSummary.querySelector('.summary-close').addEventListener('click', function() {
      activeSummary.remove();
      activeSummary = null;
    });
    
    // Close summary when clicking outside
    document.addEventListener('click', function(e) {
      if (activeSummary && !activeSummary.contains(e.target) && !card.contains(e.target)) {
        activeSummary.remove();
        activeSummary = null;
      }
    });
    
    // Get AI summary
    fetch('/api/summarize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: bodyText, title: title })
    })
    .then(response => response.json())
    .then(data => {
      activeSummary.querySelector('.summary-loading').style.display = 'none';
      activeSummary.querySelector('.summary-text').innerHTML = '<p>' + data.summary.replace(/\n/g, '<br>') + '</p>';
      activeSummary.querySelector('.summary-text').style.display = 'block';
      activeSummary.querySelector('.summary-actions').style.display = 'block';
    })
    .catch(error => {
      activeSummary.querySelector('.summary-loading').style.display = 'none';
      activeSummary.querySelector('.summary-text').innerHTML = '<p>Error loading summary. Please try again.</p>';
      activeSummary.querySelector('.summary-text').style.display = 'block';
    });
  }

  // Load articles for the current topic
  function loadArticles() {
    const topic = getTopicFromUrl();
    const articlesContainer = document.getElementById('articles-container');
    
    if (!articlesContainer) return;
    
    // Show loading
    articlesContainer.innerHTML = '<div class="card"><p>Loading articles...</p></div>';
    
    // Fetch articles
    fetch('/api/guardian?section=' + topic + '&limit=12')
      .then(response => response.json())
      .then(data => {
        if (data.items && data.items.length > 0) {
          articlesContainer.innerHTML = '';
          allCards = [];
          
          data.items.forEach(function(article) {
            var cardHTML = `
              <div class="card" data-body="${article.bodyText.replace(/"/g, '&quot;')}">
                <h3>${article.title}</h3>
                <p>${article.trailText || 'No description available.'}</p>
                <a href="#" class="read-more" data-title="${article.title}" data-url="${article.url}" data-body="${article.bodyText.replace(/"/g, '&quot;')}">Read more</a>
              </div>
            `;
            articlesContainer.insertAdjacentHTML('beforeend', cardHTML);
          });
          
          // Update allCards array
          allCards = Array.prototype.slice.call(articlesContainer.querySelectorAll('.card'));
          
          // Add click handlers to read more links
          articlesContainer.querySelectorAll('.read-more').forEach(function(link) {
            // Remove any existing event listeners
            link.removeEventListener('click', link.clickHandler);
            // Create new click handler
            link.clickHandler = function(e) {
              e.preventDefault();
              e.stopPropagation();
              var title = this.getAttribute('data-title');
              var url = this.getAttribute('data-url');
              var bodyText = this.getAttribute('data-body');
              var card = this.closest('.card');
              createSummaryBox(card, title, url, bodyText);
            };
            link.addEventListener('click', link.clickHandler);
          });
        } else {
          articlesContainer.innerHTML = '<div class="card"><p>No articles available for this topic.</p></div>';
        }
      })
      .catch(error => {
        articlesContainer.innerHTML = '<div class="card"><p>Error loading articles.</p></div>';
      });
  }

  // Footer year
  var yearEl = document.getElementById('year');
  if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

  // Initialize page
  const topic = getTopicFromUrl();
  updatePageForTopic(topic);
  loadArticles();
})();
