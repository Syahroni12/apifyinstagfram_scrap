import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { extractPostDetails } from '../dist/extractors.js';

const browser = await chromium.launch({ headless: true });
try {
    const page = await browser.newPage();
    await page.setContent(`
        <meta property="og:description" content='42 likes, 3 comments - example on June 6, 2026: "Hello #Indonesia"'>
        <meta property="og:image" content="https://example.com/post.jpg">
        <article><h1>Hello #Indonesia</h1><time datetime="2026-06-06T12:00:00.000Z"></time></article>
    `);
    const result = await extractPostDetails(page);
    assert.equal(result.username, 'example');
    assert.equal(result.likes, 42);
    assert.equal(result.comments, 3);
    assert.equal(result.caption, 'Hello #Indonesia');
    assert.equal(result.displayUrl, 'https://example.com/post.jpg');
    assert.equal(result.timestamp, '2026-06-06T12:00:00.000Z');
    process.stdout.write('Browser extraction passed using compiled Actor code.\n');
} finally {
    await browser.close();
}
