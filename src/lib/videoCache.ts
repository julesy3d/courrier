import { Paths, File, Directory } from 'expo-file-system';

// ═══════════════════════════════════════════════
// VIDEO FILE CACHE
// Downloads remote videos to local disk so the
// VideoPlayer can load them instantly.
// ═══════════════════════════════════════════════

const CACHE_SUBDIR = 'videos';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_CACHE_BYTES = 200 * 1024 * 1024; // 200 MB

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
    const cached = resolvedMap.get(remoteUrl);
    if (cached) {
        const file = new File(cached);
        if (file.exists) {
            return cached;
        }
        // File was purged by iOS — remove stale entry and re-download
        resolvedMap.delete(remoteUrl);
        prefetchVideo(remoteUrl).catch(() => {});
        return remoteUrl;
    }
    return remoteUrl;
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

// ═══════════════════════════════════════════════
// CONCURRENCY-LIMITED PREFETCH QUEUE
// Downloads front-of-pool first, max 3 at a time.
// Direct prefetchVideo() calls bypass the queue
// (for swap-gate priority) and dedup via inflight.
// ═══════════════════════════════════════════════

const PREFETCH_CONCURRENCY = 3;
const prefetchQueue: string[] = [];
let prefetchActive = 0;

function drainPrefetchQueue(): void {
    while (prefetchActive < PREFETCH_CONCURRENCY && prefetchQueue.length > 0) {
        const url = prefetchQueue.shift()!;
        prefetchActive++;
        prefetchVideo(url).catch(() => {}).finally(() => {
            prefetchActive--;
            drainPrefetchQueue();
        });
    }
}

/**
 * Queue videos for concurrency-limited prefetch. Fire-and-forget.
 * Cards are downloaded front-to-back (pool order = priority order).
 */
export function prefetchCardVideos(cards: Array<{ video_url: string }>): void {
    for (const c of cards) {
        prefetchQueue.push(c.video_url);
    }
    drainPrefetchQueue();
}

/**
 * Clean up cached files that are NOT needed by current matchups.
 * Call on app startup AFTER card pool is loaded.
 * Pass the set of video URLs that are currently in the pool.
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

        // Enforce size cap on remaining files
        const remaining = dir.list();
        const files: File[] = [];
        let totalSize = 0;
        for (const entry of remaining) {
            if (entry instanceof File) {
                totalSize += entry.size;
                files.push(entry);
            }
        }

        if (totalSize > MAX_CACHE_BYTES) {
            // Sort oldest first by modification time
            files.sort((a, b) => (a.modificationTime ?? 0) - (b.modificationTime ?? 0));
            let evicted = 0;
            for (const file of files) {
                if (totalSize <= MAX_CACHE_BYTES) break;
                if (keepFilenames.has(file.name)) continue;
                const fileSize = file.size;
                file.delete();
                totalSize -= fileSize;
                evicted++;
            }

            // Clean up resolvedMap entries for evicted files
            for (const [url, uri] of resolvedMap.entries()) {
                const f = new File(uri);
                if (!f.exists) {
                    resolvedMap.delete(url);
                }
            }

            if (evicted > 0) {
                console.log(`[videoCache] evicted ${evicted} files to stay under size cap`);
            }
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
