import { create } from 'zustand';
import { supabase } from './supabase';

export type AppUser = {
    id: string;
    auth_id: string;
    address: string;
    address_lang: 'en' | 'fr';
    created_at: string;
};

export type Letter = {
    id: string;
    sender_id: string;
    recipient_address: string;
    recipient_id: string | null;
    body: string;
    signature: string | null;
    sent_at: string;
    opened_at: string | null;
};

export type AddressBookEntry = {
    id: string;
    owner_id: string;
    name: string;
    address: string;
    created_at: string;
};

interface AuthState {
    currentUser: AppUser | null;
    isLoading: boolean;
    signInAnonymously: () => Promise<void>;
    restoreSession: () => Promise<void>;
    createUser: (address: string, lang: 'en' | 'fr') => Promise<void>;
    loadCurrentUser: (authId: string) => Promise<void>;
    updateAddress: (newAddress: string, lang: 'en' | 'fr') => Promise<void>;
    updateLanguage: (lang: 'en' | 'fr') => Promise<void>;
    isAddressTaken: (address: string) => Promise<boolean>;

    localeOverride: 'en' | 'fr' | null;
    setLocaleOverride: (lang: 'en' | 'fr' | null) => void;

    // New Methods
    fetchReceivedLetters: () => Promise<Letter[]>;
    fetchSentLetters: () => Promise<Letter[]>;
    sendLetter: (body: string, recipientAddress: string) => Promise<void>;
    markLetterOpened: (letterId: string) => Promise<void>;
    loadUserById: (userId: string) => Promise<AppUser | null>;
    fetchAddressBook: () => Promise<AddressBookEntry[]>;
    addAddressBookEntry: (name: string, address: string) => Promise<void>;
    deleteAddressBookEntry: (entryId: string) => Promise<void>;
}

export const useStore = create<AuthState>((set, get) => ({
    currentUser: null,
    isLoading: true,
    localeOverride: null,

    setLocaleOverride: (lang) => set({ localeOverride: lang }),

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
        const normalized = address.trim().replace(/,/g, '').toLowerCase();
        const { data, error } = await supabase.from('users').select('address');
        if (error) throw error;

        return (data || []).some(existing =>
            existing.address.trim().replace(/,/g, '').toLowerCase() === normalized
        );
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
            .gte('sent_at', currentUser.created_at)
            .order('sent_at', { ascending: false });

        if (error) {
            console.error('Error fetching received letters', error);
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

    sendLetter: async (body: string, recipientAddress: string) => {
        const { currentUser } = get();
        if (!currentUser) throw new Error("No user");

        const newLetter = {
            sender_id: currentUser.id,
            recipient_address: recipientAddress,
            body,
            signature: null,
        };

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
}));
