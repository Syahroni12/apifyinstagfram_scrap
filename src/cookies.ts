import type { BrowserCookie, InputSchema } from './types.js';

/**
 * Menyusun daftar cookie browser Playwright dari input yang diberikan.
 * Mendukung input 'cookies' mentah (format key=value;) serta 'sessionid'.
 * Secara otomatis mengekstrak 'ds_user_id' dari sessionid untuk memastikan
 * sesi login Instagram valid dan tidak ditolak oleh server Instagram.
 *
 * @param input Data konfigurasi input dari Actor
 * @returns Array cookie yang siap dimasukkan ke Playwright browser context
 */
export function buildInstagramCookies(input: InputSchema): BrowserCookie[] {
    const cookies: BrowserCookie[] = [];

    // 1. Parsing jika user memberikan string cookies lengkap dari DevTools
    if (input.cookies && typeof input.cookies === 'string') {
        const pairs = input.cookies.split(';');
        for (const pair of pairs) {
            const idx = pair.indexOf('=');
            if (idx > -1) {
                const name = pair.slice(0, idx).trim();
                const value = pair.slice(idx + 1).trim();
                if (name && value) {
                    cookies.push({
                        name,
                        value,
                        domain: '.instagram.com',
                        path: '/',
                        secure: true,
                    });
                }
            }
        }
    }

    // 2. Tambahkan atau prioritaskan sessionid dari input.sessionid
    if (input.sessionid) {
        const rawSession = input.sessionid.trim();

        // Cek apakah sessionid sudah ada dari input.cookies
        const existingSessionIdx = cookies.findIndex(c => c.name === 'sessionid');
        if (existingSessionIdx > -1) {
            cookies[existingSessionIdx].value = rawSession;
        } else {
            cookies.push({
                name: 'sessionid',
                value: rawSession,
                domain: '.instagram.com',
                path: '/',
                secure: true,
                httpOnly: true,
            });
        }

        // 3. Ekstrak ds_user_id secara otomatis dari sessionid
        // Format standar sessionid Instagram: <ds_user_id>%3A<token> atau <ds_user_id>:<token>
        const hasDsUserId = cookies.some(c => c.name === 'ds_user_id');
        if (!hasDsUserId) {
            const decoded = decodeURIComponent(rawSession);
            const firstPart = decoded.split(':')[0];
            if (firstPart && /^\d+$/.test(firstPart)) {
                cookies.push({
                    name: 'ds_user_id',
                    value: firstPart,
                    domain: '.instagram.com',
                    path: '/',
                    secure: true,
                });
            }
        }
    }

    return cookies;
}

