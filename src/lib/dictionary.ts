import blocklist from '../assets/blocklist.json';

const blockedWords: Set<string> = new Set(
    (blocklist as string[]).map(w => w.toLowerCase())
);

// Known short particles that are valid alone
const ALLOWED_SHORT = new Set([
    'a', 'à', 'au', 'de', 'du', 'la', 'le', 'les', 'des', 'l', 'aux',
    'y', 'en', 'un', 'une', 'the', 'of', 'on', 'in', 'by',
]);

function hasVowel(word: string): boolean {
    return /[aeiouyàâäéèêëïîôùûüœæ]/i.test(word);
}

function hasExcessiveRepeats(word: string): boolean {
    return /(.)\1{2,}/.test(word);
}

function isBlocked(word: string): boolean {
    return blockedWords.has(word.toLowerCase());
}

export function validateAddressName(name: string, lang: 'en' | 'fr'): {
    isValid: boolean;
    error: string | null;
} {
    const trimmed = name.trim();
    if (trimmed.length < 2) {
        return { isValid: false, error: null }; // too short, no error shown yet
    }

    const words = trimmed.split(/\s+/);

    for (const word of words) {
        // Check blocklist
        if (isBlocked(word)) {
            return {
                isValid: false,
                error: lang === 'fr' ? 'Bien tenté.' : 'Nice try.',
            };
        }

        // Single char words must be known particles
        if (word.length === 1 && !ALLOWED_SHORT.has(word.toLowerCase())) {
            return {
                isValid: false,
                error: lang === 'fr'
                    ? 'Utilise un vrai mot.'
                    : 'Use a real word.',
            };
        }

        // Must contain a vowel (catches consonant-mashing)
        if (word.length > 1 && !hasVowel(word)) {
            return {
                isValid: false,
                error: lang === 'fr'
                    ? 'Utilise un vrai mot.'
                    : 'Use a real word.',
            };
        }

        // No excessive character repetition (catches "aaaa", "brrrrr")
        if (hasExcessiveRepeats(word)) {
            return {
                isValid: false,
                error: lang === 'fr'
                    ? 'Utilise un vrai mot.'
                    : 'Use a real word.',
            };
        }
    }

    return { isValid: true, error: null };
}
