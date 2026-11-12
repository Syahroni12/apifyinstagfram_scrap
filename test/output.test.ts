import { describe, expect, it } from 'vitest';
import { formatPost } from '../src/output.js';

describe('dataset output contract', () => {
    it('preserves exact Instagram IDs and normalizes reel URLs', () => {
        const result = formatPost('https://www.instagram.com/explore/search/keyword/?q=prabowo', 'https://www.instagram.com/reel/DZgFloKhxI6/');
        expect(result.id).toBe('3918156251791823418');
        expect(result.type).toBe('Video');
        expect(result.url).toBe('https://www.instagram.com/p/DZgFloKhxI6/');
        expect(result.inputUrl).toContain('?q=prabowo');
        expect(result.musicInfo).toEqual({ music_info: null, original_sound_info: null });
        expect(Object.keys(result)).toHaveLength(39);
        expect(Object.values(result)).not.toContain(undefined);
    });

    it('extracts caption tags and preserves zero metrics', () => {
        const result = formatPost('https://www.instagram.com/explore/tags/test/', 'https://www.instagram.com/p/ABC/', {
            url: 'https://www.instagram.com/p/ABC/', likes: 0, comments: 0, views: 0,
            username: 'author', caption: '#Indonesia #Indonesia #日本 @someone',
            timestamp: null, postType: 'Video', height: 1920, width: 1080,
            displayUrl: null, alt: null, videoDuration: null,
        });
        expect(result.hashtags).toEqual(['Indonesia', '日本']);
        expect(result.mentions).toEqual(['someone']);
        expect(result.likesCount).toBe(0);
        expect(result.videoViewCount).toBe(0);
        expect(result.dimensionsHeight).toBe(1920);
    });
});
