import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { registerForPushNotifications } from './notifications';
import { supabase } from './supabase';
import { prefetchMatchupVideos } from './videoCache';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export type AppUser = {
    id: string;
    auth_id: string;
    display_name: string;
    push_token: string | null;
    lang: 'en' | 'fr';
    achievements: Achievement[];
    created_at: string;
    last_active_at: string;
};

export type Achievement = {
    type: string;
    emoji?: string;
    day?: string;
    awarded_at: string;
};

export type EmojiType = 'heart_fire' | 'thinking' | 'laughing' | 'mindblown';

export type EmojiTallies = {
    heart_fire?: number;
    thinking?: number;
    laughing?: number;
    mindblown?: number;
};

export const EMOJI_MAP: EmojiType[] = ['heart_fire', 'thinking', 'laughing', 'mindblown'];

export const EMOJI_DISPLAY: Record<EmojiType, string> = {
    heart_fire: '\u2764\uFE0F\u200D\uD83D\uDD25',
    thinking: '🤔',
    laughing: '😂',
    mindblown: '🤯',
};

export type Card = {
    id: string;
    video_url: string;
    creator_username: string;
    emoji_tallies: EmojiTallies;
    total_wins: number;
    comment_count: number;
};

export type Matchup = {
    matchup_id: string;
    card_a_id: string;
    card_b_id: string;
    card_a: Card;
    card_b: Card;
    created_at: string;
};

export type Comment = {
    id: string;
    post_id: string;
    author_id: string;
    body: string;
    created_at: string;
    author_name?: string;
};

export type LogEntry = {
    id: string;
    type: 'repost' | 'comment';
    user_name: string;
    user_id: string;
    body?: string;
    emoji?: EmojiType;
    created_at: string;
};

// ═══════════════════════════════════════════════
// STORE INTERFACE
// ═══════════════════════════════════════════════

interface CardsStore {
    // --- Auth (keep all existing auth actions unchanged) ---
    currentUser: AppUser | null;
    isLoading: boolean;
    signInAnonymously: () => Promise<void>;
    restoreSession: () => Promise<void>;
    createUser: (displayName: string, lang: 'en' | 'fr') => Promise<void>;
    loadCurrentUser: (authId: string) => Promise<void>;
    updateLanguage: (lang: 'en' | 'fr') => Promise<void>;

    // --- Locale (unchanged) ---
    localeOverride: 'en' | 'fr' | null;
    setLocaleOverride: (lang: 'en' | 'fr' | null) => void;

    // --- Matchups (replaces Deliveries) ---
    cachedMatchups: Matchup[];
    isSyncing: boolean;
    syncMatchups: () => Promise<Matchup[]>;

    // --- Judgment (replaces repost/dismiss) ---
    judgeMatchup: (matchupId: string, keptCardId: string, emoji?: EmojiType | null, streak?: number) => Promise<void>;

    // --- Creation ---
    createCard: (videoUrl: string) => Promise<string>;

    // --- Comments (unchanged) ---
    fetchComments: (postId: string) => Promise<Comment[]>;
    addComment: (postId: string, body: string) => Promise<Comment>;

    // --- Post log (unchanged) ---
    fetchPostLog: (postId: string) => Promise<LogEntry[]>;

    // --- Outbox (user's created cards) ---
    cachedOutbox: { id: string; video_url: string; emoji_tallies: EmojiTallies; pending_views: number; total_wins: number; created_at: string }[];
    fetchOutbox: () => Promise<void>;

    // --- Heartbeat (unchanged) ---
    heartbeat: () => Promise<void>;
}

// ═══════════════════════════════════════════════
// STORE IMPLEMENTATION
// ═══════════════════════════════════════════════

export const useStore = create<CardsStore>()(
    persist(
        (set, get) => ({
            // --- State ---
            currentUser: null,
            isLoading: true,
            localeOverride: null,
            cachedMatchups: [],
            isSyncing: false,
            cachedOutbox: [],

            // --- Auth (unchanged) ---
            signInAnonymously: async () => {
                const { error } = await supabase.auth.signInAnonymously();
                if (error) throw error;
            },

            restoreSession: async () => {
                set({ isLoading: true });
                try {
                    const { data: { session }, error } = await supabase.auth.getSession();
                    if (error) throw error;
                    if (session?.user) {
                        await get().loadCurrentUser(session.user.id);
                    } else {
                        set({ currentUser: null, isLoading: false });
                    }
                } catch (e) {
                    console.error('Error restoring session', e);
                    set({ currentUser: null, isLoading: false });
                }
            },

            loadCurrentUser: async (authId: string) => {
                try {
                    const { data, error } = await supabase
                        .from('users')
                        .select('*')
                        .eq('auth_id', authId)
                        .single();

                    if (error) {
                        if (error.code !== 'PGRST116') console.error('Error loading user', error);
                        set({ currentUser: null, isLoading: false });
                    } else {
                        set({ currentUser: data as AppUser, isLoading: false });
                        registerForPushNotifications(data.id).catch(console.error);
                    }
                } catch (e) {
                    console.error('Exception loading user', e);
                    set({ currentUser: null, isLoading: false });
                }
            },

            createUser: async (displayName: string, lang: 'en' | 'fr') => {
                const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                if (sessionError || !session) throw new Error('No active auth session');

                const { data, error } = await supabase
                    .from('users')
                    .insert({
                        auth_id: session.user.id,
                        display_name: displayName,
                        lang,
                    })
                    .select()
                    .single();

                if (error) throw error;
                set({ currentUser: data as AppUser });
                registerForPushNotifications(data.id).catch(console.error);
            },

            updateLanguage: async (lang: 'en' | 'fr') => {
                const { currentUser } = get();
                if (!currentUser) return;

                const { error } = await supabase
                    .from('users')
                    .update({ lang })
                    .eq('id', currentUser.id);

                if (error) throw error;
                set({ currentUser: { ...currentUser, lang } });
            },

            // --- Locale ---
            setLocaleOverride: (lang) => set({ localeOverride: lang }),

            // --- Matchups ---
            syncMatchups: async () => {
                if (get().isSyncing) return [];
                set({ isSyncing: true });
                try {
                    const { cachedMatchups } = get();
                    // High-water mark: get matchups created after the most recent cached one
                    const lastCreatedAt = cachedMatchups.length > 0
                        ? cachedMatchups[cachedMatchups.length - 1].created_at
                        : null;

                    const { data, error } = await supabase.rpc('sync_matchups', {
                        p_after: lastCreatedAt,
                    });
                    if (error) throw error;

                    const newMatchups = (data || []) as Matchup[];
                    const existingIds = new Set(cachedMatchups.map(m => m.matchup_id));
                    const trulyNew = newMatchups.filter(m => !existingIds.has(m.matchup_id));

                    const combined = [...cachedMatchups, ...trulyNew];
                    set({ cachedMatchups: combined });

                    // Prefetch videos for new matchups in the background
                    if (trulyNew.length > 0) {
                        prefetchMatchupVideos(trulyNew);
                    }

                    return trulyNew;
                } catch (e) {
                    console.error('Error syncing matchups', e);
                    return [];
                } finally {
                    set({ isSyncing: false });
                }
            },

            judgeMatchup: async (matchupId, keptCardId, emoji, streak = 1) => {
                // Optimistic: remove from cache IMMEDIATELY so the next render picks up the next matchup
                set({
                    cachedMatchups: get().cachedMatchups.filter(m => m.matchup_id !== matchupId),
                });

                const { error } = await supabase.rpc('judge_matchup', {
                    p_matchup_id: matchupId,
                    p_kept_card_id: keptCardId,
                    p_emoji: emoji ?? null,
                    p_streak: streak,
                });
                if (error) {
                    console.error('judge_matchup RPC error:', error);
                    // Don't throw — the matchup is already removed from cache.
                    // The judgment will be lost but the UX won't break.
                }
            },

            createCard: async (videoUrl) => {
                const { data, error } = await supabase.rpc('create_card', {
                    p_video_url: videoUrl,
                });
                if (error) throw error;
                return data as string; // post_id UUID
            },

            fetchOutbox: async () => {
                const { currentUser } = get();
                if (!currentUser) return;

                const { data, error } = await supabase
                    .from('posts')
                    .select('id, video_url, emoji_tallies, pending_views, total_wins, created_at')
                    .eq('sender_id', currentUser.id)
                    .order('created_at', { ascending: false });

                if (error) throw error;
                set({ cachedOutbox: data || [] });
            },

            // --- Heartbeat ---
            heartbeat: async () => {
                const { error } = await supabase.rpc('heartbeat');
                if (error) console.error('Heartbeat failed', error);
            },

            fetchPostLog: async (postId: string) => {
                const [{ data: reposts }, { data: comments }] = await Promise.all([
                    supabase
                        .from('reposts')
                        .select('id, user_id, emoji, created_at, user:users(display_name)')
                        .eq('post_id', postId)
                        .order('created_at', { ascending: true }),
                    supabase
                        .from('comments')
                        .select('id, author_id, body, created_at, author:users(display_name)')
                        .eq('post_id', postId)
                        .order('created_at', { ascending: true }),
                ]);

                const repostEntries = (reposts || []).map((r: any) => ({
                    id: r.id,
                    type: 'repost' as const,
                    user_name: r.user?.display_name || 'Unknown',
                    user_id: r.user_id,
                    emoji: r.emoji,
                    created_at: r.created_at,
                }));

                const commentEntries = (comments || []).map((c: any) => ({
                    id: c.id,
                    type: 'comment' as const,
                    user_name: c.author?.display_name || 'Unknown',
                    user_id: c.author_id,
                    body: c.body,
                    created_at: c.created_at,
                }));

                return [...repostEntries, ...commentEntries]
                    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
            },

            // --- Comments (not persisted — fetched fresh) ---
            fetchComments: async (postId: string) => {
                const { data, error } = await supabase
                    .from('comments')
                    .select('*, author:users(id, display_name)')
                    .eq('post_id', postId)
                    .order('created_at', { ascending: true });

                if (error) throw error;

                return (data || []).map((row: any) => ({
                    id: row.id,
                    post_id: row.post_id,
                    author_id: row.author_id,
                    body: row.body,
                    created_at: row.created_at,
                    author_name: row.author?.display_name || 'Unknown',
                }));
            },

            addComment: async (postId: string, body: string) => {
                const { currentUser } = get();
                if (!currentUser) throw new Error('Not logged in');

                const { data, error } = await supabase
                    .from('comments')
                    .insert({
                        post_id: postId,
                        author_id: currentUser.id,
                        body: body.trim(),
                    })
                    .select()
                    .single();

                if (error) throw error;

                return {
                    ...data,
                    author_name: currentUser.display_name,
                } as Comment;
            },

        }),
        {
            name: 'cards-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                cachedMatchups: state.cachedMatchups,
                cachedOutbox: state.cachedOutbox,
            }),
        }
    )
);