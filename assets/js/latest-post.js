// Use the Blog and Research indexes for Home highlights, with static HTML as a fallback.
async function updateLatestPost() {
    const highlight = document.querySelector('[data-latest-post]');
    if (!highlight) return;

    try {
        const indexURL = new URL('pages/blog.html', document.baseURI);
        const response = await fetch(indexURL, { cache: 'no-cache' });
        if (!response.ok) return;

        const blog = new DOMParser().parseFromString(await response.text(), 'text/html');
        const posts = Array.from(blog.querySelectorAll('.blog-card')).map(card => ({
            title: card.querySelector('h2 a'),
            time: card.querySelector('time[datetime]'),
            summary: card.querySelector('.collection-summary'),
            meta: card.querySelector('.meta')
        })).filter(post => post.title && post.summary && /^\d{4}-\d{2}-\d{2}$/.test(post.time?.dateTime));
        posts.sort((a, b) => b.time.dateTime.localeCompare(a.time.dateTime));
        const latest = posts[0];
        if (!latest) return;

        const url = new URL(latest.title.getAttribute('href'), indexURL);
        if (url.origin !== indexURL.origin) return;

        const title = latest.title.textContent.trim().replace(/\s+/g, ' ');
        const headingLink = highlight.querySelector('.latest-post-title a');
        headingLink.textContent = title;
        headingLink.href = url.href;
        highlight.querySelector('.latest-post-summary').textContent = latest.summary.textContent.trim().replace(/\s+/g, ' ');
        const time = highlight.querySelector('time');
        time.dateTime = latest.time.dateTime;
        time.textContent = latest.time.textContent;
        highlight.querySelector('.latest-post-category').textContent = latest.meta?.textContent.split('•').slice(1).join('•').trim() || 'Blog';
        const readLink = highlight.querySelector('.latest-post-link');
        readLink.href = url.href;
        readLink.setAttribute('aria-label', `Read ${title}`);
    } catch (_) {
        // The bundled article stays available offline or if the index cannot be loaded.
    }
}

async function updateLatestResearch() {
    const highlight = document.querySelector('[data-latest-research]');
    if (!highlight) return;

    try {
        const indexURL = new URL('pages/research.html', document.baseURI);
        const response = await fetch(indexURL, { cache: 'no-cache' });
        if (!response.ok) return;

        const research = new DOMParser().parseFromString(await response.text(), 'text/html');
        // Research cards are curated newest-first on the source index.
        const latest = research.querySelector('.research-card');
        const sourceTitle = latest?.querySelector('h2 a');
        const sourceSummary = latest?.querySelector('.collection-summary');
        const href = sourceTitle?.getAttribute('href');
        if (!href || !sourceSummary) return;

        const url = new URL(href, indexURL);
        if (url.protocol !== 'https:' && !(url.protocol === 'http:' && url.origin === indexURL.origin)) return;

        const title = sourceTitle.textContent.trim().replace(/\s+/g, ' ');
        const summary = sourceSummary.textContent.trim().replace(/\s+/g, ' ');
        const category = latest.querySelector('.collection-meta, .meta')?.textContent.trim().replace(/\s+/g, ' ') || 'Research';
        const headingLink = highlight.querySelector('.latest-post-title a');
        const summaryText = highlight.querySelector('.latest-post-summary');
        const categoryText = highlight.querySelector('.latest-post-category');
        const readLink = highlight.querySelector('.latest-post-link');
        if (!title || !summary || !headingLink || !summaryText || !categoryText || !readLink) return;

        headingLink.textContent = title;
        headingLink.href = url.href;
        summaryText.textContent = summary;
        categoryText.textContent = category;
        readLink.href = url.href;
        readLink.setAttribute('aria-label', `Read ${title}`);
    } catch (_) {
        // The bundled paper stays available offline or if the index cannot be loaded.
    }
}

updateLatestPost();
updateLatestResearch();
