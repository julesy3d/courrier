import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { Image } from 'expo-image';
import { registerForPushNotifications } from './notifications';
import { supabase } from './supabase';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export type AppUser = {
    id: string;
    auth_id: string;
    display_name: string;
    push_token: string | null;
    lang: 'en' | 'fr';
    is_admin: boolean;
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

export type Card = {
    id: string;
    video_url: string;
    sender_id: string;
    creator_username: string;
    total_wins: number;
    caption: string | null;
};

// ═══════════════════════════════════════════════
// STORE INTERFACE
// ═══════════════════════════════════════════════

interface CardsStore {
    // --- Auth ---
    currentUser: AppUser | null;
    isLoading: boolean;
    signInAnonymously: () => Promise<void>;
    restoreSession: () => Promise<void>;
    createUser: (displayName: string, lang: 'en' | 'fr') => Promise<void>;
    loadCurrentUser: (authId: string) => Promise<void>;
    updateLanguage: (lang: 'en' | 'fr') => Promise<void>;

    // --- Locale ---
    localeOverride: 'en' | 'fr' | null;
    setLocaleOverride: (lang: 'en' | 'fr' | null) => void;

    // --- Card Pool ---
    cardPool: Card[];
    poolExcludeIds: string[];
    isPoolFetching: boolean;
    fetchCardPool: (count?: number) => Promise<Card[]>;

    // --- Judgment (fire-and-forget) ---
    reportJudgment: (
        cardAId: string,
        cardBId: string,
        keptCardId: string,
    ) => void;

    // --- Pool consumption ---
    popChallenger: (currentCardIds: string[], excludeSenderIds?: string[]) => Card | null;

    // --- Fuel return (fire-and-forget) ---
    returnUnusedCards: (cardIds: string[]) => void;

    // --- Creation ---
    createCard: (videoUrl: string, caption?: string | null) => Promise<string>;

    // --- Heartbeat ---
    heartbeat: () => Promise<void>;

    // --- UI ---
    showCamera: boolean;
    setShowCamera: (show: boolean) => void;
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
            cardPool: [],
            poolExcludeIds: [],
            isPoolFetching: false,
            showCamera: false,

            setShowCamera: (show: boolean) => set({ showCamera: show }),

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

            // --- Card Pool ---
            fetchCardPool: async (count = 10) => {
                if (get().isPoolFetching) return [];
                set({ isPoolFetching: true });
                try {
                    const { poolExcludeIds } = get();
                    console.warn(`[POOL] fetching ${count} cards, excluding ${poolExcludeIds.length} ids`);
                    const { data, error } = await supabase.rpc('fetch_card_pool', {
                        p_count: count,
                        p_exclude_ids: poolExcludeIds,
                    });
                    if (error) throw error;

                    const newCards = (data || []) as Card[];
                    console.warn(`[POOL] got ${newCards.length} cards`);
                    for (const c of newCards) {
                        console.warn(`[POOL]   ${c.id.slice(0, 8)} url=${c.video_url?.slice(0, 60)}`);
                    }
                    const newIds = newCards.map(c => c.id);

                    set({
                        cardPool: [...get().cardPool, ...newCards],
                        poolExcludeIds: [...poolExcludeIds, ...newIds],
                    });

                    // Prefetch images in background so they're on disk before display
                    if (newCards.length > 0) {
                        for (const c of newCards) {
                            Image.prefetch(c.video_url).catch(() => {});
                        }
                    }

                    return newCards;
                } catch (e) {
                    console.error('Error fetching card pool', e);
                    return [];
                } finally {
                    set({ isPoolFetching: false });
                }
            },

            // --- Judgment (fire-and-forget, never blocks UI) ---
            reportJudgment: (cardAId, cardBId, keptCardId) => {
                supabase.rpc('report_judgment', {
                    p_card_a_id: cardAId,
                    p_card_b_id: cardBId,
                    p_kept_card_id: keptCardId,
                }).then(({ error }) => {
                    if (error) console.error('report_judgment RPC error:', error);
                });
            },

            // --- Pop next challenger from pool ---
            popChallenger: (currentCardIds: string[], excludeSenderIds: string[] = []) => {
                const { cardPool } = get();
                console.warn(`[POOL] popChallenger called, pool size=${cardPool.length}, alive=${currentCardIds}`);

                const senderBlock = new Set(excludeSenderIds);

                // Find first card not on screen and not by same creator
                let idx = cardPool.findIndex(c =>
                    !currentCardIds.includes(c.id) &&
                    !senderBlock.has(c.sender_id)
                );

                // Fallback: ignore same-creator check, just find any card not on screen
                if (idx === -1) {
                    idx = cardPool.findIndex(c => !currentCardIds.includes(c.id));
                }

                if (idx === -1) {
                    console.warn(`[POOL] popChallenger: no card found, pool empty`);
                    return null;
                }

                const card = cardPool[idx];
                console.warn(`[POOL] popChallenger: returning ${card.id.slice(0, 8)} url=${card.video_url?.slice(0, 60)}`);
                const remaining = cardPool.filter((_, i) => i !== idx);
                set({ cardPool: remaining });

                // Pre-warm the NEXT card in pool so fast swipers never hit cold cache
                if (remaining.length > 0) {
                    Image.prefetch(remaining[0].video_url).catch(() => {});
                }

                // Trigger background refill if pool is getting low
                if (remaining.length < 5) {
                    get().fetchCardPool().catch(console.error);
                }

                return card;
            },

            // --- Return fuel for unplayed cards (fire-and-forget) ---
            returnUnusedCards: (cardIds: string[]) => {
                if (cardIds.length === 0) return;
                console.warn(`[POOL] returning fuel for ${cardIds.length} unplayed cards`);
                supabase.rpc('return_unused_cards', {
                    p_card_ids: cardIds,
                }).then(({ error }) => {
                    if (error) console.error('return_unused_cards RPC error:', error);
                });
            },

            createCard: async (videoUrl, caption) => {
                const { data, error } = await supabase.rpc('create_card', {
                    p_video_url: videoUrl,
                    p_caption: caption ?? null,
                });
                if (error) throw error;
                return data as string; // post_id UUID
            },

            // --- Heartbeat ---
            heartbeat: async () => {
                const { error } = await supabase.rpc('heartbeat');
                if (error) console.error('Heartbeat failed', error);
            },

        }),
        {
            name: 'cards-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                cardPool: state.cardPool,
                poolExcludeIds: state.poolExcludeIds,
            }),
        }
    )
);
