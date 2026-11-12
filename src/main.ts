import { Actor, log } from 'apify';
import { PlaywrightCrawler } from 'crawlee';

import { buildInstagramCookies } from './cookies.js';
import { cleanHashtag, randomSleep } from './extractors.js';
import { createRouter } from './routes.js';
import { loadSeenPosts, saveSeenPosts } from './state.js';
import type { InputSchema } from './types.js';

// Inisialisasi Apify Actor SDK
await Actor.init();

// Set untuk melacak URL postingan yang sudah pernah di-scrape (Deduplikasi)
let seenPosts = new Set<string>();

// State eksekusi untuk melacak status tantangan dan total postingan
const executionState = {
    totalScrapedPosts: 0,
    challengeEncountered: false,
    challengeReason: '',
};

function handlePostScraped(): void {
    executionState.totalScrapedPosts++;
}

function getTotalScraped(): number {
    return executionState.totalScrapedPosts;
}

function handleChallengeDetected(reason: string): void {
    executionState.challengeEncountered = true;
    executionState.challengeReason = reason;
}

function isBlocked(): boolean {
    return executionState.challengeEncountered;
}

// Handler saat proses crawling dihentikan paksa (abort) di platform Apify
Actor.on('aborting', async () => {
    log.info('Proses dihentikan (aborting). Menyimpan riwayat terakhir ke Key-Value Store...');
    await saveSeenPosts(seenPosts);
    await Actor.exit();
});

// Ambil data input dari INPUT.json atau Apify Console UI
const input = (await Actor.getInput<InputSchema>()) || {};

// Validasi keberadaan autentikasi
if (!input.sessionid && !input.cookies) {
    throw new Error('Autentikasi gagal: Harap sediakan "sessionid" atau "cookies" di konfigurasi INPUT!');
}

// Catat waktu mulai run untuk membatasi durasi maksimal (< 1 menit 20 detik)
const runStartTime = Date.now();
// Batas maksimal durasi eksekusi per run: default 70 detik, batas atas mutlak 75 detik (agar selalu < 80 detik / 1m 20d)
const maxRunTimeSecs = Math.min(input.maxRunTimeSecs ?? 70, 75);
const isTimeUp = (): boolean => (Date.now() - runStartTime) >= maxRunTimeSecs * 1000;

// 1. Muat riwayat postingan yang sudah pernah di-scrape dari Named Store
seenPosts = await loadSeenPosts();

// 2. Siapkan parameter siklus perulangan (schedule repeat)
const repeatCount = input.repeatCount ?? 1;
const delayBetweenRunsSec = Math.max(input.delayBetweenRunsSec ?? 60, 10);

// 3. Susun cookies browser (sessionid + ekstraksi ds_user_id)
const cookiesToSet = buildInstagramCookies(input);

// 4. Inisialisasi router halaman (SEARCH & POST_DETAIL)
const router = createRouter({
    input,
    seenPosts,
    onPostScraped: handlePostScraped,
    getTotalScraped,
    onChallengeDetected: handleChallengeDetected,
    isBlocked,
    isTimeUp,
});

log.info(`Scraper siap dijalankan (Batas waktu run: ${maxRunTimeSecs} detik, total ${repeatCount} siklus).`);

// ==========================================
// LOOP SIKLUS PERULANGAN (SCHEDULE RUNS)
// ==========================================
for (let cycle = 1; cycle <= repeatCount; cycle++) {
    if (isTimeUp()) {
        log.info(`[Batas Waktu Run] Waktu telah berjalan ${Math.round((Date.now() - runStartTime) / 1000)} detik. Menghentikan siklus agar run tetap di bawah 1 menit 20 detik.`);
        break;
    }

    log.info(`\n==================================================`);
    log.info(`🚀 MEMULAI SIKLUS ${cycle} DARI TOTAL ${repeatCount} SIKLUS`);
    log.info(`==================================================`);

    // Reset status challenge per siklus
    executionState.challengeEncountered = false;
    executionState.challengeReason = '';

    // Siapkan daftar URL awal pencarian (Hashtag / Keyword) dengan uniqueKey agar tidak di-skip oleh Crawlee
    const startRequests: { url: string; uniqueKey: string; label: string; userData: { searchType: 'Hashtag' | 'Keyword'; query: string } }[] = [];

    if (input.hashtag) {
        const sanitizedHashtag = cleanHashtag(input.hashtag);
        startRequests.push({
            url: `https://www.instagram.com/explore/tags/${sanitizedHashtag}/`,
            uniqueKey: `SEARCH_HASHTAG_${sanitizedHashtag}_${Date.now()}_${Math.random()}`,
            label: 'SEARCH',
            userData: { searchType: 'Hashtag', query: sanitizedHashtag }
        });
    }

    if (input.keyword) {
        const trimmedKeyword = input.keyword.trim();
        startRequests.push({
            url: `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(trimmedKeyword)}`,
            uniqueKey: `SEARCH_KEYWORD_${trimmedKeyword}_${Date.now()}_${Math.random()}`,
            label: 'SEARCH',
            userData: { searchType: 'Keyword', query: trimmedKeyword }
        });
    }

    if (startRequests.length === 0) {
        throw new Error('Harap masukkan setidaknya satu "hashtag" atau "keyword" untuk di-scrape!');
    }

    // Inisialisasi PlaywrightCrawler dengan anti-deteksi bot
    const crawler = new PlaywrightCrawler({
        maxConcurrency: 1, // Tetap 1 demi keamanan akun dari rate limit
        maxRequestRetries: 1,
        requestHandlerTimeoutSecs: maxRunTimeSecs + 15,

        launchContext: {
            launchOptions: {
                args: [
                    '--disable-blink-features=AutomationControlled',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                ],
            },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        },

        preNavigationHooks: [
            async ({ page }, gotoOptions) => {
                await page.context().addCookies(cookiesToSet);
                if (gotoOptions) {
                    Object.assign(gotoOptions, { waitUntil: 'domcontentloaded' });
                }
            }
        ],

        requestHandler: router,

        failedRequestHandler({ request }) {
            log.error(`Request gagal setelah percobaan: ${request.url}`);
        },
    });

    // Jalankan crawler untuk siklus saat ini
    await crawler.run(startRequests);

    // Simpan progres ke Key-Value Store segera setelah siklus selesai
    await saveSeenPosts(seenPosts);

    // Jika akun terdeteksi mendapat CAPTCHA / checkpoint, hentikan seluruh siklus lebih awal demi keamanan
    if (executionState.challengeEncountered) {
        log.error(`[GRACEFUL STOP] Siklus dihentikan pada putaran ${cycle}/${repeatCount} karena: ${executionState.challengeReason}`);
        log.warning('Seluruh data yang telah di-scrape telah tersimpan dengan aman.');
        log.warning('Silakan buka Instagram di browser Anda untuk menyelesaikan verifikasi sebelum menjalankan scraper kembali.');
        break;
    }

    // Jika waktu run sudah habis, hentikan loop
    if (isTimeUp()) {
        log.info(`[Batas Waktu Run] Durasi run ${Math.round((Date.now() - runStartTime) / 1000)} detik tercapai. Mengakhiri run dengan aman.`);
        break;
    }

    log.info(`[Siklus ${cycle}/${repeatCount} Selesai] Total akumulasi postingan tersimpan: ${executionState.totalScrapedPosts}.`);

    // Jika masih ada siklus berikutnya, lakukan jeda waktu aman (hanya jika waktu masih tersisa)
    if (cycle < repeatCount) {
        const remainingSecs = Math.max(0, maxRunTimeSecs - Math.round((Date.now() - runStartTime) / 1000));
        if (remainingSecs <= delayBetweenRunsSec) {
            log.info(`Sisa waktu (${remainingSecs} detik) tidak mencukupi untuk jeda antar siklus. Mengakhiri run agar tetap di bawah 1m 20d.`);
            break;
        }
        log.info(`Menunggu jeda aman ${delayBetweenRunsSec} detik sebelum memulai siklus ${cycle + 1}...`);
        await randomSleep(delayBetweenRunsSec * 1000, (delayBetweenRunsSec + 10) * 1000);
    }
}

if (executionState.totalScrapedPosts === 0) {
    log.warning('Tidak ada hasil tersimpan. Periksa log navigasi, diagnostik pencarian, dan kegagalan detail di atas.');
}

log.info(`\n🎉 Seluruh proses scraping selesai! Total ${executionState.totalScrapedPosts} postingan berhasil dikumpulkan.`);

await Actor.exit();
