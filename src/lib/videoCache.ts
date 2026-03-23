import { Paths, File, Directory } from 'expo-file-system';

// ═══════════════════════════════════════════════
// VIDEO FILE CACHE
// Downloads remote videos to local disk so the
// VideoPlayer can load them instantly.
// ═══════════════════════════════════════════════

const CACHE_SUBDIR = 'videos';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// In-flight downloads — prevents duplicate parallel downloads of the same URL
const inflight = new Map<string, Promise<string>>();

// Synchronous lookup: remote URL → local file URI (populated after successful downloads)
const resolvedMap = new Map<string, string>();

/**
 * Deterministic local filename from a remote URL.
 * Uses the last two path segments (userId/timestamp.mp4) to keep it readable.
 */
function localFilename(url: string): string {
    try {
        const path = new URL(url).pathname;
        // e.g. /storage/v1/object/public/card_videos/userId/1234.mp4 → userId_1234.mp4
        const segments = path.split('/').filter(Boolean);
        const last2 = segments.slice(-2).join('_');
        return last2 || `${hashCode(url)}.mp4`;
    } catch {
        return `${hashCode(url)}.mp4`;
    }
}

function hashCode(s: string): string {
    let h = 0;
    for (let i = 0; i < s.length; i++) {
        h = (Math.imul(31, h) + s.charCodeAt(i)) | 0;
    }
    return Math.abs(h).toString(36);
}

/**
 * Get the cache directory, creating it if needed.
 */
function getCacheDir(): Directory {
    const dir = new Directory(Paths.cache, CACHE_SUBDIR);
    if (!dir.exists) {
        dir.create();
    }
    return dir;
}

/**
 * Synchronous lookup: returns local cached URI if available, otherwise the remote URL.
 * This is what CardFace should call at render time — zero async, zero delay.
 */
export function getVideoUri(remoteUrl: string): string {
    return resolvedMap.get(remoteUrl) ?? remoteUrl;
}

/**
 * Prefetch a video to local disk. Returns the local file URI.
 * If already cached, returns immediately. If already downloading, awaits the same promise.
 * Populates the synchronous resolvedMap on success.
 */
export async function prefetchVideo(url: string): Promise<string> {
    // Already resolved in memory?
    const resolved = resolvedMap.get(url);
    if (resolved) return resolved;

    const filename = localFilename(url);
    const file = new File(Paths.cache, CACHE_SUBDIR, filename);

    // Already on disk?
    if (file.exists) {
        resolvedMap.set(url, file.uri);
        return file.uri;
    }

    // Already downloading?
    const existing = inflight.get(url);
    if (existing) return existing;

    // Start download
    const downloadPromise = (async () => {
        try {
            const dir = getCacheDir();
            const downloaded = await File.downloadFileAsync(url, dir);
            // Rename to our deterministic filename
            const dest = new File(dir, filename);
            if (!dest.exists) {
                downloaded.move(dest);
            }
            resolvedMap.set(url, dest.uri);
            return dest.uri;
        } catch (e) {
            console.warn('[videoCache] prefetch failed:', url, e);
            // On failure, return the remote URL — the player will download it directly
            return url;
        } finally {
            inflight.delete(url);
        }
    })();

    inflight.set(url, downloadPromise);
    return downloadPromise;
}

/**
 * Prefetch all videos from a list of matchups. Fire-and-forget.
 */
export function prefetchMatchupVideos(matchups: Array<{ card_a: { video_url: string }; card_b: { video_url: string } }>): void {
    for (const m of matchups) {
        prefetchVideo(m.card_a.video_url).catch(() => { });
        prefetchVideo(m.card_b.video_url).catch(() => { });
    }
}

/**
 * Clean up cached files that are NOT needed by current matchups.
 * Call on app startup AFTER syncMatchups has populated cachedMatchups.
 * Pass the set of video URLs that are currently in the queue (matchups).
 */
export function cleanVideoCache(activeUrls: string[] = []): void {
    try {
        const dir = new Directory(Paths.cache, CACHE_SUBDIR);
        if (!dir.exists) return;

        // Build set of filenames we need to keep
        const keepFilenames = new Set<string>();
        for (const url of activeUrls) {
            keepFilenames.add(localFilename(url));
        }

        const entries = dir.list();
        let removed = 0;

        for (const entry of entries) {
            if (entry instanceof File) {
                if (!keepFilenames.has(entry.name)) {
                    // Not needed by any queued matchup — safe to delete
                    entry.delete();
                    removed++;
                }
            }
        }

        // Also clean up resolvedMap entries for deleted files
        for (const [url, uri] of resolvedMap.entries()) {
            const file = new File(uri);
            if (!file.exists) {
                resolvedMap.delete(url);
            }
        }

        if (removed > 0) {
            console.log(`[videoCache] cleaned ${removed} unused files`);
        }
    } catch (e) {
        console.warn('[videoCache] cleanup error:', e);
    }
}

/**
 * Nuke the entire video cache. Used on hard reset.
 */
export function clearVideoCache(): void {
    try {
        const dir = new Directory(Paths.cache, CACHE_SUBDIR);
        if (dir.exists) {
            dir.delete();
        }
        resolvedMap.clear();
    } catch (e) {
        console.warn('[videoCache] clear error:', e);
    }
}
