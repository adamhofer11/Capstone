document.addEventListener('DOMContentLoaded', () => {

  // Header collapse (pills + search)
  const toggleBtn = document.getElementById('navToggle');
  const collapsible = document.getElementById('collapsableContent');

  if (toggleBtn && collapsible) {
    const toggle = () => {
      const open = toggleBtn.getAttribute('aria-expanded') === 'true';
      toggleBtn.setAttribute('aria-expanded', String(!open));
      collapsible.hidden = open;
      if (!open) {
        const first = collapsible.querySelector('a, button, input, select, textarea');
        if (first) first.focus();
      }
    };

    toggleBtn.addEventListener('click', toggle);
    toggleBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); }
    });

    collapsible.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        toggleBtn.setAttribute('aria-expanded', 'false');
        collapsible.hidden = true;
        toggleBtn.focus();
      }
    });
  }

  // (Optional) Basic client-side search filter hook
  const form = document.getElementById('searchForm');
  const input = document.getElementById('searchInput');
  if (form && input) {
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = input.value.trim().toLowerCase();
      // TODO: filter your article cards here
      // Example: document.querySelectorAll('.card').forEach(card => { ... });
      console.log('Search query:', q);
    });
  }
});
