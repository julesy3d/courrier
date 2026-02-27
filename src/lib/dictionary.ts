import enWords from '../assets/words-en.json';
import frWords from '../assets/words-fr.json';

const dictionaries: Record<string, Set<string>> = {
    en: new Set(enWords as string[]),
    fr: new Set(frWords as string[]),
};

const frenchParticles = new Set([
    'de', 'du', 'la', 'le', 'les', 'des', 'l', 'aux'
]);

export function validateWord(word: string, language: string): boolean {
    const cleanWord = word.trim().toLowerCase();
    if (cleanWord.length === 0) return true;

    if (language === 'fr' && frenchParticles.has(cleanWord)) {
        return true;
    }

    const lang = language === 'fr' ? 'fr' : 'en';
    return dictionaries[lang]?.has(cleanWord) || false;
}

export function validateName(name: string, language: string): boolean {
    const words = name.split(' ');
    return words.every(w => validateWord(w, language));
}
