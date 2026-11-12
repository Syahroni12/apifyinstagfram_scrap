import type { formatPost } from './output.js';

/**
 * Tipe data input yang diterima dari INPUT.json atau UI Apify Console
 */
export interface InputSchema {
    /** Cookie sessionid dari Instagram */
    sessionid?: string;
    /** String cookies lengkap dari browser (opsional) */
    cookies?: string;
    /** Hashtag yang ingin di-scrape (misal: "jember") */
    hashtag?: string;
    /** Keyword pencarian explore (misal: "wisata jember") */
    keyword?: string;
    /** Jumlah maksimal postingan yang ingin diambil per query dalam 1 siklus */
    maxPosts?: number;
    /** Jumlah iterasi scroll ke bawah */
    scrollCount?: number;
    /** Apakah ingin membuka dan mengambil detail (like, komentar, view, caption) */
    scrapeDetails?: boolean;
    /** Apakah ingin melewati (skip) postingan yang sudah pernah di-scrape sebelumnya */
    skipSeenPosts?: boolean;
    /** Jumlah siklus perulangan run otomatis (misal: 65 kali) */
    repeatCount?: number;
    /** Jeda waktu antar siklus dalam detik (default: 60 detik) */
    delayBetweenRunsSec?: number;
    /** Batas maksimal durasi eksekusi per run dalam detik (default: 75 detik, selalu di bawah 1m 20d) */
    maxRunTimeSecs?: number;
}

/**
 * Data userData yang ditempelkan pada setiap request Crawlee
 */
export interface RequestUserData {
    inputUrl?: string;
    searchType: 'Hashtag' | 'Keyword';
    query: string;
}

/**
 * Struktur data postingan Instagram yang disimpan ke dataset
 */
export type ScrapedPost = ReturnType<typeof formatPost>;

/**
 * Tipe cookie browser Playwright
 */
export interface BrowserCookie {
    name: string;
    value: string;
    domain: string;
    path: string;
    secure?: boolean;
    httpOnly?: boolean;
}
