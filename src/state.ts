import { Actor, log } from 'apify';

const STORE_NAME = 'instagram-scraped-history';
const RECORD_KEY = 'SEEN_POSTS';

/**
 * Memuat riwayat postingan yang sudah pernah di-scrape menggunakan Named Key-Value Store.
 * Penggunaan Named Store ('instagram-scraped-history') memastikan riwayat TIDAK terhapus
 * saat crawler dijalankan ulang secara lokal maupun di platform Apify.
 */
export async function loadSeenPosts(): Promise<Set<string>> {
    try {
        const store = await Actor.openKeyValueStore(STORE_NAME);
        const stored = await store.getValue<string[]>(RECORD_KEY);
        if (Array.isArray(stored)) {
            log.info(`[Riwayat] Berhasil memuat ${stored.length} postingan yang pernah di-scrape sebelumnya.`);
            return new Set(stored);
        }
    } catch (err) {
        log.warning(`Gagal membaca riwayat postingan lama: ${(err as Error).message}`);
    }
    return new Set<string>();
}

/**
 * Menyimpan riwayat postingan ke Named Key-Value Store.
 */
export async function saveSeenPosts(seenPosts: Set<string>): Promise<void> {
    try {
        const store = await Actor.openKeyValueStore(STORE_NAME);
        const list = Array.from(seenPosts);
        await store.setValue(RECORD_KEY, list);
        log.info(`[Riwayat] Total ${list.length} postingan unik tersimpan di Key-Value Store "${STORE_NAME}".`);
    } catch (err) {
        log.error(`Gagal menyimpan riwayat postingan: ${(err as Error).message}`);
    }
}
