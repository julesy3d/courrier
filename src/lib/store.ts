import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { registerForPushNotifications } from './notifications';
import { supabase } from './supabase';

// ═══════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════

export type AppUser = {
    id: string;
    auth_id: string;
    display_name: string;
    phone_hash: string | null;
    lang: 'en' | 'fr';
    push_token: string | null;
    created_at: string;
    last_active_at: string; // NEW
};

export type Post = {
    id: string;
    sender_id: string;
    recto_url: string;
    selfie_url: string | null;
    sent_at: string;
    score: number;       // NEW — total nodes reached
    body: string | null;  // NEW — null = photo card, non-null = text card
};

export type Delivery = {
    id: string;
    post_id: string;
    recipient_id: string;
    source_user_id: string;
    source_delivery_id: string | null;
    action: 'pending' | 'reposted' | 'dismissed';
    delivered_at: string;
    opened_at: string | null;
    acted_at: string | null;
};

export type Repost = {
    id: string;
    post_id: string;
    user_id: string;
    created_at: string;
    user_name?: string; // joined from users table when fetching
};

export type Comment = {
    id: string;
    post_id: string;
    author_id: string;
    body: string;
    created_at: string;
    // Joined from users table when fetching
    author_name?: string;
};

export type LogEntry = {
    id: string;
    type: 'repost' | 'comment';
    user_name: string;
    user_id: string;
    body?: string;
    created_at: string;
};

// ═══════════════════════════════════════════════
// STORE INTERFACE
// ═══════════════════════════════════════════════

interface PostcardsStore {
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

    // --- Deliveries + Posts ---
    cachedDeliveries: Delivery[];
    cachedPosts: Record<string, Post>;
    cachedSenderMap: Record<string, string>;
    isSyncing: boolean;
    syncDeliveries: () => Promise<Delivery[]>;
    markDeliveryOpened: (deliveryId: string) => Promise<void>;
    getPostForDelivery: (delivery: Delivery) => Post | undefined;

    // --- Create ---
    createPostcard: (params: {
        rectoUrl?: string;
        selfieUrl?: string | null;
        body?: string;
    }) => Promise<string>;

    // --- Repost / Dismiss ---
    repostCard: (deliveryId: string) => Promise<void>;
    dismissCard: (deliveryId: string) => Promise<void>;
    fetchPostLog: (postId: string) => Promise<Array<{
        id: string;
        type: 'repost' | 'comment';
        user_name: string;
        user_id: string;
        body?: string;
        created_at: string;
    }>>;

    // --- Comments (not persisted) ---
    fetchComments: (postId: string) => Promise<Comment[]>;
    addComment: (postId: string, body: string) => Promise<Comment>;

    // --- Outbox ---
    cachedOutbox: Post[];
    fetchOutbox: () => Promise<void>;

    // --- Heartbeat ---
    heartbeat: () => Promise<void>;
}

// ═══════════════════════════════════════════════
// STORE IMPLEMENTATION
// ═══════════════════════════════════════════════

export const useStore = create<PostcardsStore>()(
    persist(
        (set, get) => ({
            // --- State ---
            currentUser: null,
            isLoading: true,
            localeOverride: null,
            cachedDeliveries: [],
            cachedPosts: {},
            cachedSenderMap: {},
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

            // --- Deliveries + Posts ---
            syncDeliveries: async () => {
                if (get().isSyncing) return [];
                set({ isSyncing: true });

                const { currentUser, cachedDeliveries, cachedPosts, cachedSenderMap } = get();
                if (!currentUser) {
                    set({ isSyncing: false });
                    return [];
                }

                try {
                    // High-water mark on delivered_at
                    const lastDeliveredAt = cachedDeliveries.reduce((max, d) => {
                        return d.delivered_at > max ? d.delivered_at : max;
                    }, currentUser.created_at);

                    // Fetch new pending deliveries with their posts
                    const { data: rows, error } = await supabase
                        .from('deliveries')
                        .select('*, post:posts(*)')
                        .eq('recipient_id', currentUser.id)
                        .eq('action', 'pending')
                        .gt('delivered_at', lastDeliveredAt)
                        .order('delivered_at', { ascending: false });

                    if (error) throw error;
                    if (!rows || rows.length === 0) return [];

                    // Separate deliveries from posts
                    const newPosts = { ...cachedPosts };
                    const newDeliveries: Delivery[] = rows.map((row: any) => {
                        if (row.post) {
                            newPosts[row.post.id] = row.post as Post;
                        }
                        const { post, ...delivery } = row;
                        return delivery as Delivery;
                    });

                    // Fetch missing sender display names (source_user_id = who sent/reposted it to you)
                    const senderMap = { ...cachedSenderMap };
                    const newSenderIds = [...new Set(newDeliveries.map(d => d.source_user_id))]
                        .filter(id => !senderMap[id]);

                    if (newSenderIds.length > 0) {
                        const { data: senders } = await supabase
                            .from('users')
                            .select('id, display_name')
                            .in('id', newSenderIds);

                        if (senders) {
                            senders.forEach((s: any) => { senderMap[s.id] = s.display_name; });
                        }
                    }

                    // Also cache the post creators' names
                    const creatorIds = [...new Set(
                        newDeliveries
                            .map(d => newPosts[d.post_id]?.sender_id)
                            .filter((id): id is string => !!id && !senderMap[id])
                    )];

                    if (creatorIds.length > 0) {
                        const { data: creators } = await supabase
                            .from('users')
                            .select('id, display_name')
                            .in('id', creatorIds);

                        if (creators) {
                            creators.forEach((s: any) => { senderMap[s.id] = s.display_name; });
                        }
                    }

                    // Merge, deduplicate, sort
                    const existingIds = new Set(cachedDeliveries.map(d => d.id));
                    const trulyNew = newDeliveries.filter(d => !existingIds.has(d.id));

                    const combined = [...trulyNew, ...cachedDeliveries]
                        .sort((a, b) => new Date(b.delivered_at).getTime() - new Date(a.delivered_at).getTime());

                    set({
                        cachedDeliveries: combined,
                        cachedPosts: newPosts,
                        cachedSenderMap: senderMap,
                    });

                    return trulyNew;
                } catch (e) {
                    console.error('Error in delta sync', e);
                    return [];
                } finally {
                    set({ isSyncing: false });
                }
            },

            markDeliveryOpened: async (deliveryId: string) => {
                const { error } = await supabase
                    .from('deliveries')
                    .update({ opened_at: new Date().toISOString() })
                    .eq('id', deliveryId);

                if (error) throw error;

                set({
                    cachedDeliveries: get().cachedDeliveries.map(d =>
                        d.id === deliveryId ? { ...d, opened_at: new Date().toISOString() } : d
                    ),
                });
            },

            getPostForDelivery: (delivery: Delivery) => {
                return get().cachedPosts[delivery.post_id];
            },

            // --- Create ---
            createPostcard: async (params) => {
                const { data, error } = await supabase.rpc('create_postcard', {
                    p_recto_url: params.rectoUrl || null,
                    p_selfie_url: params.selfieUrl || null,
                    p_body: params.body || null,
                });

                if (error) throw error;
                return data as string; // post_id UUID
            },

            // --- Repost / Dismiss ---
            repostCard: async (deliveryId: string) => {
                const { error } = await supabase.rpc('repost_card', {
                    p_delivery_id: deliveryId,
                });
                if (error) throw error;

                set({
                    cachedDeliveries: get().cachedDeliveries.filter(d => d.id !== deliveryId),
                });
            },

            dismissCard: async (deliveryId: string) => {
                const { error } = await supabase.rpc('dismiss_card', {
                    p_delivery_id: deliveryId,
                });
                if (error) throw error;

                set({
                    cachedDeliveries: get().cachedDeliveries.filter(d => d.id !== deliveryId),
                });
            },

            // --- Outbox ---
            fetchOutbox: async () => {
                const { currentUser } = get();
                if (!currentUser) return;

                const { data, error } = await supabase
                    .from('posts')
                    .select('*')
                    .eq('sender_id', currentUser.id)
                    .order('sent_at', { ascending: false });

                if (error) throw error;
                set({ cachedOutbox: (data || []) as Post[] });
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
                        .select('id, user_id, created_at, user:users(display_name)')
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
            name: 'postcards-storage',  // NEW key — won't conflict with old 'postal-storage'
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                cachedDeliveries: state.cachedDeliveries,
                cachedPosts: state.cachedPosts,
                cachedSenderMap: state.cachedSenderMap,
                cachedOutbox: state.cachedOutbox,
            }),
        }
    )
);