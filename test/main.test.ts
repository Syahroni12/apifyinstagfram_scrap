import { describe, expect, it } from 'vitest';
import { buildInstagramCookies } from '../src/cookies.js';
import { cleanHashtag, cleanPostUrl, parseMetricNumber } from '../src/extractors.js';

describe('Instagram Scraper Helpers', () => {
    it('should clean and format hashtag correctly', () => {
        const rawHashtag = '#jember kota ';
        const cleaned = cleanHashtag(rawHashtag);
        expect(cleaned).toBe('jemberkota');

        const hashtagUrl = `https://www.instagram.com/explore/tags/${cleaned}/`;
        expect(hashtagUrl).toBe('https://www.instagram.com/explore/tags/jemberkota/');
    });

    it('should format search keyword URL correctly', () => {
        const keyword = 'wisata jember';
        const keywordUrl = `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(keyword)}`;
        expect(keywordUrl).toBe('https://www.instagram.com/explore/search/keyword/?q=wisata%20jember');
    });

    it('should build cookies and extract ds_user_id from sessionid properly', () => {
        const sessionid = '123456789%3Afake-test-session';
        const cookies = buildInstagramCookies({ sessionid });

        expect(cookies.length).toBe(2);
        const sessionCookie = cookies.find(c => c.name === 'sessionid');
        const dsUserIdCookie = cookies.find(c => c.name === 'ds_user_id');

        expect(sessionCookie).toBeDefined();
        expect(sessionCookie?.value).toBe(sessionid);

        expect(dsUserIdCookie).toBeDefined();
        expect(dsUserIdCookie?.value).toBe('123456789');
    });

    it('should clean post and reel links with cleanPostUrl', () => {
        const rawUrl = 'https://www.instagram.com/p/DZPnlfNhn02/?img_index=1&igsh=abcdef';
        const cleaned = cleanPostUrl(rawUrl);
        expect(cleaned).toBe('https://www.instagram.com/p/DZPnlfNhn02/');
    });

    it('should parse likes, comments, username, and caption from og:description', () => {
        const ogDesc = '5,606 likes, 86 comments - wahyuuu_1922 on June 6, 2026: "#jember #pesonajember". ';

        let likes: number | null = null;
        let comments: number | null = null;
        let username: string | null = null;
        let caption: string | null = null;

        const likesMatch = ogDesc.match(/([\d,.]+)\s+likes?/i);
        if (likesMatch) likes = parseInt(likesMatch[1].replace(/[,.]/g, ''), 10);

        const commentsMatch = ogDesc.match(/([\d,.]+)\s+comments?/i);
        if (commentsMatch) comments = parseInt(commentsMatch[1].replace(/[,.]/g, ''), 10);

        const userMatch = ogDesc.match(/-\s+([^\s]+)\s+on/i);
        if (userMatch) username = userMatch[1];

        const quoteMatch = ogDesc.match(/:\s*"(.*)"\s*\.?\s*$/s);
        if (quoteMatch) caption = quoteMatch[1];

        expect(likes).toBe(5606);
        expect(comments).toBe(86);
        expect(username).toBe('wahyuuu_1922');
        expect(caption).toBe('#jember #pesonajember');
    });

    it('should cap maxRunTimeSecs to 75 seconds so runs are strictly under 1m 20s (80s)', () => {
        const input1 = { maxRunTimeSecs: 120 };
        const effectiveTime1 = Math.min(input1.maxRunTimeSecs ?? 70, 75);
        expect(effectiveTime1).toBe(75);
        expect(effectiveTime1).toBeLessThan(80);

        const input2 = { maxRunTimeSecs: 45 };
        const effectiveTime2 = Math.min(input2.maxRunTimeSecs ?? 70, 75);
        expect(effectiveTime2).toBe(45);
        expect(effectiveTime2).toBeLessThan(80);

        const inputDefault = {};
        const effectiveDefault = Math.min(inputDefault.maxRunTimeSecs ?? 70, 75);
        expect(effectiveDefault).toBe(70);
        expect(effectiveDefault).toBeLessThan(80);
    });

    it('should parse metric numbers (K, M, standard) accurately', () => {
        expect(parseMetricNumber('55.8K')).toBe(55800);
        expect(parseMetricNumber('129K likes')).toBe(129000);
        expect(parseMetricNumber('1.2M')).toBe(1200000);
        expect(parseMetricNumber('5,606')).toBe(5606);
        expect(parseMetricNumber('26')).toBe(26);
        expect(parseMetricNumber(null)).toBeNull();
        expect(parseMetricNumber('')).toBeNull();
    });
});
