import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import { registerForPushNotifications } from './notifications';
import { supabase } from './supabase';

export type AppUser = {
    id: string;
    auth_id: string;
    address: string;
    address_lang: 'en' | 'fr';
    created_at: string;
    push_token: string | null;
};

export type Letter = {
    id: string;
    sender_id: string;
    recipient_address: string;
    recipient_id: string | null;
    body: string;
    signature: string | null;
    image_url: string | null;
    from_name: string | null;
    to_name: string | null;
    sent_at: string;
    opened_at: string | null;
    delivers_at: string | null;
    returned_at: string | null;
    notified: boolean;
};

export type AddressBookEntry = {
    id: string;
    owner_id: string;
    name: string;
    address: string;
    created_at: string;
};

export type ComposePrefill = {
    toName?: string;
    toAddress?: string;
} | null;

interface AuthState {
    currentUser: AppUser | null;
    isLoading: boolean;
    isSyncing: boolean;
    signInAnonymously: () => Promise<void>;
    restoreSession: () => Promise<void>;
    createUser: (address: string, lang: 'en' | 'fr') => Promise<void>;
    loadCurrentUser: (authId: string) => Promise<void>;
    updateAddress: (newAddress: string, lang: 'en' | 'fr') => Promise<void>;
    updateLanguage: (lang: 'en' | 'fr') => Promise<void>;
    isAddressTaken: (address: string) => Promise<boolean>;

    localeOverride: 'en' | 'fr' | null;
    setLocaleOverride: (lang: 'en' | 'fr' | null) => void;

    cachedLetters: (Letter & { _type: 'received' | 'returned' })[];
    cachedSenderMap: Record<string, string>;
    syncLetters: () => Promise<any[]>;

    // New Methods
    fetchReceivedLetters: () => Promise<Letter[]>;
    fetchSentLetters: () => Promise<Letter[]>;
    fetchReturnedLetters: () => Promise<Letter[]>;
    sendLetter: (body: string, recipientAddress: string, imageUrl: string | null, fromName: string | null, toName: string | null) => Promise<void>;
    markLetterOpened: (letterId: string) => Promise<void>;
    loadUserById: (userId: string) => Promise<AppUser | null>;
    fetchAddressBook: () => Promise<AddressBookEntry[]>;
    addAddressBookEntry: (name: string, address: string) => Promise<void>;
    deleteAddressBookEntry: (entryId: string) => Promise<void>;

    composePrefill: ComposePrefill;
    setComposePrefill: (prefill: ComposePrefill) => void;
    clearComposePrefill: () => void;
}

export const useStore = create<AuthState>()(
    persist(
        (set, get) => ({
            currentUser: null,
            isLoading: true,
            isSyncing: false,
            localeOverride: null,
            composePrefill: null,
            cachedLetters: [],
            cachedSenderMap: {},

            setLocaleOverride: (lang) => set({ localeOverride: lang }),
            setComposePrefill: (prefill) => set({ composePrefill: prefill }),
            clearComposePrefill: () => set({ composePrefill: null }),

            signInAnonymously: async () => {
                try {
                    const { error } = await supabase.auth.signInAnonymously();
                    if (error) throw error;
                } catch (e) {
                    console.error('Error signing in anonymously', e);
                    throw e;
                }
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
                        if (error.code !== 'PGRST116') {
                            console.error('Error loading current user', error);
                        }
                        set({ currentUser: null, isLoading: false });
                    } else {
                        set({ currentUser: data as AppUser, isLoading: false });
                        // Register push token (fire and forget)
                        registerForPushNotifications(data.id).catch(console.error);
                    }
                } catch (e) {
                    console.error('Exception loading current user', e);
                    set({ currentUser: null, isLoading: false });
                }
            },

            createUser: async (address: string, lang: 'en' | 'fr') => {
                try {
                    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
                    if (sessionError || !session) throw new Error('No active auth session');

                    const newUser = {
                        auth_id: session.user.id,
                        address,
                        address_lang: lang,
                    };

                    const { data, error } = await supabase
                        .from('users')
                        .insert(newUser)
                        .select()
                        .single();

                    if (error) throw error;
                    set({ currentUser: data as AppUser });
                    // Register push token (fire and forget)
                    registerForPushNotifications(data.id).catch(console.error);
                } catch (e) {
                    console.error('Error creating user', e);
                    throw e;
                }
            },

            updateAddress: async (newAddress: string, lang: 'en' | 'fr') => {
                const { currentUser } = get();
                if (!currentUser) return;
                try {
                    const { error } = await supabase
                        .from('users')
                        .update({ address: newAddress, address_lang: lang })
                        .eq('id', currentUser.id);

                    if (error) throw error;
                    set({
                        currentUser: {
                            ...currentUser,
                            address: newAddress,
                            address_lang: lang,
                        },
                    });
                } catch (e) {
                    console.error('Error updating address', e);
                    throw e;
                }
            },

            updateLanguage: async (lang: 'en' | 'fr') => {
                const { currentUser } = get();
                if (!currentUser) return;
                try {
                    const { error } = await supabase
                        .from('users')
                        .update({ address_lang: lang })
                        .eq('id', currentUser.id);

                    if (error) throw error;
                    set({
                        currentUser: {
                            ...currentUser,
                            address_lang: lang,
                        },
                    });
                } catch (e) {
                    console.error('Error updating language', e);
                    throw e;
                }
            },

            isAddressTaken: async (address: string) => {
                const { data, error } = await supabase.rpc('is_address_taken', {
                    check_address: address,
                });
                if (error) throw error;
                return data === true;
            },

            // --- New Methods for Tab Data ---

            fetchReceivedLetters: async () => {
                const { currentUser } = get();
                if (!currentUser) return [];

                // TODO: server-side cron to clean up undelivered letters older than 30 days
                const { data, error } = await supabase
                    .from('letters')
                    .select('*')
                    .eq('recipient_id', currentUser.id)
                    .lte('delivers_at', new Date().toISOString())
                    .gte('sent_at', currentUser.created_at)
                    .order('sent_at', { ascending: false });

                if (error) {
                    console.error('Error fetching received letters', error);
                    throw error;
                }
                return data as Letter[];
            },

            fetchReturnedLetters: async () => {
                const { currentUser } = get();
                if (!currentUser) return [];

                const { data, error } = await supabase
                    .from('letters')
                    .select('*')
                    .eq('sender_id', currentUser.id)
                    .not('returned_at', 'is', null)
                    .order('returned_at', { ascending: false });

                if (error) {
                    console.error('Error fetching returned letters', error);
                    throw error;
                }
                return data as Letter[];
            },

            fetchSentLetters: async () => {
                const { currentUser } = get();
                if (!currentUser) return [];

                const { data, error } = await supabase
                    .from('letters')
                    .select('*')
                    .eq('sender_id', currentUser.id)
                    .order('sent_at', { ascending: false });

                if (error) {
                    console.error('Error fetching sent letters', error);
                    throw error;
                }
                return data as Letter[];
            },

            sendLetter: async (body: string, recipientAddress: string, imageUrl: string | null, fromName: string | null, toName: string | null) => {
                const { currentUser } = get();
                if (!currentUser) throw new Error("No user");

                const newLetter: any = {
                    sender_id: currentUser.id,
                    recipient_address: recipientAddress,
                    body,
                    signature: null,
                };

                if (imageUrl) {
                    newLetter.image_url = imageUrl;
                }

                if (fromName && fromName.trim()) {
                    newLetter.from_name = fromName.trim();
                }
                if (toName && toName.trim()) {
                    newLetter.to_name = toName.trim();
                }

                const { error } = await supabase
                    .from('letters')
                    .insert(newLetter);

                if (error) {
                    console.error("Error sending letter", error);
                    throw error;
                }
            },

            markLetterOpened: async (letterId: string) => {
                const { error } = await supabase
                    .from('letters')
                    .update({ opened_at: new Date().toISOString() })
                    .eq('id', letterId);

                if (error) {
                    console.error("Error marking letter opened", error);
                    throw error;
                }

                // Update local cache immediately
                const { cachedLetters } = get();
                set({
                    cachedLetters: cachedLetters.map(l =>
                        l.id === letterId ? { ...l, opened_at: new Date().toISOString() } : l
                    )
                });
            },

            syncLetters: async () => {
                if (get().isSyncing) return [];
                set({ isSyncing: true });

                const { currentUser, cachedLetters, cachedSenderMap } = get();
                if (!currentUser) {
                    set({ isSyncing: false });
                    return [];
                }

                try {
                    // 1. Find the highest delivery timestamps
                    const receivedLetters = cachedLetters.filter(l => l._type === 'received');
                    const returnedLetters = cachedLetters.filter(l => l._type === 'returned');

                    const lastReceivedDate = receivedLetters.reduce((max, l) => {
                        if (!l.delivers_at) return max;
                        return l.delivers_at > max ? l.delivers_at : max;
                    }, currentUser.created_at);

                    const lastReturnedDate = returnedLetters.reduce((max, l) => {
                        if (!l.returned_at) return max;
                        return l.returned_at > max ? l.returned_at : max;
                    }, currentUser.created_at); // Symmetric fallback

                    // 2. Fetch ONLY new letters (Delta Sync)
                    const [newReceivedResult, newReturnedResult] = await Promise.all([
                        supabase
                            .from('letters')
                            .select('*')
                            .eq('recipient_id', currentUser.id)
                            .lte('delivers_at', new Date().toISOString())
                            .gt('delivers_at', lastReceivedDate)
                            .order('delivers_at', { ascending: false }),
                        supabase
                            .from('letters')
                            .select('*')
                            .eq('sender_id', currentUser.id)
                            .not('returned_at', 'is', null)
                            .gt('returned_at', lastReturnedDate)
                            .order('returned_at', { ascending: false }),
                    ]);

                    if (newReceivedResult.error) throw newReceivedResult.error;
                    if (newReturnedResult.error) throw newReturnedResult.error;

                    const newReceived = (newReceivedResult.data || []) as Letter[];
                    const newReturned = (newReturnedResult.data || []) as Letter[];

                    if (newReceived.length === 0 && newReturned.length === 0) {
                        return []; // Cache is perfectly up to date
                    }

                    const taggedNewLetters = [
                        ...newReceived.map(l => ({ ...l, _type: 'received' as const })),
                        ...newReturned.map(l => ({ ...l, _type: 'returned' as const })),
                    ];

                    // 3. Batch Fetch Missing Senders (Fixes N+1 issue)
                    const existingMap = { ...cachedSenderMap };
                    const newSenderIds = [...new Set(newReceived.map(l => l.sender_id))]
                        .filter(id => !existingMap[id]);

                    if (newSenderIds.length > 0) {
                        const { data: senders } = await supabase
                            .from('users')
                            .select('id, address')
                            .in('id', newSenderIds);

                        if (senders) {
                            senders.forEach((s: any) => { existingMap[s.id] = s.address; });
                        }
                    }

                    // 4. Merge new letters with cache and sort by sent_at
                    const freshCache = get().cachedLetters;
                    const existingIds = new Set(freshCache.map(l => l.id));
                    const trulyNewLetters = taggedNewLetters.filter(l => !existingIds.has(l.id));

                    const combinedLetters = [...trulyNewLetters, ...freshCache]
                        .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime());

                    // 5. Update Store (persist auto-saves this to AsyncStorage)
                    set({
                        cachedLetters: combinedLetters,
                        cachedSenderMap: existingMap,
                    });

                    return trulyNewLetters;
                } catch (e) {
                    console.error('Error in delta sync', e);
                    return [];
                } finally {
                    set({ isSyncing: false });
                }
            },

            loadUserById: async (userId: string) => {
                const { data, error } = await supabase
                    .from('users')
                    .select('*')
                    .eq('id', userId)
                    .single();

                if (error) {
                    if (error.code !== 'PGRST116') console.error("Error loading user by id", error);
                    return null;
                }
                return data as AppUser;
            },

            fetchAddressBook: async () => {
                const { currentUser } = get();
                if (!currentUser) return [];

                const { data, error } = await supabase
                    .from('address_book')
                    .select('*')
                    .eq('owner_id', currentUser.id)
                    .order('created_at', { ascending: true });

                if (error) {
                    console.error("Error fetching address book", error);
                    throw error;
                }
                return data as AddressBookEntry[];
            },

            addAddressBookEntry: async (name: string, address: string) => {
                const { currentUser } = get();
                if (!currentUser) throw new Error("No user");

                const { error } = await supabase
                    .from('address_book')
                    .insert({
                        owner_id: currentUser.id,
                        name,
                        address
                    });

                if (error) {
                    console.error("Error adding address book entry", error);
                    throw error;
                }
            },

            deleteAddressBookEntry: async (entryId: string) => {
                const { error } = await supabase
                    .from('address_book')
                    .delete()
                    .eq('id', entryId);

                if (error) {
                    console.error("Error deleting address book entry", error);
                    throw error;
                }
            },
        }), // End of store functions
        {
            name: 'postal-storage',
            storage: createJSONStorage(() => AsyncStorage),
            partialize: (state) => ({
                cachedLetters: state.cachedLetters,
                cachedSenderMap: state.cachedSenderMap,
            }),
        }
    )
);
