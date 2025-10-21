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
})();

