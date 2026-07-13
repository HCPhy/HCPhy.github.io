(() => {
    let savedTheme = null;

    try {
        savedTheme = localStorage.getItem('theme');
    } catch (_) {
        // Storage may be unavailable in privacy-restricted contexts.
    }

    const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    const theme = savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme;

    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.setAttribute('data-theme-preference', savedTheme ? 'user' : 'system');
})();
