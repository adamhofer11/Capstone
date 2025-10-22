(function () {
  // Learn More alert
  var learnBtn = document.getElementById('learnMoreBtn');
  if (learnBtn) {
    learnBtn.addEventListener('click', function () {
      alert('Welcome to our site!');
    });
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

  // Smooth scroll for topic pills and internal nav
  function smoothScrollTo(hash) {
    var target = document.querySelector(hash);
    if (!target) return;
    target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.pushState(null, '', hash);
  }

  document.addEventListener('click', function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var href = link.getAttribute('href');
    if (href.length > 1) {
      e.preventDefault();
      smoothScrollTo(href);
    }
  });

  // Search filter across all cards
  var searchForm = document.getElementById('searchForm');
  var searchInput = document.getElementById('searchInput');
  var allCards = Array.prototype.slice.call(document.querySelectorAll('.card'));

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

  // Footer year
  var yearEl = document.getElementById('year');
  if (yearEl) { yearEl.textContent = String(new Date().getFullYear()); }

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

  // Load articles for each section
  function loadArticles() {
    var sections = ['world', 'us-news', 'business', 'technology', 'sport', 'culture', 'science', 'health', 'politics'];
    
    sections.forEach(function(sectionId) {
      var sectionElement = document.getElementById(sectionId);
      if (!sectionElement) return;
      
      var cardsContainer = sectionElement.querySelector('.cards');
      if (!cardsContainer) return;
      
      // Show loading
      cardsContainer.innerHTML = '<div class="card"><p>Loading articles...</p></div>';
      
      // Fetch articles
      fetch('/api/guardian?section=' + sectionId + '&limit=6')
        .then(response => response.json())
        .then(data => {
          if (data.items && data.items.length > 0) {
            cardsContainer.innerHTML = '';
            data.items.forEach(function(article) {
              var cardHTML = `
                <div class="card" data-body="${article.bodyText.replace(/"/g, '&quot;')}">
                  <h3>${article.title}</h3>
                  <p>${article.trailText || 'No description available.'}</p>
                  <a href="#" class="read-more" data-title="${article.title}" data-url="${article.url}" data-body="${article.bodyText.replace(/"/g, '&quot;')}">Read more</a>
                </div>
              `;
              cardsContainer.insertAdjacentHTML('beforeend', cardHTML);
            });
            
            // Add click handlers to read more links
            cardsContainer.querySelectorAll('.read-more').forEach(function(link) {
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
            cardsContainer.innerHTML = '<div class="card"><p>No articles available.</p></div>';
          }
        })
        .catch(error => {
          cardsContainer.innerHTML = '<div class="card"><p>Error loading articles.</p></div>';
        });
    });
  }

  // Initialize articles when page loads
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadArticles);
  } else {
    loadArticles();
  }
})();


