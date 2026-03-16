import * as Contacts from 'expo-contacts';
import * as Crypto from 'expo-crypto';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { supabase } from './supabase';

export interface DiscoveredContact {
    userId: string;
    phoneHash: string;
    localName: string;
    displayName: string | null;
}

export async function hashPhoneNumber(e164: string): Promise<string> {
    return await Crypto.digestStringAsync(Crypto.CryptoDigestAlgorithm.SHA256, e164);
}

export function normalizeToE164(raw: string, regionCode: string): string | null {
    try {
        const phoneNumber = parsePhoneNumberFromString(raw, regionCode as any);
        if (phoneNumber && phoneNumber.isValid()) {
            return phoneNumber.format('E.164');
        }
    } catch (e) {
        // Ignore parsing errors, return null
    }
    return null;
}

export async function registerPhoneHash(e164: string): Promise<void> {
    const hash = await hashPhoneNumber(e164);
    const { error } = await supabase.rpc('register_phone_hash', { hash });

    if (error) {
        if (error.message && error.message.includes('phone_hash_already_claimed')) {
            throw new Error('PHONE_ALREADY_CLAIMED');
        }
        throw error;
    }
}

export async function getDeviceContacts(): Promise<{ name: string; phoneNumbers: string[] }[]> {
    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
        return [];
    }

    const { data } = await Contacts.getContactsAsync({
        fields: [Contacts.Fields.PhoneNumbers],
    });

    const contacts: { name: string; phoneNumbers: string[] }[] = [];
    
    for (const contact of data) {
        if (contact.phoneNumbers && contact.phoneNumbers.length > 0) {
            const numbers = contact.phoneNumbers
                .filter(p => !!p.number)
                .map(p => p.number as string);

            if (numbers.length > 0) {
                contacts.push({
                    name: contact.name || 'Unknown',
                    phoneNumbers: numbers
                });
            }
        }
    }

    return contacts;
}

export async function discoverContacts(regionCode: string): Promise<DiscoveredContact[]> {
    const deviceContacts = await getDeviceContacts();
    const hashToName = new Map<string, string>();

    const hashPromises: Promise<void>[] = [];

    for (const contact of deviceContacts) {
        for (const number of contact.phoneNumbers) {
            const e164 = normalizeToE164(number, regionCode);
            if (e164) {
                hashPromises.push(
                    hashPhoneNumber(e164).then(hash => {
                        hashToName.set(hash, contact.name);
                    })
                );
            }
        }
    }

    await Promise.all(hashPromises);

    const hashes = Array.from(hashToName.keys());
    const BATCH_SIZE = 500;
    const discovered: DiscoveredContact[] = [];

    for (let i = 0; i < hashes.length; i += BATCH_SIZE) {
        const chunk = hashes.slice(i, i + BATCH_SIZE);
        const { data, error } = await supabase.rpc('match_contacts', { hashes: chunk });

        if (error) {
            console.error('Error matching contacts for chunk', error);
            throw error; // Or skip, but throwing is usually safer so the user knows it failed
        }

        if (data) {
            for (const result of data) {
                discovered.push({
                    userId: result.id,
                    phoneHash: result.phone_hash,
                    localName: hashToName.get(result.phone_hash) || 'Unknown',
                    displayName: result.display_name || null
                });
            }
        }
    }

    return discovered;
}
