import type { extractPostDetails } from './extractors.js';

type Details = Awaited<ReturnType<typeof extractPostDetails>>;

/** One stable output contract for successful extraction and URL-only results. */
export function formatPost(inputUrl: string, postUrl: string, details?: Details) {
    const shortCode = new URL(postUrl).pathname.match(/\/(?:p|reel)\/([^/]+)/)?.[1] ?? null;
    const caption = details?.caption ?? null;
    let id: string | null = null;
    if (shortCode && /^[A-Za-z0-9_-]+$/.test(shortCode)) {
        const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
        id = [...shortCode].reduce((value, char) => value * 64n + BigInt(alphabet.indexOf(char)), 0n).toString();
    }
    return {
        inputUrl,
        id,
        type: details?.postType === 'Reel' || details?.postType === 'Video' || postUrl.includes('/reel/') ? 'Video' : 'Image',
        shortCode,
        caption,
        hashtags: [...new Set([...caption?.matchAll(/#([\p{L}\p{N}_]+)/gu) ?? []].map(match => match[1]))],
        mentions: [...new Set([...caption?.matchAll(/@([A-Za-z0-9_.]+)/g) ?? []].map(match => match[1]))],
        url: shortCode ? `https://www.instagram.com/p/${shortCode}/` : postUrl,
        commentsCount: details?.comments ?? null,
        firstComment: null,
        latestComments: [],
        dimensionsHeight: details?.height ?? null,
        dimensionsWidth: details?.width ?? null,
        displayUrl: details?.displayUrl ?? null,
        images: [],
        likesCount: details?.likes ?? null,
        videoPlayCount: null,
        fbLikeCount: null,
        fbPlayCount: null,
        timestamp: details?.timestamp ?? null,
        childPosts: [],
        locationName: null,
        ownerFullName: null,
        ownerUsername: details?.username ?? null,
        ownerId: null,
        productType: null,
        videoDuration: details?.videoDuration ?? null,
        paidPartnership: null,
        taggedUsers: [],
        isPinned: null,
        musicInfo: { music_info: null, original_sound_info: null },
        coauthorProducers: [],
        sharesCount: null,
        originalHeight: details?.height ?? null,
        originalWidth: details?.width ?? null,
        alt: details?.alt ?? null,
        videoViewCount: details?.views ?? null,
        locationId: null,
        isCommentsDisabled: null,
    };
}
