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
};

export type Post = {
    id: string;
    sender_id: string;
    recto_url: string;
    selfie_url: string | null;
    sent_at: string;
};

export type Letter = {
    id: string;
    post_id: string;
    sender_id: string;
    recipient_id: string;
    sent_at: string;
    opened_at: string | null;
    notified: boolean;
    dismissed_at: string | null;
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

export interface CarnetContact {
    contactId: string;
    muted: boolean;
    addedAt: string;
}

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

    // --- Letters + Posts ---
    cachedLetters: Letter[];
    cachedPosts: Record<string, Post>;
    cachedSenderMap: Record<string, string>;
    isSyncing: boolean;
    syncLetters: () => Promise<Letter[]>;
    markLetterOpened: (letterId: string) => Promise<void>;
    getPostForLetter: (letter: Letter) => Post | undefined;

    // --- Carnet ---
    carnet: CarnetContact[];
    addContacts: (contactIds: string[]) => Promise<void>;
    removeContact: (contactId: string) => Promise<void>;
    toggleMute: (contactId: string) => Promise<void>;
    syncCarnet: () => Promise<void>;
    getActiveCarnetIds: () => string[];

    // --- Broadcast ---
    broadcastPostcard: (params: {
        rectoUrl: string;
        selfieUrl: string | null;
    }) => Promise<string>;  // returns post_id

    // --- Repost / Dismiss ---
    repostPostcard: (postId: string, letterId: string) => Promise<void>;
    dismissPostcard: (letterId: string) => Promise<void>;
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

    // --- Onboarding ---
    hasPostedFirst: boolean;
    setHasPostedFirst: (value: boolean) => void;
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
            cachedLetters: [],
            cachedPosts: {},
            cachedSenderMap: {},
            isSyncing: false,
            carnet: [],
            hasPostedFirst: false,

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

            // --- Letters + Posts ---
            syncLetters: async () => {
                if (get().isSyncing) return [];
                set({ isSyncing: true });

                const { currentUser, cachedLetters, cachedPosts, cachedSenderMap } = get();
                if (!currentUser) {
                    set({ isSyncing: false });
                    return [];
                }

                try {
                    // 1. High-water mark on sent_at
                    const lastSentAt = cachedLetters.reduce((max, l) => {
                        return l.sent_at > max ? l.sent_at : max;
                    }, currentUser.created_at);

                    // 2. Fetch new letters with their posts in one query
                    const { data: rows, error } = await supabase
                        .from('letters')
                        .select('*, post:posts(*)')
                        .eq('recipient_id', currentUser.id)
                        .gt('sent_at', lastSentAt)
                        .is('dismissed_at', null)
                        .order('sent_at', { ascending: false });

                    if (error) throw error;
                    if (!rows || rows.length === 0) return [];

                    // 3. Separate letters from posts
                    const newPosts = { ...cachedPosts };
                    const newLetters: Letter[] = rows.map((row: any) => {
                        // Extract and cache the post
                        if (row.post) {
                            newPosts[row.post.id] = row.post as Post;
                        }
                        // Return the letter without the joined post
                        const { post, ...letter } = row;
                        return letter as Letter;
                    });

                    // 4. Fetch missing sender display names
                    const senderMap = { ...cachedSenderMap };
                    const newSenderIds = [...new Set(newLetters.map(l => l.sender_id))]
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

                    // 5. Merge, deduplicate, sort
                    const existingIds = new Set(cachedLetters.map(l => l.id));
                    const trulyNew = newLetters.filter(l => !existingIds.has(l.id));

                    const combined = [...trulyNew, ...cachedLetters]
                        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

                    // 6. Persist
                    set({
                        cachedLetters: combined,
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

            markLetterOpened: async (letterId: string) => {
                const { error } = await supabase
                    .from('letters')
                    .update({ opened_at: new Date().toISOString() })
                    .eq('id', letterId);

                if (error) throw error;

                set({
                    cachedLetters: get().cachedLetters.map(l =>
                        l.id === letterId ? { ...l, opened_at: new Date().toISOString() } : l
                    ),
                });
            },

            getPostForLetter: (letter: Letter) => {
                return get().cachedPosts[letter.post_id];
            },

            // --- Carnet (unchanged) ---
            addContacts: async (contactIds: string[]) => {
                const { currentUser, carnet } = get();
                if (!currentUser) return;

                const rows = contactIds.map(id => ({ owner_id: currentUser.id, contact_id: id }));
                const { error } = await supabase
                    .from('carnet')
                    .upsert(rows, { onConflict: 'owner_id,contact_id' });

                if (error) throw error;

                const newCarnet = [...carnet];
                const now = new Date().toISOString();
                for (const id of contactIds) {
                    if (!newCarnet.find(c => c.contactId === id)) {
                        newCarnet.push({ contactId: id, muted: false, addedAt: now });
                    }
                }
                set({ carnet: newCarnet });
            },

            removeContact: async (contactId: string) => {
                const { currentUser, carnet } = get();
                if (!currentUser) return;

                const { error } = await supabase
                    .from('carnet')
                    .delete()
                    .match({ owner_id: currentUser.id, contact_id: contactId });

                if (error) throw error;
                set({ carnet: carnet.filter(c => c.contactId !== contactId) });
            },

            toggleMute: async (contactId: string) => {
                const { currentUser, carnet } = get();
                if (!currentUser) return;

                const contact = carnet.find(c => c.contactId === contactId);
                if (!contact) return;

                const newMuted = !contact.muted;
                const { error } = await supabase
                    .from('carnet')
                    .update({ muted: newMuted })
                    .match({ owner_id: currentUser.id, contact_id: contactId });

                if (error) throw error;
                set({
                    carnet: carnet.map(c =>
                        c.contactId === contactId ? { ...c, muted: newMuted } : c
                    ),
                });
            },

            syncCarnet: async () => {
                const { currentUser } = get();
                if (!currentUser) return;

                const { data, error } = await supabase
                    .from('carnet')
                    .select('contact_id, muted, created_at')
                    .order('created_at', { ascending: true });

                if (error) throw error;
                if (data) {
                    set({
                        carnet: data.map(row => ({
                            contactId: row.contact_id,
                            muted: row.muted,
                            addedAt: row.created_at,
                        })),
                    });
                }
            },

            getActiveCarnetIds: () => {
                return get().carnet.filter(c => !c.muted).map(c => c.contactId);
            },

            // --- Broadcast ---
            broadcastPostcard: async (params) => {
                const { error, data } = await supabase.rpc('broadcast_postcard', {
                    p_recto_url: params.rectoUrl,
                    p_selfie_url: params.selfieUrl,
                });

                if (error) throw error;
                return data as string; // post_id UUID
            },

            // --- Repost / Dismiss ---
            repostPostcard: async (postId: string, letterId: string) => {
                const { error } = await supabase.rpc('repost_postcard', { p_post_id: postId });
                if (error) throw error;
                const filtered = get().cachedLetters.filter(l => l.id !== letterId);
                set({ cachedLetters: filtered });
            },

            dismissPostcard: async (letterId: string) => {
                const { error } = await supabase
                    .from('letters')
                    .update({ dismissed_at: new Date().toISOString() })
                    .eq('id', letterId);
                if (error) throw error;
                const filtered = get().cachedLetters.filter(l => l.id !== letterId);
                set({ cachedLetters: filtered });
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

            // --- Onboarding ---
            setHasPostedFirst: (value: boolean) => set({ hasPostedFirst: value }),
        }),
        {
            name: 'postcards-storage',  // NEW key — won't conflict with old 'postal-storage'
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                cachedLetters: state.cachedLetters,
                cachedPosts: state.cachedPosts,
                cachedSenderMap: state.cachedSenderMap,
                carnet: state.carnet,
                hasPostedFirst: state.hasPostedFirst,
            }),
        }
    )
);