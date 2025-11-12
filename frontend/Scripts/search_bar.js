document.addEventListener('DOMContentLoaded', () => {
    const form = document.getElementById('searchform');
    const input = document.getElementById('searchInput');

    if (!form || !input) return;

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const q = input.value.trim();
        if (!q) return;

        localStorage.setItem('app:lastSearch', q);

        window.location.href = `/Pages/search_results.html?q=${encodeURIComponent(q)}`;
    });
});