import React, { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-controller';
import AddressBuilder, { ENGLISH_TYPES, FRENCH_TYPES } from '../components/AddressBuilder';
import { useTranslation } from '../lib/i18n';
import { useStore } from '../lib/store';
import { Theme } from '../theme';

export default function OnboardingScreen() {
    const [language, setLanguage] = useState<'en' | 'fr'>('en');
    const [number, setNumber] = useState('');
    const [name, setName] = useState('');
    const [selectedType, setSelectedType] = useState(ENGLISH_TYPES[0]);
    const [selectedParticle, setSelectedParticle] = useState('de la');

    const [nameError, setNameError] = useState<string | null>(null);
    const [submitError, setSubmitError] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const { signInAnonymously, isAddressTaken, createUser, setLocaleOverride } = useStore();
    const { t } = useTranslation();

    const toggleLanguage = () => {
        const newLang = language === 'en' ? 'fr' : 'en';
        setLanguage(newLang);
        setLocaleOverride(newLang);
        setSelectedType(newLang === 'fr' ? FRENCH_TYPES[0] : ENGLISH_TYPES[0]);
        setSelectedParticle('de la');
    };

    const assembledAddress = (() => {
        const num = number === '' ? '…' : number;
        const n = name === '' ? '…' : name.trim();

        if (language === 'fr') {
            const particle = selectedParticle === '—' ? '' : `${selectedParticle} `;
            return `${num}, ${selectedType} ${particle}${n}`;
        } else {
            return `${num}, ${n} ${selectedType}`;
        }
    })();

    const isValid = (() => {
        const num = parseInt(number, 10);
        if (isNaN(num) || num < 1 || num > 999) return false;
        const trimmed = name.trim();
        if (trimmed.length < 2 || trimmed.length > 20) return false;
        if (nameError) return false;
        return true;
    })();

    const handleConfirm = async () => {
        if (!isValid) return;
        setIsSubmitting(true);
        setSubmitError(null);

        try {
            await signInAnonymously();
            const taken = await isAddressTaken(assembledAddress);

            if (taken) {
                setSubmitError(t('address.error.taken'));
                setIsSubmitting(false);
                return;
            }

            await createUser(assembledAddress, language);
            // Navigation is handled automatically by the _layout reacting to currentUser change
        } catch (e) {
            setSubmitError(t('address.error.generic'));
            setIsSubmitting(false);
        }
    };

    return (
        <KeyboardAwareScrollView
            style={styles.container}
            contentContainerStyle={styles.content}
            bottomOffset={Platform.OS === 'ios' ? 40 : 0}
        >
            <View style={styles.langRow}>
                <Text style={styles.title}>{t('onboarding.title')}</Text>
                <TouchableOpacity onPress={toggleLanguage}>
                    <Text style={styles.langFlag}>{language === 'fr' ? '🇫🇷' : '🇬🇧'}</Text>
                </TouchableOpacity>
            </View>

            <AddressBuilder
                language={language}
                setLanguage={setLanguage}
                number={number}
                setNumber={setNumber}
                name={name}
                setName={setName}
                selectedType={selectedType}
                setSelectedType={setSelectedType}
                selectedParticle={selectedParticle}
                setSelectedParticle={setSelectedParticle}
                nameError={nameError}
                setNameError={setNameError}
            />

            <Text style={styles.helperText}>
                {t('onboarding.helper')}
            </Text>

            {submitError && <Text style={[styles.errorText, { marginBottom: 16 }]}>{submitError}</Text>}

            <TouchableOpacity
                style={[styles.button, (!isValid || isSubmitting) && styles.buttonDisabled]}
                onPress={handleConfirm}
                disabled={!isValid || isSubmitting}
            >
                {isSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" style={{ marginRight: 8 }} />
                ) : null}
                <Text style={styles.buttonText}>{t('onboarding.confirm')}</Text>
            </TouchableOpacity>
        </KeyboardAwareScrollView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: Theme.colors.background,
    },
    content: {
        padding: Theme.sizes.horizontalPadding,
        paddingTop: 60,
        paddingBottom: 40,
    },
    langRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 24,
    },
    langFlag: {
        fontSize: 24,
    },
    title: {
        fontFamily: Theme.fonts.body,
        fontSize: 28,
        color: Theme.colors.text,
    },
    helperText: {
        fontSize: 13,
        color: Theme.colors.secondary,
        marginBottom: 24,
    },
    errorText: {
        fontSize: 13,
        color: Theme.colors.accent,
        marginTop: 4,
    },
    button: {
        flexDirection: 'row',
        backgroundColor: Theme.colors.accent,
        borderRadius: 12,
        padding: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    buttonDisabled: {
        backgroundColor: Theme.colors.secondary,
    },
    buttonText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '600',
    },
});
