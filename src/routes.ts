import { Actor, log } from 'apify';
import { createPlaywrightRouter } from 'crawlee';

import {
    checkForCaptchaOrChallenge,
    dismissInstagramPopups,
    extractPostDetails,
    extractPostLinksFromPage,
    randomSleep,
} from './extractors.js';
import { formatPost } from './output.js';
import type { InputSchema, RequestUserData } from './types.js';

export interface RouterContextOptions {
    input: InputSchema;
    seenPosts: Set<string>;
    onPostScraped: () => void;
    getTotalScraped: () => number;
    onChallengeDetected: (reason: string) => void;
    isBlocked: () => boolean;
    isTimeUp: () => boolean;
}

/**
 * Membuat router Crawlee untuk memproses halaman pencarian (SEARCH)
 * dan halaman detail postingan (POST_DETAIL).
 */
export function createRouter(options: RouterContextOptions) {
    const { input, seenPosts, onPostScraped, getTotalScraped, onChallengeDetected, isBlocked, isTimeUp } = options;
    const scrollCount = input.scrollCount ?? 5;
    const maxPosts = input.maxPosts ?? 5;
    const scrapeDetails = input.scrapeDetails ?? true;
    const skipSeenPosts = input.skipSeenPosts ?? true;

    const router = createPlaywrightRouter();

    // ==========================================
    // 1. HANDLER: SEARCH (Hashtag & Keyword)
    // ==========================================
    router.addHandler('SEARCH', async ({ page, request }) => {
        if (isBlocked() || isTimeUp()) {
            log.warning('Proses pencarian dilewati karena akun terblokir atau batas waktu run (1m 20d) tercapai.');
            return;
        }

        const { searchType, query } = request.userData as RequestUserData;
        log.info(`Membuka halaman ${searchType}: "${query}" | URL: ${request.url}`);

        await page.waitForLoadState('domcontentloaded');
        await randomSleep(2000, 3500);

        // 1. Periksa apakah halaman memicu CAPTCHA atau checkpoint Instagram
        const challengeCheck = await checkForCaptchaOrChallenge(page);
        if (challengeCheck.blocked) {
            log.error(`[PERINGATAN AKUN] ${challengeCheck.reason}`);
            log.warning('Menghentikan scraper secara aman (graceful stop) untuk melindungi akun Anda.');
            onChallengeDetected(challengeCheck.reason || 'Terdeteksi CAPTCHA / checkpoint.');
            return;
        }

        // 2. Tutup modal popup seperti cookie notice atau "Not Now"
        await dismissInstagramPopups(page);

        // 3. Tunggu hingga elemen postingan muncul di grid
        log.info(`Menunggu konten post untuk ${searchType} "${query}"...`);
        try {
            await page.waitForSelector('a[href*="/p/"], a[href*="/reel/"]', { timeout: 12000 });
        } catch {
            log.warning(`Postingan belum langsung terdeteksi di awal. Melanjutkan dengan scroll...`);
        }

        // 4. Proses pengambilan postingan secara langsung di grid explore (Human-like In-Page Processing)
        log.info(`Memulai pengambilan postingan (target: ${maxPosts} postingan baru, maks scroll: ${scrollCount})...`);
        const queryCollectedPosts = new Set<string>();
        const attemptedPosts = new Set<string>();
        let failedDetails = 0;
        let scrollsCount = 0;
        let consecutiveNoNewHeight = 0;

        while (queryCollectedPosts.size < maxPosts && scrollsCount < scrollCount && !isBlocked() && !isTimeUp()) {
            // Ambil semua link postingan yang sedang aktif/tampak di DOM saat ini
            const visibleLinks = await extractPostLinksFromPage(page);
            const newUnseenLinks = visibleLinks.filter(url => (!skipSeenPosts || !seenPosts.has(url)) && !attemptedPosts.has(url));

            if (newUnseenLinks.length > 0) {
                consecutiveNoNewHeight = 0;
                log.info(`Ditemukan ${newUnseenLinks.length} postingan baru di layar. Memproses detail postingan...`);

                for (const postUrl of newUnseenLinks) {
                    if (queryCollectedPosts.size >= maxPosts || isBlocked() || isTimeUp() || page.isClosed()) break;

                    attemptedPosts.add(postUrl);
                    let postPath = '';
                    try {
                        const parsed = new URL(postUrl);
                        postPath = parsed.pathname;
                    } catch {
                        postPath = postUrl;
                    }

                    if (scrapeDetails) {
                        let modalSuccess = false;
                        try {
                            const postLocator = page.locator(`a[href*="${postPath}"]`).first();
                            if (await postLocator.count() > 0) {
                                await postLocator.scrollIntoViewIfNeeded();
                                await postLocator.click();

                                const dialog = page.locator('div[role="dialog"]');
                                await dialog.waitFor({ timeout: 5000 });
                                // Tunggu data GraphQL selesai dirender oleh Instagram di dalam modal
                                await page.waitForTimeout(1200);

                                const details = await extractPostDetails(page);
                                if (!details.username && !details.caption && !details.displayUrl) {
                                    throw new Error('Detail modal belum tersedia');
                                }

                                onPostScraped();
                                const currentCount = getTotalScraped();
                                seenPosts.add(postUrl);
                                queryCollectedPosts.add(postUrl);

                                log.info(
                                    `[#${currentCount}] @${details.username ?? 'unknown'} | ` +
                                    `Likes: ${details.likes ?? 0} | ` +
                                    `Comments: ${details.comments ?? 0} | ` +
                                    `Views: ${details.views ?? '-'} | ` +
                                    `Tipe: ${details.postType} | ` +
                                    `URL: ${details.url || postUrl}`
                                );

                                await Actor.pushData(formatPost(request.url, postUrl, details));

                                await page.keyboard.press('Escape');
                                await dialog.waitFor({ state: 'detached', timeout: 2500 }).catch(() => {
                                    // Dialog tertutup
                                });
                                modalSuccess = true;
                            }
                        } catch (modalErr) {
                            log.warning(`Gagal mengekstrak modal untuk ${postUrl} (${(modalErr as Error).message}).`);
                            await page.keyboard.press('Escape').catch(() => {
                                // Abaikan jika escape gagal
                            });
                        }

                        if (!modalSuccess) {
                            if (page.isClosed() || isTimeUp() || isBlocked()) break;
                            const detailPage = await page.context().newPage();
                            try {
                                log.info(`Mencoba halaman post langsung: ${postUrl}`);
                                await detailPage.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 12000 });
                                const check = await checkForCaptchaOrChallenge(detailPage);
                                if (check.blocked) {
                                    onChallengeDetected(check.reason ?? 'Sesi Instagram membutuhkan verifikasi.');
                                    break;
                                }
                                await detailPage.waitForSelector('article, meta[property="og:description"]', { timeout: 5000, state: 'attached' });
                                await dismissInstagramPopups(detailPage);
                                const details = await extractPostDetails(detailPage);
                                if (!details.username && !details.caption && !details.displayUrl) {
                                    failedDetails++;
                                    log.warning(`Detail tidak tersedia untuk ${postUrl}; tidak disimpan dan dapat dicoba lagi.`);
                                    continue;
                                }
                                await Actor.pushData(formatPost(request.url, postUrl, details));
                                onPostScraped();
                                seenPosts.add(postUrl);
                                queryCollectedPosts.add(postUrl);
                            } catch (error) {
                                failedDetails++;
                                log.warning(`Halaman detail gagal untuk ${postUrl}: ${(error as Error).message}`);
                            } finally {
                                await detailPage.close();
                            }
                        }

                        await randomSleep(800, 1500);
                    } else {
                        onPostScraped();
                        seenPosts.add(postUrl);
                        queryCollectedPosts.add(postUrl);
                        await Actor.pushData(formatPost(request.url, postUrl));
                    }
                }
            }

            // Jika target belum terpenuhi, scroll ke bawah untuk memuat baris postingan berikutnya
            if (queryCollectedPosts.size < maxPosts && !isTimeUp() && !isBlocked()) {
                const prevHeight = await page.evaluate(() => document.body.scrollHeight);
                await page.evaluate(() => window.scrollBy(0, document.body.scrollHeight));
                scrollsCount++;
                log.info(`Scroll ${scrollsCount}/${scrollCount}: Mencari postingan baru di bawah (terkumpul ${queryCollectedPosts.size}/${maxPosts} post)...`);
                await randomSleep(1500, 2500);
                const newHeight = await page.evaluate(() => document.body.scrollHeight);

                if (newHeight <= prevHeight) {
                    consecutiveNoNewHeight++;
                    if (consecutiveNoNewHeight >= 3) {
                        log.info('Halaman sudah mencapai batas terbawah (tidak ada postingan baru lagi yang dimuat).');
                        break;
                    }
                } else {
                    consecutiveNoNewHeight = 0;
                }
            }
        }

        log.info(`Diagnostik ${searchType}: ${attemptedPosts.size} dicoba, ${queryCollectedPosts.size} tersimpan, ${failedDetails} detail gagal; skipSeenPosts=${skipSeenPosts}, batasWaktu=${isTimeUp()}.`);
        log.info(`Selesai memproses ${searchType} "${query}". Total postingan terkumpul: ${queryCollectedPosts.size}.`);
    });

    // ==========================================
    // 2. HANDLER: POST_DETAIL (Ekstraksi Detail)
    // ==========================================
    router.addHandler('POST_DETAIL', async ({ page, request }) => {
        if (isBlocked() || isTimeUp()) {
            log.warning(`Melewati detail post ${request.url} karena akun terblokir atau batas waktu run (< 1m 20d) tercapai.`);
            return;
        }

        const { inputUrl } = request.userData as RequestUserData;

        await page.waitForLoadState('domcontentloaded');
        await randomSleep(800, 1800);

        // Periksa apakah Instagram memicu checkpoint/CAPTCHA saat membuka postingan
        const challengeCheck = await checkForCaptchaOrChallenge(page);
        if (challengeCheck.blocked) {
            log.error(`[PERINGATAN AKUN] Terdeteksi saat membuka ${request.url}: ${challengeCheck.reason}`);
            onChallengeDetected(challengeCheck.reason || 'Terdeteksi CAPTCHA / checkpoint.');
            return;
        }

        // Ekstrak informasi dari halaman postingan
        const details = await extractPostDetails(page);

        onPostScraped();
        const currentCount = getTotalScraped();

        // Catat ke daftar riwayat seenPosts agar tidak di-scrape ulang
        seenPosts.add(request.url);

        log.info(
            `[#${currentCount}] @${details.username ?? 'unknown'} | ` +
            `Likes: ${details.likes ?? 0} | ` +
            `Comments: ${details.comments ?? 0} | ` +
            `Views: ${details.views ?? '-'} | ` +
            `Tipe: ${details.postType} | ` +
            `URL: ${request.url}`
        );

        // Simpan baris data ke Dataset Apify
        await Actor.pushData(formatPost(inputUrl ?? request.url, request.url, details));

        // Jeda acak antar post detail agar pola request aman dan cepat
        await randomSleep(800, 1500);
    });

    return router;
}
