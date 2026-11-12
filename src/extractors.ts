import type { Page } from 'playwright';

/**
 * Membersihkan format hashtag dengan menghapus tanda pagar (#) dan spasi
 * Contoh: "#wisata jember" -> "wisatajember"
 */
export function cleanHashtag(raw: string): string {
    return raw.replace(/\s+/g, '').replace('#', '');
}

/**
 * Membersihkan URL postingan agar tidak mengandung parameter query pelacak
 * Contoh: "https://www.instagram.com/p/ABC/?img_index=1" -> "https://www.instagram.com/p/ABC/"
 */
export function cleanPostUrl(rawUrl: string): string {
    return rawUrl.split('?')[0];
}

/**
 * Menambahkan jeda waktu acak (human-like jitter) untuk meniru perilaku manusia
 * dan mencegah pola scraper terbaca sebagai bot oleh Instagram.
 *
 * @param minMs Waktu minimum dalam milidetik (default: 2000ms)
 * @param maxMs Waktu maksimum dalam milidetik (default: 4500ms)
 */
export async function randomSleep(minMs = 2000, maxMs = 4500): Promise<void> {
    const ms = Math.floor(Math.random() * (maxMs - minMs + 1)) + minMs;
    await new Promise<void>((resolve) => {
        setTimeout(resolve, ms);
    });
}

/**
 * Mendeteksi apakah Instagram memicu CAPTCHA, halaman verifikasi robot,
 * atau redirect ke checkpoint/challenge.
 *
 * Jika terdeteksi, scraper akan menghentikan proses secara aman (graceful stop)
 * untuk melindungi akun Instagram dari sanksi ban permanen.
 */
export async function checkForCaptchaOrChallenge(page: Page): Promise<{ blocked: boolean; reason?: string }> {
    const currentUrl = page.url();

    // 1. Cek redirect ke URL checkpoint/challenge Instagram
    if (currentUrl.includes('/challenge') || currentUrl.includes('/checkpoint') || currentUrl.includes('/two_factor')) {
        return {
            blocked: true,
            reason: `Akun diarahkan ke halaman checkpoint/challenge Instagram (${currentUrl}).`
        };
    }

    // 2. Cek apakah sesi login habis dan dialihkan ke login
    if (currentUrl.includes('/accounts/login')) {
        return {
            blocked: true,
            reason: `Sesi login habis atau dialihkan ke halaman login (${currentUrl}). Periksa sessionid Anda.`
        };
    }

    // 3. Cek elemen visual CAPTCHA di dalam halaman (misal: iframe recaptcha atau teks verifikasi)
    const hasCaptcha = await page.evaluate(() => {
        const iframeCaptcha = !!document.querySelector('iframe[src*="recaptcha"], iframe[src*="captcha"], #captcha, .g-recaptcha');
        const bodyText = document.body ? document.body.innerText.toLowerCase() : '';
        const suspiciousWords = [
            'help us confirm it\'s you',
            'bantu kami mengonfirmasi bahwa ini anda',
            'confirm you\'re a human',
            'enter the code',
            'masukkan kode',
            'unusual activity'
        ];
        const hasSuspiciousText = suspiciousWords.some(w => bodyText.includes(w)) && bodyText.length < 800;
        return iframeCaptcha || hasSuspiciousText;
    }).catch(() => false);

    if (hasCaptcha) {
        return {
            blocked: true,
            reason: 'Terdeteksi prompt verifikasi CAPTCHA/aktivitas tidak biasa di halaman.'
        };
    }

    return { blocked: false };
}

/**
 * Menutup berbagai popup/dialog yang sering muncul di Instagram web
 * seperti peringatan cookie, login prompt "Not Now", dll.
 */
export async function dismissInstagramPopups(page: Page): Promise<void> {
    const dismissSelectors = [
        'button:has-text("Not Now")',
        'button:has-text("Lain Kali")',
        'button:has-text("Decline optional cookies")',
        'button:has-text("Tolak cookie opsional")',
        'button:has-text("Allow all cookies")',
        'button:has-text("Izinkan semua cookie")',
        'div[role="dialog"] button:has-text("Close")',
        'div[role="dialog"] svg[aria-label="Close"]',
    ];

    for (const selector of dismissSelectors) {
        try {
            const btn = page.locator(selector).first();
            if (await btn.isVisible({ timeout: 800 })) {
                await btn.click();
                await page.waitForTimeout(800);
            }
        } catch {
            // Abaikan jika elemen tidak muncul
        }
    }
}

/**
 * Mengekstrak seluruh link postingan dan reel yang ada pada halaman saat ini
 */
export async function extractPostLinksFromPage(page: Page): Promise<string[]> {
    const rawLinks = await page.$$eval('a', (elements) => {
        return elements
            .map(el => el.href)
            .filter(href => href.includes('/p/') || href.includes('/reel/'));
    });

    const uniqueLinks = Array.from(new Set(rawLinks.map(cleanPostUrl)));
    return uniqueLinks;
}

/**
 * Mengonversi format angka teks metrik Instagram (seperti "55.8K", "1.2M", "5,606")
 * menjadi angka numerik integer utuh.
 */
export function parseMetricNumber(rawText: string | null | undefined): number | null {
    if (!rawText) return null;
    const cleaned = rawText.trim().replace(/,/g, '');
    const match = cleaned.match(/([\d.]+)\s*([KkMmBb])?/);
    if (!match) return null;

    const num = parseFloat(match[1]);
    if (Number.isNaN(num)) return null;

    const multiplier = match[2]?.toUpperCase();
    if (multiplier === 'K') return Math.round(num * 1000);
    if (multiplier === 'M') return Math.round(num * 1000000);
    if (multiplier === 'B') return Math.round(num * 1000000000);
    return Math.round(num);
}

/**
 * Mengekstrak detail lengkap satu postingan Instagram dari DOM modal dan meta tags:
 * - Likes Count
 * - Comments Count
 * - Views Count (bila video/reel)
 * - Caption Lengkap
 * - Owner Username
 * - Post Type (Video / Reel / Image)
 * - Timestamp Upload
 */
export async function extractPostDetails(page: Page): Promise<{
    url: string;
    likes: number | null;
    comments: number | null;
    username: string | null;
    caption: string | null;
    timestamp: string | null;
    postType: string;
    views: number | null;
    height: number | null;
    width: number | null;
    displayUrl: string | null;
    alt: string | null;
    videoDuration: number | null;
}> {
    return page.evaluate(() => {
        const dialog = document.querySelector('div[role="dialog"]');
        const root = dialog || document;

        const ogDesc = !dialog ? document.querySelector('meta[property="og:description"]')?.getAttribute('content') || '' : '';
        const ogTitle = !dialog ? document.querySelector('meta[property="og:title"]')?.getAttribute('content') || '' : '';

        // Helper konversi metrik teks (K, M, dll) di dalam context evaluate
        const parseMetric = (text: string | null | undefined): number | null => {
            if (!text) return null;
            const cleaned = text.trim().replace(/,/g, '');
            const m = cleaned.match(/([\d.]+)\s*([KkMmBb])?/);
            if (!m) return null;
            const val = parseFloat(m[1]);
            if (Number.isNaN(val)) return null;
            const mult = m[2]?.toUpperCase();
            if (mult === 'K') return Math.round(val * 1000);
            if (mult === 'M') return Math.round(val * 1000000);
            if (mult === 'B') return Math.round(val * 1000000000);
            return Math.round(val);
        };

        let likes: number | null = null;
        let comments: number | null = null;
        let username: string | null = null;
        let caption: string | null = null;

        // 1. Ekstraksi Username pembuat postingan
        if (dialog) {
            const header = dialog.querySelector('header');
            if (header) {
                const headerLinks = Array.from(header.querySelectorAll('a')).filter(a => {
                    const href = a.getAttribute('href') || '';
                    return !href.includes('/audio/') && !href.includes('/reels/') && !href.includes('/explore/');
                });
                const validHeaderLink = headerLinks.find(a => (a.textContent || '').trim().length > 0);
                if (validHeaderLink) {
                    username = validHeaderLink.textContent?.trim() || null;
                }
            }

            if (!username) {
                const userLinks = Array.from(dialog.querySelectorAll('a[role="link"]')).filter(a => {
                    const href = a.getAttribute('href') || '';
                    return href.startsWith('/') && !href.includes('/p/') && !href.includes('/reel/') && !href.includes('/explore/') && !href.includes('/audio/');
                });
                const validUserLink = userLinks.find(a => (a.textContent || '').trim().length > 0);
                if (validUserLink) {
                    username = validUserLink.textContent?.trim() || null;
                }
            }
        }

        if (!username) {
            const userMatch = ogDesc.match(/-\s+([^\s]+)\s+on/i);
            if (userMatch) {
                username = userMatch[1];
            } else {
                const titleMatch = ogTitle.match(/^([^\s(]+).*on Instagram/i);
                if (titleMatch) username = titleMatch[1];
            }
        }

        // 2. Ekstraksi Likes
        if (dialog) {
            const likeLink = dialog.querySelector('a[href*="/liked_by/"]');
            if (likeLink && likeLink.textContent?.trim()) {
                likes = parseMetric(likeLink.textContent.trim());
            }
        }

        if (likes === null) {
            const allTextElements = Array.from(root.querySelectorAll('span, a, button, div'));
            for (const el of allTextElements) {
                if (el.children.length === 0 && el.textContent) {
                    const match = el.textContent.trim().match(/([\d,.]+[KMkm]?)\s*(?:likes|suka)/i);
                    if (match) {
                        likes = parseMetric(match[1]);
                        break;
                    }
                }
            }
        }

        if (likes === null && ogDesc) {
            const likesMatch = ogDesc.match(/([\d,.]+)\s+likes?/i);
            if (likesMatch) {
                likes = parseMetric(likesMatch[1]);
            }
        }

        // 3. Ekstraksi Comments
        if (dialog) {
            const viewAllComments = Array.from(dialog.querySelectorAll('span, button, div')).find(el =>
                el.children.length === 0 && /(?:view all|lihat semua)\s*[\d,.]+[KMkm]?\s*(?:comments|komentar)/i.test(el.textContent || '')
            );
            if (viewAllComments && viewAllComments.textContent) {
                const m = viewAllComments.textContent.match(/([\d,.]+[KMkm]?)/);
                if (m) comments = parseMetric(m[1]);
            }
            if (comments === null) {
                const commentItems = dialog.querySelectorAll('ul ul > li, ul > div > li');
                if (commentItems.length > 0) comments = commentItems.length;
            }
        }

        if (comments === null && ogDesc) {
            const commentsMatch = ogDesc.match(/([\d,.]+)\s+comments?/i);
            if (commentsMatch) {
                comments = parseMetric(commentsMatch[1]);
            }
        }

        // 4. Ekstraksi Teks Caption
        const h1 = root.querySelector('h1');
        if (h1 && h1.textContent?.trim()) {
            caption = h1.textContent.trim();
        } else if (dialog) {
            const spanEl = dialog.querySelector('ul li div div div div span');
            if (spanEl && spanEl.textContent?.trim()) {
                caption = spanEl.textContent.trim();
            }
        }
        if (!caption && ogDesc) {
            const quoteMatch = ogDesc.match(/:\s*"(.*)"\s*\.?\s*$/s);
            if (quoteMatch) {
                caption = quoteMatch[1];
            }
        }

        // 5. Ekstraksi Waktu Publikasi
        const times = Array.from(root.querySelectorAll('time'));
        let timestamp: string | null = null;
        if (times.length > 0) {
            timestamp = times[0].getAttribute('datetime') || times[times.length - 1].getAttribute('datetime');
        }

        // 6. Penentuan Tipe Konten (Reel, Video, atau Image)
        const isVideo = !!root.querySelector('video');
        let postType = 'Image';
        if (isVideo) {
            postType = location.href.includes('/reel/') ? 'Reel' : 'Video';
        }

        // 7. Ekstraksi Views / Tayangan (jika video/reel)
        let views: number | null = null;
        const viewRegex = /([\d,.]+[KMkm]?)\s*(?:views|tayangan|plays|diputar)/i;
        const leafElements = Array.from(root.querySelectorAll('span, button, div'));
        for (const el of leafElements) {
            if (el.children.length === 0 && el.textContent && el.textContent.length < 50) {
                const match = el.textContent.match(viewRegex);
                if (match) {
                    views = parseMetric(match[1]);
                    break;
                }
            }
        }

        const media = root.querySelector('article video, video');
        const image = root.querySelector<HTMLImageElement>('article img[srcset], article img, img[srcset]');
        const video = media instanceof HTMLVideoElement ? media : null;
        const height = video?.videoHeight || image?.naturalHeight || null;
        const width = video?.videoWidth || image?.naturalWidth || null;
        return {
            height,
            width,
            displayUrl: video?.poster || image?.currentSrc || (!dialog ? document.querySelector('meta[property="og:image"]')?.getAttribute('content') : null) || null,
            alt: image?.alt || null,
            videoDuration: video && Number.isFinite(video.duration) ? video.duration : null,
            url: location.href,
            likes,
            comments,
            username,
            caption,
            timestamp,
            postType,
            views,
        };
    });
}
