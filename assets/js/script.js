const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const scrollBehavior = () => reducedMotion.matches ? 'auto' : 'smooth';

const year = document.getElementById('year');
if (year) year.textContent = new Date().getFullYear();

const header = document.querySelector('.site-header');
const backToTopBtn = document.getElementById('back-to-top');
let scrollUpdateQueued = false;

function updateScrollState() {
    if (header) header.classList.toggle('scrolled', window.scrollY > 50);
    if (backToTopBtn) backToTopBtn.classList.toggle('visible', window.scrollY > 500);
    scrollUpdateQueued = false;
}

window.addEventListener('scroll', () => {
    if (!scrollUpdateQueued) {
        scrollUpdateQueued = true;
        requestAnimationFrame(updateScrollState);
    }
}, { passive: true });
updateScrollState();

document.querySelectorAll('a[href^="#"]:not(.skip-link)').forEach(anchor => {
    anchor.addEventListener('click', event => {
        const href = anchor.getAttribute('href');
        if (!href || href === '#') return;

        let target;
        try {
            target = document.querySelector(href);
        } catch (_) {
            return;
        }
        if (!target) return;

        event.preventDefault();
        target.scrollIntoView({ behavior: scrollBehavior(), block: 'start' });
        try {
            history.pushState(null, '', href);
        } catch (_) {
            // Scrolling still works when history is unavailable (for example, local previews).
        }
    });
});

const tabBtns = Array.from(document.querySelectorAll('[role="tab"]'));
const tabContents = Array.from(document.querySelectorAll('[role="tabpanel"]'));

function activateTab(activeTab, moveFocus = false) {
    const tabId = activeTab.getAttribute('data-tab');

    tabBtns.forEach(tab => {
        const selected = tab === activeTab;
        tab.classList.toggle('active', selected);
        tab.setAttribute('aria-selected', String(selected));
        tab.tabIndex = selected ? 0 : -1;
    });

    tabContents.forEach(panel => {
        const selected = panel.id === tabId;
        panel.classList.toggle('active', selected);
        panel.hidden = !selected;
    });

    if (moveFocus) activeTab.focus();

    if (tabId === 'game-coupling' && window.initRandomCoupling) {
        requestAnimationFrame(window.initRandomCoupling);
    }

    document.dispatchEvent(new CustomEvent('site:tabchange', { detail: { tabId } }));
}

tabBtns.forEach((btn, index) => {
    btn.addEventListener('click', () => activateTab(btn));
    btn.addEventListener('keydown', event => {
        let nextIndex = null;
        if (event.key === 'ArrowRight') nextIndex = (index + 1) % tabBtns.length;
        if (event.key === 'ArrowLeft') nextIndex = (index - 1 + tabBtns.length) % tabBtns.length;
        if (event.key === 'Home') nextIndex = 0;
        if (event.key === 'End') nextIndex = tabBtns.length - 1;
        if (nextIndex === null) return;

        event.preventDefault();
        activateTab(tabBtns[nextIndex], true);
    });
});

const themeToggle = document.getElementById('theme-toggle');
const sunIcon = document.querySelector('.sun-icon');
const moonIcon = document.querySelector('.moon-icon');
const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');

function setTheme(theme, persist = false) {
    const isDark = theme === 'dark';
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');

    if (sunIcon && moonIcon) {
        sunIcon.hidden = !isDark;
        sunIcon.style.display = isDark ? 'block' : 'none';
        moonIcon.hidden = isDark;
        moonIcon.style.display = isDark ? 'none' : 'block';
        [sunIcon, moonIcon].forEach(icon => {
            icon.setAttribute('aria-hidden', 'true');
            icon.setAttribute('focusable', 'false');
        });
    }

    if (themeToggle) {
        const label = `Switch to ${isDark ? 'light' : 'dark'} theme`;
        themeToggle.setAttribute('aria-label', label);
        themeToggle.setAttribute('title', label);
    }

    if (persist) {
        document.documentElement.setAttribute('data-theme-preference', 'user');
        try {
            localStorage.setItem('theme', isDark ? 'dark' : 'light');
        } catch (_) {
            // The visual preference still applies for this page view.
        }
    }

    document.dispatchEvent(new CustomEvent('themechange', { detail: { theme: isDark ? 'dark' : 'light' } }));
}

setTheme(document.documentElement.getAttribute('data-theme') || (systemTheme.matches ? 'dark' : 'light'));

if (themeToggle) {
    themeToggle.addEventListener('click', () => {
        const currentTheme = document.documentElement.getAttribute('data-theme');
        setTheme(currentTheme === 'dark' ? 'light' : 'dark', true);
    });
}

const handleSystemThemeChange = event => {
    if (document.documentElement.getAttribute('data-theme-preference') === 'system') {
        setTheme(event.matches ? 'dark' : 'light');
    }
};

if (systemTheme.addEventListener) systemTheme.addEventListener('change', handleSystemThemeChange);
else systemTheme.addListener(handleSystemThemeChange);

if (backToTopBtn) {
    backToTopBtn.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: scrollBehavior() });
        const mainContent = document.getElementById('main-content');
        if (mainContent) mainContent.focus({ preventScroll: true });
    });
}

const activeNavLink = document.querySelector('.nav-links [aria-current]:not([aria-current="false"])');
const navLinks = activeNavLink ? activeNavLink.closest('.nav-links') : null;

function revealActiveNavigation() {
    if (!activeNavLink || !navLinks || window.innerWidth > 768) return;
    const targetLeft = activeNavLink.offsetLeft - (navLinks.clientWidth - activeNavLink.offsetWidth) / 2;
    navLinks.scrollLeft = Math.max(0, targetLeft);
}

requestAnimationFrame(revealActiveNavigation);
window.addEventListener('resize', revealActiveNavigation, { passive: true });
