import * as Localization from 'expo-localization';
import { useStore } from './store';

// Dictionary definitions
const en = {
    // Onboarding & Address Builder
    'onboarding.title': 'Pick your address',
    'onboarding.helper': 'This is how people will find you. Give it to someone you trust.',
    'onboarding.confirm': 'This is my address',
    'address.error.taken': 'Someone already lives there. Try another address.',
    'address.error.generic': 'Something went wrong. Try again.',
    'address.error.invalid': 'Use a real word — this is a real address.',
    'address.number': 'Number',
    'address.type': 'Type',
    'address.particle': 'Particle',
    'address.name': 'Name',
    'address.preview': 'Your address',

    // New Onboarding (V2)
    'onboarding.welcome': 'Welcome to Postcards',
    'onboarding.namePrompt': 'What should we call you?',
    'onboarding.namePlaceholder': 'Your name',
    'onboarding.continue': 'Continue',
    'onboarding.cameraTitle': 'Enable Camera',
    'onboarding.cameraSubtitle': 'Postcards uses your camera to capture what you see and share it with the world.',
    'onboarding.allowCamera': 'Allow Camera Access',
    'onboarding.skipCamera': 'Skip for now',

    // Common
    'common.cancel': 'Cancel',
    'common.done': 'Done',
    'common.loading': 'Loading...',

    // Compose Flow
    'compose.prompt': 'What do you want to say?',
    'compose.next': 'Next',
    'compose.to': 'To',
    'compose.from': 'From',
    'compose.recipientName': "Recipient's name",
    'compose.recipientAddress': "Recipient's address",
    'compose.yourName': 'Your name',
    'compose.send': 'Send',
    'compose.sentTitle': 'Letter sent',
    'compose.sent': 'Your letter is on its way.',
    'compose.error': "Couldn't send. Try again.",
    'compose.sending': 'Your letter is on its way…',
    'compose.turnOver': 'Turn over →',
    'compose.turnBack': '← Turn back',
    'compose.addressHint': 'Make sure the address matches exactly.',
    'compose.placeholderToName': 'Their name',
    'compose.placeholderToAddress': '3, Flower Road',
    'compose.placeholderFromName': 'Your name',

    'compose.coldOpen': 'Write a letter to someone you love.',
    'compose.tapToWrite': 'Tap to write',
    'compose.pickImage': 'Add a photo',
    'compose.tapToAddPhoto': 'Tap to add a photo',
    'compose.imagePickerTitle': 'Add a photo',
    'compose.camera': 'Take a photo',
    'compose.library': 'Choose from library',
    'compose.discard': 'Discard this postcard?',
    'compose.discardConfirm': 'Discard',
    'compose.noAddress': 'Share card',
    'share.promptTitle': 'Send this postcard',
    'share.promptMessage': 'How would you like to share this postcard?',
    'share.iMessage': 'iMessage (3D)',
    'share.otherMessenger': 'Other messenger',
    'share.iMessageText': 'I sent you a postcard! Download Postal to reply.',

    // Main Stack
    'stack.empty': 'Your postcards are out in the world...',
    'stack.unknownSender': 'Unknown sender',

    // Outbox
    'outbox.title': 'Outbox',
    'outbox.empty': 'Your postcards will appear here',

    // Settings
    'settings.title': 'Settings',
    'settings.name': 'Name',
    'settings.language': 'Language',
    'settings.yourAddress': 'Your address',
    'settings.changeAddress': 'Change address',
    'settings.alert.title': 'Change your address?',
    'settings.alert.message': "Anyone who has your current address written down won't be able to reach you anymore. You'll need to give them your new one — in person, like the first time.",
    'settings.alert.cancel': 'Keep my address',
    'settings.alert.confirm': 'Change it',
    'settings.saveNewAddress': 'Save new address',

    // Capture / Preview
    'capture.retake': 'Retake',
    'capture.send': 'Send',
    'capture.flipHint': 'Tap to flip',
    'capture.posting': 'Posting...',

    // Inspect — repost / dismiss
    'inspect.repost': 'Repost',
    'inspect.dismiss': 'Dismiss',

    // Post Log
    'log.title': 'Log',
    'log.reposted': 'reposted',
    'log.empty': 'No activity yet.',
};

const fr = {
    // Onboarding & Address Builder
    'onboarding.title': 'Choisis ton adresse',
    'onboarding.helper': "C'est comme ça qu'on te trouvera. Donne-la à quelqu'un en qui tu as confiance.",
    'onboarding.confirm': "C'est mon adresse",
    'address.error.taken': "Quelqu'un habite déjà là. Essaie une autre adresse.",
    'address.error.generic': "Quelque chose n'a pas marché. Réessaie.",
    'address.error.invalid': "Utilise un vrai mot — c'est une vraie adresse.",
    'address.number': 'Numéro',
    'address.type': 'Type',
    'address.particle': 'Particule',
    'address.name': 'Nom',
    'address.preview': 'Ton adresse',

    // New Onboarding (V2)
    'onboarding.welcome': 'Bienvenue sur Postcards',
    'onboarding.namePrompt': 'Comment devons-nous vous appeler ?',
    'onboarding.namePlaceholder': 'Votre nom',
    'onboarding.continue': 'Continuer',
    'onboarding.cameraTitle': 'Activer la caméra',
    'onboarding.cameraSubtitle': 'Postcards utilise votre caméra pour capturer ce que vous voyez et le partager avec le monde.',
    'onboarding.allowCamera': 'Autoriser la caméra',
    'onboarding.skipCamera': 'Passer pour le moment',

    // Common
    'common.cancel': 'Annuler',
    'common.done': 'Terminé',
    'common.loading': 'Chargement...',

    // Compose Flow
    'compose.prompt': "Qu'est-ce que tu veux dire ?",
    'compose.next': 'Suivant',
    'compose.to': 'À',
    'compose.from': 'De',
    'compose.recipientName': 'Nom du destinataire',
    'compose.recipientAddress': 'Adresse du destinataire',
    'compose.yourName': 'Ton nom',
    'compose.send': 'Envoyer',
    'compose.sentTitle': 'Lettre envoyée',
    'compose.sent': 'Ta lettre est en chemin.',
    'compose.error': "Impossible d'envoyer. Réessaie.",
    'compose.sending': 'Ta lettre est en chemin…',
    'compose.turnOver': 'Retourner →',
    'compose.turnBack': '← Retourner',
    'compose.addressHint': "Vérifie bien que l'adresse est correcte.",
    'compose.placeholderToName': 'Son nom',
    'compose.placeholderToAddress': '3, Rue de la Fleur',
    'compose.placeholderFromName': 'Ton nom',

    'compose.coldOpen': 'Écris à quelqu\'un que tu aimes.',
    'compose.tapToWrite': 'Touche pour écrire',
    'compose.pickImage': 'Ajouter une photo',
    'compose.tapToAddPhoto': 'Touche pour ajouter une photo',
    'compose.imagePickerTitle': 'Ajouter une photo',
    'compose.camera': 'Prendre une photo',
    'compose.library': 'Choisir dans la galerie',
    'compose.discard': 'Supprimer cette carte ?',
    'compose.discardConfirm': 'Supprimer',
    'compose.noAddress': 'Partager la carte',
    'share.promptTitle': 'Envoyer la carte',
    'share.promptMessage': 'Comment veux-tu partager cette carte postale ?',
    'share.iMessage': 'iMessage (3D)',
    'share.otherMessenger': 'Autre messagerie',
    'share.iMessageText': "Je t'ai envoyé une carte postale ! Télécharge Postal pour y répondre.",

    // Main Stack
    'stack.empty': 'Tes cartes postales parcourent le monde...',
    'stack.unknownSender': 'Expéditeur inconnu',

    // Outbox
    'outbox.title': 'Envois',
    'outbox.empty': 'Vos cartes postales apparaîtront ici',

    // Settings
    'settings.title': 'Réglages',
    'settings.name': 'Nom',
    'settings.language': 'Langue',
    'settings.yourAddress': 'Ton adresse',
    'settings.changeAddress': "Changer d'adresse",
    'settings.alert.title': "Changer d'adresse ?",
    'settings.alert.message': "Ceux qui ont ton adresse actuelle ne pourront plus t'écrire. Il faudra leur donner la nouvelle — en personne, comme la première fois.",
    'settings.alert.cancel': 'Garder mon adresse',
    'settings.alert.confirm': 'La changer',
    'settings.saveNewAddress': 'Enregistrer la nouvelle adresse',

    // Capture / Preview
    'capture.retake': 'Reprendre',
    'capture.send': 'Envoyer',
    'capture.flipHint': 'Touche pour retourner',
    'capture.posting': 'Envoi en cours...',

    // Inspect — repost / dismiss
    'inspect.repost': 'Reposter',
    'inspect.dismiss': 'Supprimer',

    // Post Log
    'log.title': 'Journal',
    'log.reposted': 'a reposté',
    'log.empty': 'Aucune activité pour le moment.',
};

const translations = { en, fr };
type TranslationKey = keyof typeof en;
type SupportedLocale = 'en' | 'fr';

export function useTranslation() {
    const { currentUser, localeOverride } = useStore();

    // 1. Check user preference if logged in
    // 2. Check override state (for onboarding)
    // 3. Fallback to device locale
    // 4. Fallback to 'en'
    let locale: SupportedLocale = 'en';

    if (currentUser?.lang) {
        locale = currentUser.lang as SupportedLocale;
    } else if (localeOverride) {
        locale = localeOverride as SupportedLocale;
    } else {
        // getLocales() returns an array ordered by user preference
        const deviceLocales = Localization.getLocales();
        if (deviceLocales && deviceLocales.length > 0) {
            const languageCode = deviceLocales[0].languageCode;
            if (languageCode?.startsWith('fr')) {
                locale = 'fr';
            }
        }
    }

    const t = (key: TranslationKey): string => {
        return translations[locale][key] || translations['en'][key] || key;
    };

    return { t, locale };
}
